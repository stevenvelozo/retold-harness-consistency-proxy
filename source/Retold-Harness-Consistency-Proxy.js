/**
* Retold Harness Consistency Proxy
*
* A splitter HTTP proxy that forwards every incoming request to all running
* retold-harness backends in parallel, compares their responses, and returns
* a JSON envelope showing agreement or differences.
*
* Usage:
*
*   # Explicit backends
*   node source/Retold-Harness-Consistency-Proxy.js --backends sqlite:8086,mysql:8087 --port 9090
*
*   # Auto-discover running backends on default ports
*   node source/Retold-Harness-Consistency-Proxy.js --discover --port 9090
*
* @author Steven Velozo <steven@velozo.com>
*/
const libHttp = require('http');
const libFable = require('fable');

const libProviderDiscovery = require('./Provider-Discovery.js');
const libRequestFanout = require('./Service-RequestFanout.js');
const libResponseComparator = require('./Service-ResponseComparator.js');

class ConsistencyProxy
{
	constructor(pOptions)
	{
		this.options = Object.assign(
			{
				port: 9090,
				backends: {},
				discover: false
			}, pOptions);

		// Create a Fable instance for service management
		this._fable = new libFable(
			{
				Product: 'RetoldHarnessConsistencyProxy',
				ProductVersion: '1.0.0',
				LogStreams:
				[
					{
						streamtype: 'console',
						level: 'info'
					}
				]
			});

		// Register services
		this._fable.serviceManager.addServiceType('RequestFanout', libRequestFanout);
		this._fable.serviceManager.instantiateServiceProvider('RequestFanout');
		this._fable.serviceManager.addServiceType('ResponseComparator', libResponseComparator);
		this._fable.serviceManager.instantiateServiceProvider('ResponseComparator');

		this._server = null;
	}

	/**
	* Start the proxy server.
	*
	* @param {function} fCallback - (pError)
	*/
	start(fCallback)
	{
		let tmpSelf = this;

		// Resolve backends
		this._resolveBackends(
			(pBackends) =>
			{
				let tmpBackendKeys = Object.keys(pBackends);

				if (tmpBackendKeys.length === 0)
				{
					tmpSelf._fable.log.error('No backends available. Use --backends or --discover to configure.');
					return fCallback('No backends available');
				}

				tmpSelf._fable.RequestFanout.setBackends(pBackends);

				tmpSelf._fable.log.info(`Backends configured: ${tmpBackendKeys.map((pKey) => `${pKey}:${pBackends[pKey]}`).join(', ')}`);

				// Create HTTP server
				tmpSelf._server = libHttp.createServer(
					(pRequest, pResponse) =>
					{
						tmpSelf._handleRequest(pRequest, pResponse);
					});

				tmpSelf._server.listen(tmpSelf.options.port,
					() =>
					{
						tmpSelf._fable.log.info(`Consistency proxy listening on port ${tmpSelf.options.port}`);
						tmpSelf._fable.log.info(`Forwarding to ${tmpBackendKeys.length} backend(s): ${tmpBackendKeys.join(', ')}`);

						return fCallback(null);
					});

				tmpSelf._server.on('error',
					(pError) =>
					{
						tmpSelf._fable.log.error(`Server error: ${pError.message}`);
					});
			});
	}

	/**
	* Stop the proxy server.
	*
	* @param {function} fCallback
	*/
	stop(fCallback)
	{
		if (this._server)
		{
			this._server.close(
				() =>
				{
					this._fable.log.info('Consistency proxy stopped.');
					return fCallback();
				});
		}
		else
		{
			return fCallback();
		}
	}

	/**
	* Resolve backend configuration from CLI args or auto-discovery.
	*
	* @param {function} fCallback - (pBackends)
	*/
	_resolveBackends(fCallback)
	{
		if (this.options.backends && Object.keys(this.options.backends).length > 0)
		{
			return fCallback(this.options.backends);
		}

		if (this.options.discover)
		{
			this._fable.log.info('Auto-discovering backends on default ports...');

			libProviderDiscovery.discoverBackends(
				(pBackends) =>
				{
					let tmpCount = Object.keys(pBackends).length;
					this._fable.log.info(`Discovered ${tmpCount} running backend(s).`);
					return fCallback(pBackends);
				});
		}
		else
		{
			return fCallback({});
		}
	}

	/**
	* Handle an incoming HTTP request.
	*
	* @param {object} pRequest - Incoming HTTP request
	* @param {object} pResponse - HTTP response to write
	*/
	_handleRequest(pRequest, pResponse)
	{
		let tmpSelf = this;

		// Collect request body
		let tmpBodyChunks = [];

		pRequest.on('data', (pChunk) =>
		{
			tmpBodyChunks.push(pChunk);
		});

		pRequest.on('end', () =>
		{
			let tmpBody = tmpBodyChunks.length > 0
				? Buffer.concat(tmpBodyChunks).toString('utf8')
				: null;

			let tmpMethod = pRequest.method;
			let tmpPath = pRequest.url;
			let tmpHeaders = pRequest.headers;

			tmpSelf._fable.log.info(`${tmpMethod} ${tmpPath} → fan-out to ${Object.keys(tmpSelf._fable.RequestFanout.getBackends()).length} backend(s)`);

			// Fan out to all backends
			tmpSelf._fable.RequestFanout.fanout(tmpMethod, tmpPath, tmpHeaders, tmpBody,
				(pError, pResults) =>
				{
					if (pError)
					{
						pResponse.writeHead(502, { 'Content-Type': 'application/json' });
						pResponse.end(JSON.stringify(
							{
								error: pError,
								request: { method: tmpMethod, path: tmpPath }
							}));
						return;
					}

					// Compare responses
					let tmpComparison = tmpSelf._fable.ResponseComparator.compare(pResults);

					// Build the envelope
					let tmpEnvelope =
					{
						request:
						{
							method: tmpMethod,
							path: tmpPath,
							timestamp: new Date().toISOString()
						},
						consistent: tmpComparison.consistent,
						providerCount: tmpComparison.providerCount,
						providers: {},
						differences: tmpComparison.differences,
						summary: tmpComparison.summary
					};

					// Add per-provider results
					let tmpResultKeys = Object.keys(pResults);

					for (let i = 0; i < tmpResultKeys.length; i++)
					{
						let tmpKey = tmpResultKeys[i];
						let tmpResult = pResults[tmpKey];

						tmpEnvelope.providers[tmpKey] =
						{
							status: tmpResult.status,
							timingMs: tmpResult.timingMs,
							body: tmpResult.body,
							error: tmpResult.error
						};
					}

					// Log consistency status
					if (tmpComparison.consistent)
					{
						tmpSelf._fable.log.info(`  ✓ ${tmpComparison.summary}`);
					}
					else
					{
						tmpSelf._fable.log.warn(`  ✗ ${tmpComparison.summary}`);
					}

					// Send envelope
					pResponse.writeHead(200, { 'Content-Type': 'application/json' });
					pResponse.end(JSON.stringify(tmpEnvelope, null, '\t'));
				});
		});
	}
}

// Export the class for programmatic use
module.exports = ConsistencyProxy;

// If run directly, start the proxy
if (require.main === module)
{
	let tmpArgs = libProviderDiscovery.parseArgv();

	let tmpProxy = new ConsistencyProxy(
		{
			port: tmpArgs.port,
			backends: tmpArgs.backends,
			discover: tmpArgs.discover || (!tmpArgs.backends || Object.keys(tmpArgs.backends).length === 0)
		});

	tmpProxy.start(
		(pError) =>
		{
			if (pError)
			{
				console.error(`Failed to start consistency proxy: ${pError}`);
				process.exit(1);
			}
		});

	// Graceful shutdown
	process.on('SIGTERM', () =>
	{
		tmpProxy.stop(() => process.exit(0));
	});

	process.on('SIGINT', () =>
	{
		tmpProxy.stop(() => process.exit(0));
	});
}
