/**
* Endpoint Tests — Update
*
* Tests consistency proxy behavior for Update endpoints:
*   PUT /1.0/Entity            (single update)
*   PUT /1.0/Entity/Upsert     (upsert)
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
	'Endpoint: Update',
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
					'PUT /1.0/Book': { status: 200, body: MockBooks.ProviderA.UpdatedBook1 },
					'PUT /1.0/Book/Upsert': { status: 200, body: MockBooks.ProviderA.NewBook }
				};

				let tmpRoutesB =
				{
					'PUT /1.0/Book': { status: 200, body: MockBooks.ProviderB.UpdatedBook1 },
					'PUT /1.0/Book/Upsert': { status: 200, body: MockBooks.ProviderB.NewBook }
				};

				libTestHelper.createMockServer(19620, tmpRoutesA,
					() =>
					{
						libTestHelper.createMockServer(19621, tmpRoutesB,
							() =>
							{
								_Proxy = new libConsistencyProxy(
									{
										port: 19630,
										backends: { 'mock-sqlite': 19620, 'mock-mysql': 19621 }
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
			'Single Update',
			function ()
			{
				test
				(
					'Should return consistent update with price change',
					function (fDone)
					{
						let tmpBody = JSON.stringify({ IDBook: 1, Price: 15.99 });

						libTestHelper.proxyRequest(19630, 'PUT', '/1.0/Book', tmpBody,
							(pError, pEnvelope) =>
							{
								Expect(pError).to.equal(null);
								Expect(pEnvelope.consistent).to.equal(true);

								// Updated price is consistent
								Expect(pEnvelope.providers['mock-sqlite'].body.Price).to.equal(15.99);
								Expect(pEnvelope.providers['mock-mysql'].body.Price).to.equal(15.99);

								// Title unchanged
								Expect(pEnvelope.providers['mock-sqlite'].body.Title).to.equal('Dune');

								fDone();
							});
					}
				);

				test
				(
					'Should exclude UpdateDate and UpdatingIDUser from comparison',
					function (fDone)
					{
						let tmpBody = JSON.stringify({ IDBook: 1, Price: 15.99 });

						libTestHelper.proxyRequest(19630, 'PUT', '/1.0/Book', tmpBody,
							(pError, pEnvelope) =>
							{
								Expect(pEnvelope.consistent).to.equal(true);

								// UpdateDate differs but is excluded
								Expect(pEnvelope.providers['mock-sqlite'].body.UpdateDate).to.not.equal(
									pEnvelope.providers['mock-mysql'].body.UpdateDate);

								Expect(pEnvelope.differences.length).to.equal(0);

								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Upsert',
			function ()
			{
				test
				(
					'Should return consistent upsert result',
					function (fDone)
					{
						let tmpBody = JSON.stringify({ Title: 'Snow Crash', Genre: 'Cyberpunk', Price: 14.99 });

						libTestHelper.proxyRequest(19630, 'PUT', '/1.0/Book/Upsert', tmpBody,
							(pError, pEnvelope) =>
							{
								Expect(pError).to.equal(null);
								Expect(pEnvelope.consistent).to.equal(true);

								Expect(pEnvelope.providers['mock-sqlite'].body.Title).to.equal('Snow Crash');
								Expect(pEnvelope.providers['mock-mysql'].body.Title).to.equal('Snow Crash');

								fDone();
							});
					}
				);
			}
		);
	}
);
