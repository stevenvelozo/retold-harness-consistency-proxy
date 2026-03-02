/**
* Endpoint Tests — Reads (List / Multiple Records)
*
* Tests consistency proxy behavior for list Read endpoints:
*   GET /1.0/Entities                                       (all records)
*   GET /1.0/Entities/:Begin/:Cap                           (paginated)
*   GET /1.0/Entities/FilteredTo/:Filter                    (filtered)
*   GET /1.0/Entities/FilteredTo/:Filter/:Begin/:Cap        (filtered + paginated)
*   GET /1.0/Entities/By/:ByField/:ByValue                  (field filter)
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
	'Endpoint: Reads',
	function ()
	{
		this.timeout(15000);

		let _Proxy;

		suiteSetup
		(
			function (fDone)
			{
				let tmpAllBooksA = [MockBooks.ProviderA.Book1, MockBooks.ProviderA.Book2, MockBooks.ProviderA.Book3];
				let tmpAllBooksB = [MockBooks.ProviderB.Book1, MockBooks.ProviderB.Book2, MockBooks.ProviderB.Book3];

				let tmpSciFiBooksA = [MockBooks.ProviderA.Book1, MockBooks.ProviderA.Book2];
				let tmpSciFiBooksB = [MockBooks.ProviderB.Book1, MockBooks.ProviderB.Book2];

				let tmpPagedBooksA = [MockBooks.ProviderA.Book1, MockBooks.ProviderA.Book2];
				let tmpPagedBooksB = [MockBooks.ProviderB.Book1, MockBooks.ProviderB.Book2];

				let tmpRoutesA =
				{
					'GET /1.0/Books': { status: 200, body: tmpAllBooksA },
					'GET /1.0/Books/0/2': { status: 200, body: tmpPagedBooksA },
					'GET /1.0/Books/FilteredTo/FBV~Genre~EQ~Science%20Fiction': { status: 200, body: tmpSciFiBooksA },
					'GET /1.0/Books/FilteredTo/FBV~Genre~EQ~Science%20Fiction/0/1': { status: 200, body: [MockBooks.ProviderA.Book1] },
					'GET /1.0/Books/By/Genre/Science%20Fiction': { status: 200, body: tmpSciFiBooksA }
				};

				let tmpRoutesB =
				{
					'GET /1.0/Books': { status: 200, body: tmpAllBooksB },
					'GET /1.0/Books/0/2': { status: 200, body: tmpPagedBooksB },
					'GET /1.0/Books/FilteredTo/FBV~Genre~EQ~Science%20Fiction': { status: 200, body: tmpSciFiBooksB },
					'GET /1.0/Books/FilteredTo/FBV~Genre~EQ~Science%20Fiction/0/1': { status: 200, body: [MockBooks.ProviderB.Book1] },
					'GET /1.0/Books/By/Genre/Science%20Fiction': { status: 200, body: tmpSciFiBooksB }
				};

				libTestHelper.createMockServer(19600, tmpRoutesA,
					() =>
					{
						libTestHelper.createMockServer(19601, tmpRoutesB,
							() =>
							{
								_Proxy = new libConsistencyProxy(
									{
										port: 19610,
										backends: { 'mock-sqlite': 19600, 'mock-mysql': 19601 }
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
			'All Records',
			function ()
			{
				test
				(
					'Should return consistent list of all records',
					function (fDone)
					{
						libTestHelper.proxyGet(19610, '/1.0/Books',
							(pError, pEnvelope) =>
							{
								Expect(pError).to.equal(null);
								Expect(pEnvelope.consistent).to.equal(true);

								Expect(pEnvelope.providers['mock-sqlite'].body).to.be.an('array');
								Expect(pEnvelope.providers['mock-sqlite'].body.length).to.equal(3);
								Expect(pEnvelope.providers['mock-mysql'].body.length).to.equal(3);

								fDone();
							});
					}
				);

				test
				(
					'Should compare array elements by business fields',
					function (fDone)
					{
						libTestHelper.proxyGet(19610, '/1.0/Books',
							(pError, pEnvelope) =>
							{
								Expect(pEnvelope.consistent).to.equal(true);

								// Verify the providers have different IDs but same business data
								let tmpSqliteFirst = pEnvelope.providers['mock-sqlite'].body[0];
								let tmpMysqlFirst = pEnvelope.providers['mock-mysql'].body[0];

								Expect(tmpSqliteFirst.Title).to.equal(tmpMysqlFirst.Title);
								Expect(tmpSqliteFirst.IDBook).to.not.equal(tmpMysqlFirst.IDBook);

								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Paginated Reads',
			function ()
			{
				test
				(
					'Should return consistent paginated records',
					function (fDone)
					{
						libTestHelper.proxyGet(19610, '/1.0/Books/0/2',
							(pError, pEnvelope) =>
							{
								Expect(pError).to.equal(null);
								Expect(pEnvelope.consistent).to.equal(true);

								Expect(pEnvelope.providers['mock-sqlite'].body.length).to.equal(2);
								Expect(pEnvelope.providers['mock-mysql'].body.length).to.equal(2);

								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Filtered Reads',
			function ()
			{
				test
				(
					'Should return consistent filtered records',
					function (fDone)
					{
						libTestHelper.proxyGet(19610, '/1.0/Books/FilteredTo/FBV~Genre~EQ~Science%20Fiction',
							(pError, pEnvelope) =>
							{
								Expect(pError).to.equal(null);
								Expect(pEnvelope.consistent).to.equal(true);

								Expect(pEnvelope.providers['mock-sqlite'].body.length).to.equal(2);
								Expect(pEnvelope.providers['mock-mysql'].body.length).to.equal(2);

								fDone();
							});
					}
				);

				test
				(
					'Should return consistent filtered and paginated records',
					function (fDone)
					{
						libTestHelper.proxyGet(19610, '/1.0/Books/FilteredTo/FBV~Genre~EQ~Science%20Fiction/0/1',
							(pError, pEnvelope) =>
							{
								Expect(pError).to.equal(null);
								Expect(pEnvelope.consistent).to.equal(true);

								Expect(pEnvelope.providers['mock-sqlite'].body.length).to.equal(1);

								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'By-Field Reads',
			function ()
			{
				test
				(
					'Should return consistent by-field filtered records',
					function (fDone)
					{
						libTestHelper.proxyGet(19610, '/1.0/Books/By/Genre/Science%20Fiction',
							(pError, pEnvelope) =>
							{
								Expect(pError).to.equal(null);
								Expect(pEnvelope.consistent).to.equal(true);

								Expect(pEnvelope.providers['mock-sqlite'].body.length).to.equal(2);
								Expect(pEnvelope.providers['mock-mysql'].body.length).to.equal(2);

								fDone();
							});
					}
				);
			}
		);
	}
);
