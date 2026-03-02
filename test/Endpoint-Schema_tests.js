/**
* Endpoint Tests — Schema
*
* Tests consistency proxy behavior for Schema-related endpoints:
*   GET /1.0/Entity/Schema
*   GET /1.0/Entity/Schema/New
*   POST /1.0/Entity/Schema/Validate
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/
var Chai = require("chai");
var Expect = Chai.expect;

const libTestHelper = require('./Test-Helper.js');
const MockBooks = libTestHelper.MockBooks;
const libConsistencyProxy = require('../source/Retold-Harness-Consistency-Proxy.js');

suite
(
	'Endpoint: Schema',
	function ()
	{
		this.timeout(15000);

		let _Proxy;

		suiteSetup
		(
			function (fDone)
			{
				let tmpRoutesA =
				{
					'GET /1.0/Book/Schema': { status: 200, body: MockBooks.Schema },
					'GET /1.0/Book/Schema/New': { status: 200, body: MockBooks.SchemaNew },
					'POST /1.0/Book/Schema/Validate': { status: 200, body: { Valid: true, Errors: [] } }
				};

				let tmpRoutesB =
				{
					'GET /1.0/Book/Schema': { status: 200, body: MockBooks.Schema },
					'GET /1.0/Book/Schema/New': { status: 200, body: MockBooks.SchemaNew },
					'POST /1.0/Book/Schema/Validate': { status: 200, body: { Valid: true, Errors: [] } }
				};

				libTestHelper.createMockServer(19540, tmpRoutesA,
					() =>
					{
						libTestHelper.createMockServer(19541, tmpRoutesB,
							() =>
							{
								_Proxy = new libConsistencyProxy(
									{
										port: 19550,
										backends: { 'mock-sqlite': 19540, 'mock-mysql': 19541 }
									});

								_Proxy.start(fDone);
							});
					});
			}
		);

		suiteTeardown
		(
			function (fDone)
			{
				if (_Proxy)
				{
					_Proxy.stop(
						() =>
						{
							libTestHelper.closeAllMockServers(fDone);
						});
				}
				else
				{
					libTestHelper.closeAllMockServers(fDone);
				}
			}
		);

		test
		(
			'Should return consistent schema',
			function (fDone)
			{
				libTestHelper.proxyGet(19550, '/1.0/Book/Schema',
					(pError, pEnvelope) =>
					{
						Expect(pError).to.equal(null);
						Expect(pEnvelope.consistent).to.equal(true);
						Expect(pEnvelope.providers['mock-sqlite'].body.title).to.equal('Book');
						Expect(pEnvelope.providers['mock-mysql'].body.title).to.equal('Book');

						fDone();
					});
			}
		);

		test
		(
			'Should return consistent schema new (empty template)',
			function (fDone)
			{
				libTestHelper.proxyGet(19550, '/1.0/Book/Schema/New',
					(pError, pEnvelope) =>
					{
						Expect(pError).to.equal(null);
						Expect(pEnvelope.consistent).to.equal(true);

						let tmpBody = pEnvelope.providers['mock-sqlite'].body;
						Expect(tmpBody.IDBook).to.equal(0);
						Expect(tmpBody.Title).to.equal('');
						Expect(tmpBody.Genre).to.equal('');

						fDone();
					});
			}
		);

		test
		(
			'Should return consistent schema validation',
			function (fDone)
			{
				let tmpBody = JSON.stringify({ Title: 'Test Book', Genre: 'Fiction' });

				libTestHelper.proxyRequest(19550, 'POST', '/1.0/Book/Schema/Validate', tmpBody,
					(pError, pEnvelope) =>
					{
						Expect(pError).to.equal(null);
						Expect(pEnvelope.consistent).to.equal(true);
						Expect(pEnvelope.providers['mock-sqlite'].body.Valid).to.equal(true);

						fDone();
					});
			}
		);
	}
);
