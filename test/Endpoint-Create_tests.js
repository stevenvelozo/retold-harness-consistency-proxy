/**
* Endpoint Tests — Create
*
* Tests consistency proxy behavior for Create endpoints:
*   POST /1.0/Entity          (single create)
*   POST /1.0/Entities        (bulk create)
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
	'Endpoint: Create',
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
					'POST /1.0/Book': { status: 200, body: MockBooks.ProviderA.NewBook },
					'POST /1.0/Books': { status: 200, body: [MockBooks.ProviderA.NewBook] }
				};

				let tmpRoutesB =
				{
					'POST /1.0/Book': { status: 200, body: MockBooks.ProviderB.NewBook },
					'POST /1.0/Books': { status: 200, body: [MockBooks.ProviderB.NewBook] }
				};

				libTestHelper.createMockServer(19560, tmpRoutesA,
					() =>
					{
						libTestHelper.createMockServer(19561, tmpRoutesB,
							() =>
							{
								_Proxy = new libConsistencyProxy(
									{
										port: 19570,
										backends: { 'mock-sqlite': 19560, 'mock-mysql': 19561 }
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

		suite
		(
			'Single Create',
			function ()
			{
				test
				(
					'Should return consistent create with different IDs excluded',
					function (fDone)
					{
						let tmpBody = JSON.stringify({ Title: 'Snow Crash', Genre: 'Cyberpunk', Price: 14.99 });

						libTestHelper.proxyRequest(19570, 'POST', '/1.0/Book', tmpBody,
							(pError, pEnvelope) =>
							{
								Expect(pError).to.equal(null);
								Expect(pEnvelope.consistent).to.equal(true);

								// Both providers returned the created record
								Expect(pEnvelope.providers['mock-sqlite'].status).to.equal(200);
								Expect(pEnvelope.providers['mock-mysql'].status).to.equal(200);

								// Business fields match
								Expect(pEnvelope.providers['mock-sqlite'].body.Title).to.equal('Snow Crash');
								Expect(pEnvelope.providers['mock-mysql'].body.Title).to.equal('Snow Crash');

								// IDs differ but are excluded from comparison
								Expect(pEnvelope.providers['mock-sqlite'].body.IDBook).to.not.equal(
									pEnvelope.providers['mock-mysql'].body.IDBook);

								fDone();
							});
					}
				);

				test
				(
					'Should include both provider bodies in envelope',
					function (fDone)
					{
						let tmpBody = JSON.stringify({ Title: 'Snow Crash', Genre: 'Cyberpunk' });

						libTestHelper.proxyRequest(19570, 'POST', '/1.0/Book', tmpBody,
							(pError, pEnvelope) =>
							{
								Expect(pEnvelope.providers['mock-sqlite'].body.Genre).to.equal('Cyberpunk');
								Expect(pEnvelope.providers['mock-mysql'].body.Genre).to.equal('Cyberpunk');
								Expect(pEnvelope.providers['mock-sqlite'].body.Price).to.equal(14.99);

								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Bulk Create',
			function ()
			{
				test
				(
					'Should return consistent bulk create',
					function (fDone)
					{
						let tmpBody = JSON.stringify([{ Title: 'Snow Crash', Genre: 'Cyberpunk' }]);

						libTestHelper.proxyRequest(19570, 'POST', '/1.0/Books', tmpBody,
							(pError, pEnvelope) =>
							{
								Expect(pError).to.equal(null);
								Expect(pEnvelope.consistent).to.equal(true);

								Expect(pEnvelope.providers['mock-sqlite'].body).to.be.an('array');
								Expect(pEnvelope.providers['mock-mysql'].body).to.be.an('array');

								fDone();
							});
					}
				);
			}
		);
	}
);
