/**
* Request Fan-out Service
*
* Fable service that sends an identical HTTP request to multiple harness
* backends in parallel and collects all responses with timing data.
*
* @author Steven Velozo <steven@velozo.com>
*/
const libFableServiceProviderBase = require('fable-serviceproviderbase');
const libHttp = require('http');

class RequestFanout extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'RequestFanout';

		// Map of { providerKey: port } — set by the proxy server
		this._backends = {};

		// Per-request timeout in milliseconds
		this._timeoutMs = 10000;
	}

	/**
	* Set the backend map.
	*
	* @param {object} pBackends - { providerKey: port, ... }
	*/
	setBackends(pBackends)
	{
		this._backends = pBackends || {};
	}

	/**
	* Get the current backend map.
	*
	* @returns {object}
	*/
	getBackends()
	{
		return this._backends;
	}

	/**
	* Fan out a single HTTP request to all backends in parallel.
	*
	* @param {string} pMethod - HTTP method (GET, POST, PUT, DELETE)
	* @param {string} pPath - Request path (e.g. /1.0/Book/1)
	* @param {object} pHeaders - Request headers to forward
	* @param {string|null} pBody - Request body (for POST/PUT) or null
	* @param {function} fCallback - (pError, pResults) where pResults is
	*   { providerKey: { status, headers, body, timingMs, error } }
	*/
	fanout(pMethod, pPath, pHeaders, pBody, fCallback)
	{
		let tmpBackendKeys = Object.keys(this._backends);

		if (tmpBackendKeys.length === 0)
		{
			return fCallback('No backends configured');
		}

		let tmpResults = {};
		let tmpRemaining = tmpBackendKeys.length;

		for (let i = 0; i < tmpBackendKeys.length; i++)
		{
			let tmpKey = tmpBackendKeys[i];
			let tmpPort = this._backends[tmpKey];

			this._sendRequest(tmpKey, tmpPort, pMethod, pPath, pHeaders, pBody,
				(pProviderKey, pResult) =>
				{
					tmpResults[pProviderKey] = pResult;
					tmpRemaining--;

					if (tmpRemaining <= 0)
					{
						return fCallback(null, tmpResults);
					}
				});
		}
	}

	/**
	* Send a single request to one backend.
	*
	* @param {string} pProviderKey
	* @param {number} pPort
	* @param {string} pMethod
	* @param {string} pPath
	* @param {object} pHeaders
	* @param {string|null} pBody
	* @param {function} fCallback - (pProviderKey, pResult)
	*/
	_sendRequest(pProviderKey, pPort, pMethod, pPath, pHeaders, pBody, fCallback)
	{
		let tmpStartTime = Date.now();

		// Build forwarded headers, stripping hop-by-hop and host
		let tmpForwardHeaders = {};

		if (pHeaders)
		{
			let tmpSkipHeaders =
			{
				'host': true,
				'connection': true,
				'transfer-encoding': true,
				'keep-alive': true
			};

			let tmpHeaderKeys = Object.keys(pHeaders);

			for (let i = 0; i < tmpHeaderKeys.length; i++)
			{
				let tmpHeaderKey = tmpHeaderKeys[i].toLowerCase();

				if (!tmpSkipHeaders[tmpHeaderKey])
				{
					tmpForwardHeaders[tmpHeaderKey] = pHeaders[tmpHeaderKeys[i]];
				}
			}
		}

		// Update content-length if we have a body
		if (pBody)
		{
			tmpForwardHeaders['content-length'] = Buffer.byteLength(pBody);
		}

		let tmpRequestOptions =
		{
			hostname: '127.0.0.1',
			port: pPort,
			path: pPath,
			method: pMethod,
			headers: tmpForwardHeaders,
			timeout: this._timeoutMs
		};

		let tmpReq = libHttp.request(tmpRequestOptions,
			(pResponse) =>
			{
				let tmpResponseChunks = [];

				pResponse.on('data', (pChunk) =>
				{
					tmpResponseChunks.push(pChunk);
				});

				pResponse.on('end', () =>
				{
					let tmpElapsed = Date.now() - tmpStartTime;
					let tmpRawBody = Buffer.concat(tmpResponseChunks).toString('utf8');

					// Try to parse as JSON
					let tmpParsedBody = tmpRawBody;

					try
					{
						tmpParsedBody = JSON.parse(tmpRawBody);
					}
					catch (pParseError)
					{
						// Leave as raw string
					}

					return fCallback(pProviderKey,
						{
							status: pResponse.statusCode,
							headers: pResponse.headers,
							body: tmpParsedBody,
							timingMs: tmpElapsed,
							error: null
						});
				});
			});

		tmpReq.on('error', (pError) =>
		{
			let tmpElapsed = Date.now() - tmpStartTime;

			return fCallback(pProviderKey,
				{
					status: 0,
					headers: {},
					body: null,
					timingMs: tmpElapsed,
					error: `Connection error: ${pError.message}`
				});
		});

		tmpReq.on('timeout', () =>
		{
			tmpReq.destroy();
			let tmpElapsed = Date.now() - tmpStartTime;

			return fCallback(pProviderKey,
				{
					status: 0,
					headers: {},
					body: null,
					timingMs: tmpElapsed,
					error: `Request timed out after ${this._timeoutMs}ms`
				});
		});

		// Write body for POST/PUT
		if (pBody)
		{
			tmpReq.write(pBody);
		}

		tmpReq.end();
	}
}

module.exports = RequestFanout;
