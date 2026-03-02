/**
* Test Helper
*
* Shared utilities for the Retold Harness Consistency Proxy test suite.
* Provides mock harness server creation, HTTP request helpers, and shared
* mock data definitions for the bookstore schema.
*
* Mocha loads this file but it registers no suites -- it only exports.
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/
const libHttp = require('http');

let _MockServers = [];

/**
* Create a mock harness server that responds with preset data.
*
* @param {number} pPort - Port to listen on
* @param {object} pRoutes - Map of { "METHOD /path": { status, body } }
* @param {function} fCallback - (pServer) when listening
*/
function createMockServer(pPort, pRoutes, fCallback)
{
	let tmpServer = libHttp.createServer(
		(pRequest, pResponse) =>
		{
			let tmpBodyChunks = [];

			pRequest.on('data', (pChunk) =>
			{
				tmpBodyChunks.push(pChunk);
			});

			pRequest.on('end', () =>
			{
				let tmpRouteKey = `${pRequest.method} ${pRequest.url}`;
				let tmpRouteData = pRoutes[tmpRouteKey];

				if (tmpRouteData !== undefined)
				{
					pResponse.writeHead(tmpRouteData.status || 200, { 'Content-Type': 'application/json' });
					pResponse.end(JSON.stringify(tmpRouteData.body));
				}
				else
				{
					pResponse.writeHead(404, { 'Content-Type': 'application/json' });
					pResponse.end(JSON.stringify({ Error: 'Route not found in mock' }));
				}
			});
		});

	tmpServer.listen(pPort,
		() =>
		{
			_MockServers.push(tmpServer);
			fCallback(tmpServer);
		});
}

/**
* Close all mock servers created during the test run.
*
* @param {function} fCallback - Called when all servers are closed
*/
function closeAllMockServers(fCallback)
{
	let tmpRemaining = _MockServers.length;

	if (tmpRemaining === 0)
	{
		return fCallback();
	}

	for (let i = 0; i < _MockServers.length; i++)
	{
		_MockServers[i].close(
			() =>
			{
				tmpRemaining--;

				if (tmpRemaining <= 0)
				{
					_MockServers = [];
					return fCallback();
				}
			});
	}
}

/**
* Make an HTTP request and parse the JSON response.
*
* @param {number} pPort - Port to connect to
* @param {string} pMethod - HTTP method
* @param {string} pPath - Request path
* @param {string|null} pBody - Request body (JSON string) or null
* @param {function} fCallback - (pError, pEnvelope)
*/
function proxyRequest(pPort, pMethod, pPath, pBody, fCallback)
{
	let tmpHeaders = { 'Content-Type': 'application/json' };

	if (pBody)
	{
		tmpHeaders['Content-Length'] = Buffer.byteLength(pBody);
	}

	let tmpOptions =
	{
		hostname: 'localhost',
		port: pPort,
		path: pPath,
		method: pMethod,
		headers: tmpHeaders
	};

	let tmpRequest = libHttp.request(tmpOptions,
		(pResponse) =>
		{
			let tmpChunks = [];

			pResponse.on('data', (pChunk) => tmpChunks.push(pChunk));
			pResponse.on('end', () =>
			{
				try
				{
					let tmpEnvelope = JSON.parse(Buffer.concat(tmpChunks).toString('utf8'));
					return fCallback(null, tmpEnvelope);
				}
				catch (pError)
				{
					return fCallback(pError, null);
				}
			});
		});

	tmpRequest.on('error', (pError) =>
	{
		return fCallback(pError, null);
	});

	if (pBody)
	{
		tmpRequest.write(pBody);
	}

	tmpRequest.end();
}

/**
* Shorthand for GET requests to the proxy.
*
* @param {number} pPort - Proxy port
* @param {string} pPath - Request path
* @param {function} fCallback - (pError, pEnvelope)
*/
function proxyGet(pPort, pPath, fCallback)
{
	return proxyRequest(pPort, 'GET', pPath, null, fCallback);
}

// ─────────────────────────────────────────────
//  Shared Mock Data — Bookstore Schema
// ─────────────────────────────────────────────

/**
* Mock book records as they would come from different providers.
* IDs, GUIDs, and timestamps differ; business fields are consistent.
*/
const MockBooks =
{
	// -- Provider A (e.g. SQLite) --
	ProviderA:
	{
		Book1: { IDBook: 1, GUIDBook: 'aaa-111', Title: 'Dune', Genre: 'Science Fiction', Price: 12.99, PublishDate: '1965-08-01', Deleted: 0, CreateDate: '2024-01-01', UpdateDate: '2024-06-01', CreatingIDUser: 1, UpdatingIDUser: 1, DeletingIDUser: 0 },
		Book2: { IDBook: 2, GUIDBook: 'aaa-222', Title: 'Foundation', Genre: 'Science Fiction', Price: 11.50, PublishDate: '1951-05-01', Deleted: 0, CreateDate: '2024-01-02', UpdateDate: '2024-06-02', CreatingIDUser: 1, UpdatingIDUser: 1, DeletingIDUser: 0 },
		Book3: { IDBook: 3, GUIDBook: 'aaa-333', Title: 'Neuromancer', Genre: 'Cyberpunk', Price: 10.00, PublishDate: '1984-07-01', Deleted: 0, CreateDate: '2024-01-03', UpdateDate: '2024-06-03', CreatingIDUser: 1, UpdatingIDUser: 2, DeletingIDUser: 0 },
		NewBook: { IDBook: 4, GUIDBook: 'aaa-444', Title: 'Snow Crash', Genre: 'Cyberpunk', Price: 14.99, PublishDate: '1992-06-01', Deleted: 0, CreateDate: '2024-07-01', UpdateDate: '2024-07-01', CreatingIDUser: 1, UpdatingIDUser: 1, DeletingIDUser: 0 },
		UpdatedBook1: { IDBook: 1, GUIDBook: 'aaa-111', Title: 'Dune', Genre: 'Science Fiction', Price: 15.99, PublishDate: '1965-08-01', Deleted: 0, CreateDate: '2024-01-01', UpdateDate: '2024-08-01', CreatingIDUser: 1, UpdatingIDUser: 2, DeletingIDUser: 0 },
		DeletedBook3: { IDBook: 3, GUIDBook: 'aaa-333', Title: 'Neuromancer', Genre: 'Cyberpunk', Price: 10.00, PublishDate: '1984-07-01', Deleted: 1, CreateDate: '2024-01-03', UpdateDate: '2024-08-15', CreatingIDUser: 1, UpdatingIDUser: 2, DeletingIDUser: 2, DeleteDate: '2024-08-15' }
	},

	// -- Provider B (e.g. MySQL) — same business fields, different IDs/timestamps --
	ProviderB:
	{
		Book1: { IDBook: 50, GUIDBook: 'bbb-111', Title: 'Dune', Genre: 'Science Fiction', Price: 12.99, PublishDate: '1965-08-01', Deleted: 0, CreateDate: '2024-01-01T00:00:00Z', UpdateDate: '2024-06-01T00:00:00Z', CreatingIDUser: 5, UpdatingIDUser: 5, DeletingIDUser: 0 },
		Book2: { IDBook: 51, GUIDBook: 'bbb-222', Title: 'Foundation', Genre: 'Science Fiction', Price: 11.50, PublishDate: '1951-05-01', Deleted: 0, CreateDate: '2024-01-02T00:00:00Z', UpdateDate: '2024-06-02T00:00:00Z', CreatingIDUser: 5, UpdatingIDUser: 5, DeletingIDUser: 0 },
		Book3: { IDBook: 52, GUIDBook: 'bbb-333', Title: 'Neuromancer', Genre: 'Cyberpunk', Price: 10.00, PublishDate: '1984-07-01', Deleted: 0, CreateDate: '2024-01-03T00:00:00Z', UpdateDate: '2024-06-03T00:00:00Z', CreatingIDUser: 5, UpdatingIDUser: 8, DeletingIDUser: 0 },
		NewBook: { IDBook: 53, GUIDBook: 'bbb-444', Title: 'Snow Crash', Genre: 'Cyberpunk', Price: 14.99, PublishDate: '1992-06-01', Deleted: 0, CreateDate: '2024-07-01T00:00:00Z', UpdateDate: '2024-07-01T00:00:00Z', CreatingIDUser: 5, UpdatingIDUser: 5, DeletingIDUser: 0 },
		UpdatedBook1: { IDBook: 50, GUIDBook: 'bbb-111', Title: 'Dune', Genre: 'Science Fiction', Price: 15.99, PublishDate: '1965-08-01', Deleted: 0, CreateDate: '2024-01-01T00:00:00Z', UpdateDate: '2024-08-01T00:00:00Z', CreatingIDUser: 5, UpdatingIDUser: 8, DeletingIDUser: 0 },
		DeletedBook3: { IDBook: 52, GUIDBook: 'bbb-333', Title: 'Neuromancer', Genre: 'Cyberpunk', Price: 10.00, PublishDate: '1984-07-01', Deleted: 1, CreateDate: '2024-01-03T00:00:00Z', UpdateDate: '2024-08-15T00:00:00Z', CreatingIDUser: 5, UpdatingIDUser: 8, DeletingIDUser: 8, DeleteDate: '2024-08-15T00:00:00Z' }
	},

	Schema:
	{
		title: 'Book',
		description: 'A book in the bookstore',
		properties:
		{
			IDBook: { type: 'integer' },
			GUIDBook: { type: 'string' },
			Title: { type: 'string' },
			Genre: { type: 'string' },
			Price: { type: 'number' },
			PublishDate: { type: 'string' },
			Deleted: { type: 'integer' }
		}
	},

	SchemaNew:
	{
		IDBook: 0,
		GUIDBook: '',
		Title: '',
		Genre: '',
		Price: 0,
		PublishDate: '',
		Deleted: 0,
		CreateDate: '',
		UpdateDate: '',
		CreatingIDUser: 0,
		UpdatingIDUser: 0,
		DeletingIDUser: 0
	}
};

module.exports =
{
	createMockServer: createMockServer,
	closeAllMockServers: closeAllMockServers,
	proxyRequest: proxyRequest,
	proxyGet: proxyGet,
	MockBooks: MockBooks
};
