/**
* Provider Discovery
*
* Discovers running retold-harness backends either from explicit CLI arguments
* or by auto-probing a port range.
*
* @author Steven Velozo <steven@velozo.com>
*/
const libHttp = require('http');

// Default port assignments match the management tool: base port 8086 + provider index
const _DefaultProviderPortMap =
{
	'sqlite': 8086,
	'mysql': 8087,
	'mssql': 8088,
	'postgresql': 8089,
	'mongodb': 8090,
	'dgraph': 8091,
	'solr': 8092
};

/**
* Parse the --backends CLI argument into a backends map.
*
* Format: "sqlite:8086,mysql:8087,postgresql:8089"
*
* @param {string} pBackendsArg - Comma-separated key:port pairs
* @returns {object} Map of { providerKey: port }
*/
function parseBackendsArg(pBackendsArg)
{
	let tmpBackends = {};

	if (!pBackendsArg || typeof pBackendsArg !== 'string')
	{
		return tmpBackends;
	}

	let tmpPairs = pBackendsArg.split(',');

	for (let i = 0; i < tmpPairs.length; i++)
	{
		let tmpPair = tmpPairs[i].trim();
		let tmpParts = tmpPair.split(':');

		if (tmpParts.length === 2)
		{
			let tmpKey = tmpParts[0].trim().toLowerCase();
			let tmpPort = parseInt(tmpParts[1].trim(), 10);

			if (tmpKey && !isNaN(tmpPort))
			{
				tmpBackends[tmpKey] = tmpPort;
			}
		}
	}

	return tmpBackends;
}

/**
* Probe a single port to see if a harness is listening.
*
* Sends GET /1.0/Books/Count — if it returns 200, the harness is live.
*
* @param {number} pPort - The port to probe
* @param {function} fCallback - (pIsLive)
*/
function probePort(pPort, fCallback)
{
	let tmpReq = libHttp.get(
		{
			hostname: '127.0.0.1',
			port: pPort,
			path: '/1.0/Books/Count',
			timeout: 2000
		},
		(pResponse) =>
		{
			// Consume data to free the socket
			pResponse.resume();

			if (pResponse.statusCode === 200)
			{
				return fCallback(true);
			}
			return fCallback(false);
		});

	tmpReq.on('error', () =>
	{
		return fCallback(false);
	});

	tmpReq.on('timeout', () =>
	{
		tmpReq.destroy();
		return fCallback(false);
	});
}

/**
* Auto-discover running backends by probing the default port range.
*
* @param {function} fCallback - (pBackends) where pBackends is { providerKey: port }
*/
function discoverBackends(fCallback)
{
	let tmpProviderKeys = Object.keys(_DefaultProviderPortMap);
	let tmpBackends = {};
	let tmpRemaining = tmpProviderKeys.length;

	for (let i = 0; i < tmpProviderKeys.length; i++)
	{
		let tmpKey = tmpProviderKeys[i];
		let tmpPort = _DefaultProviderPortMap[tmpKey];

		probePort(tmpPort,
			(function(pKey, pPort)
			{
				return function(pIsLive)
				{
					if (pIsLive)
					{
						tmpBackends[pKey] = pPort;
					}
					tmpRemaining--;

					if (tmpRemaining <= 0)
					{
						return fCallback(tmpBackends);
					}
				};
			})(tmpKey, tmpPort));
	}
}

/**
* Parse process.argv for discovery-related arguments.
*
* @returns {object} { backends: {}, discover: bool, port: number }
*/
function parseArgv()
{
	let tmpResult =
	{
		backends: null,
		discover: false,
		port: 9090
	};

	let tmpArgs = process.argv;

	for (let i = 2; i < tmpArgs.length; i++)
	{
		if ((tmpArgs[i] === '--backends' || tmpArgs[i] === '-b') && tmpArgs[i + 1])
		{
			tmpResult.backends = parseBackendsArg(tmpArgs[i + 1]);
			i++;
		}
		else if (tmpArgs[i] === '--discover' || tmpArgs[i] === '-d')
		{
			tmpResult.discover = true;
		}
		else if ((tmpArgs[i] === '--port' || tmpArgs[i] === '-p') && tmpArgs[i + 1])
		{
			tmpResult.port = parseInt(tmpArgs[i + 1], 10) || 9090;
			i++;
		}
	}

	return tmpResult;
}

module.exports =
{
	parseBackendsArg: parseBackendsArg,
	probePort: probePort,
	discoverBackends: discoverBackends,
	parseArgv: parseArgv,
	DefaultProviderPortMap: _DefaultProviderPortMap
};
