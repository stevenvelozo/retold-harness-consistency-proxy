/**
* Endpoint Tests — Read (Single Record)
*
* Tests consistency proxy behavior for single-record Read endpoints:
*   GET /1.0/Entity/:IDRecord
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
	'Endpoint: Read',
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
					'GET /1.0/Book/1': { status: 200, body: MockBooks.ProviderA.Book1 },
					'GET /1.0/Book/2': { status: 200, body: MockBooks.ProviderA.Book2 },
					'GET /1.0/Book/3': { status: 200, body: MockBooks.ProviderA.Book3 },
					'GET /1.0/Book/999': { status: 404, body: { Error: 'Record not found' } }
				};

				let tmpRoutesB =
				{
					'GET /1.0/Book/1': { status: 200, body: MockBooks.ProviderB.Book1 },
					'GET /1.0/Book/2': { status: 200, body: MockBooks.ProviderB.Book2 },
					'GET /1.0/Book/3': { status: 200, body: MockBooks.ProviderB.Book3 },
					'GET /1.0/Book/999': { status: 404, body: { Error: 'Record not found' } }
				};

				libTestHelper.createMockServer(19580, tmpRoutesA,
					() =>
					{
						libTestHelper.createMockServer(19581, tmpRoutesB,
							() =>
							{
								_Proxy = new libConsistencyProxy(
									{
										port: 19590,
										backends: { 'mock-sqlite': 19580, 'mock-mysql': 19581 }
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
			'Consistent Reads',
			function ()
			{
				test
				(
					'Should return consistent single-record read',
					function (fDone)
					{
						libTestHelper.proxyGet(19590, '/1.0/Book/1',
							(pError, pEnvelope) =>
							{
								Expect(pError).to.equal(null);
								Expect(pEnvelope.consistent).to.equal(true);
								Expect(pEnvelope.request.method).to.equal('GET');
								Expect(pEnvelope.request.path).to.equal('/1.0/Book/1');

								// Business fields match
								Expect(pEnvelope.providers['mock-sqlite'].body.Title).to.equal('Dune');
								Expect(pEnvelope.providers['mock-mysql'].body.Title).to.equal('Dune');
								Expect(pEnvelope.providers['mock-sqlite'].body.Genre).to.equal('Science Fiction');
								Expect(pEnvelope.providers['mock-mysql'].body.Genre).to.equal('Science Fiction');

								fDone();
							});
					}
				);

				test
				(
					'Should return consistent read for different records',
					function (fDone)
					{
						libTestHelper.proxyGet(19590, '/1.0/Book/2',
							(pError, pEnvelope) =>
							{
								Expect(pEnvelope.consistent).to.equal(true);
								Expect(pEnvelope.providers['mock-sqlite'].body.Title).to.equal('Foundation');
								Expect(pEnvelope.providers['mock-mysql'].body.Title).to.equal('Foundation');

								fDone();
							});
					}
				);

				test
				(
					'Should exclude ID, GUID, and timestamp fields from comparison',
					function (fDone)
					{
						libTestHelper.proxyGet(19590, '/1.0/Book/1',
							(pError, pEnvelope) =>
							{
								Expect(pEnvelope.consistent).to.equal(true);

								// Verify the raw data does differ on excluded fields
								Expect(pEnvelope.providers['mock-sqlite'].body.IDBook).to.not.equal(
									pEnvelope.providers['mock-mysql'].body.IDBook);
								Expect(pEnvelope.providers['mock-sqlite'].body.GUIDBook).to.not.equal(
									pEnvelope.providers['mock-mysql'].body.GUIDBook);

								// But the proxy considers them consistent
								Expect(pEnvelope.differences.length).to.equal(0);

								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Error Reads',
			function ()
			{
				test
				(
					'Should return consistent 404 when record missing on all providers',
					function (fDone)
					{
						libTestHelper.proxyGet(19590, '/1.0/Book/999',
							(pError, pEnvelope) =>
							{
								Expect(pEnvelope.consistent).to.equal(true);
								Expect(pEnvelope.providers['mock-sqlite'].status).to.equal(404);
								Expect(pEnvelope.providers['mock-mysql'].status).to.equal(404);

								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Price and Numeric Fields',
			function ()
			{
				test
				(
					'Should report consistent prices across providers',
					function (fDone)
					{
						libTestHelper.proxyGet(19590, '/1.0/Book/1',
							(pError, pEnvelope) =>
							{
								Expect(pEnvelope.consistent).to.equal(true);
								Expect(pEnvelope.providers['mock-sqlite'].body.Price).to.equal(12.99);
								Expect(pEnvelope.providers['mock-mysql'].body.Price).to.equal(12.99);

								fDone();
							});
					}
				);
			}
		);
	}
);
