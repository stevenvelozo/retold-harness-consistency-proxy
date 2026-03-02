/**
* Endpoint Tests — Delete
*
* Tests consistency proxy behavior for Delete endpoints:
*   DELETE /1.0/Entity/:IDRecord    (delete by URL parameter)
*   DELETE /1.0/Entity              (delete by body)
*   GET /1.0/Entity/Undelete/:ID    (undelete)
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
	'Endpoint: Delete',
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
					'DELETE /1.0/Book/3': { status: 200, body: MockBooks.ProviderA.DeletedBook3 },
					'DELETE /1.0/Book': { status: 200, body: MockBooks.ProviderA.DeletedBook3 },
					'DELETE /1.0/Book/999': { status: 404, body: { Error: 'Record not found' } },
					'GET /1.0/Book/Undelete/3': { status: 200, body: MockBooks.ProviderA.Book3 }
				};

				let tmpRoutesB =
				{
					'DELETE /1.0/Book/3': { status: 200, body: MockBooks.ProviderB.DeletedBook3 },
					'DELETE /1.0/Book': { status: 200, body: MockBooks.ProviderB.DeletedBook3 },
					'DELETE /1.0/Book/999': { status: 404, body: { Error: 'Record not found' } },
					'GET /1.0/Book/Undelete/3': { status: 200, body: MockBooks.ProviderB.Book3 }
				};

				libTestHelper.createMockServer(19640, tmpRoutesA,
					() =>
					{
						libTestHelper.createMockServer(19641, tmpRoutesB,
							() =>
							{
								_Proxy = new libConsistencyProxy(
									{
										port: 19650,
										backends: { 'mock-sqlite': 19640, 'mock-mysql': 19641 }
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
			'Delete by URL Parameter',
			function ()
			{
				test
				(
					'Should return consistent delete result',
					function (fDone)
					{
						libTestHelper.proxyRequest(19650, 'DELETE', '/1.0/Book/3', null,
							(pError, pEnvelope) =>
							{
								Expect(pError).to.equal(null);
								Expect(pEnvelope.consistent).to.equal(true);

								// Both providers soft-deleted the record
								Expect(pEnvelope.providers['mock-sqlite'].body.Deleted).to.equal(1);
								Expect(pEnvelope.providers['mock-mysql'].body.Deleted).to.equal(1);

								// Business fields still match
								Expect(pEnvelope.providers['mock-sqlite'].body.Title).to.equal('Neuromancer');
								Expect(pEnvelope.providers['mock-mysql'].body.Title).to.equal('Neuromancer');

								fDone();
							});
					}
				);

				test
				(
					'Should exclude DeleteDate and DeletingIDUser from comparison',
					function (fDone)
					{
						libTestHelper.proxyRequest(19650, 'DELETE', '/1.0/Book/3', null,
							(pError, pEnvelope) =>
							{
								Expect(pEnvelope.consistent).to.equal(true);
								Expect(pEnvelope.differences.length).to.equal(0);

								fDone();
							});
					}
				);

				test
				(
					'Should return consistent 404 when deleting nonexistent record',
					function (fDone)
					{
						libTestHelper.proxyRequest(19650, 'DELETE', '/1.0/Book/999', null,
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
			'Delete by Body',
			function ()
			{
				test
				(
					'Should return consistent delete when ID is in body',
					function (fDone)
					{
						let tmpBody = JSON.stringify({ IDBook: 3 });

						libTestHelper.proxyRequest(19650, 'DELETE', '/1.0/Book', tmpBody,
							(pError, pEnvelope) =>
							{
								Expect(pError).to.equal(null);
								Expect(pEnvelope.consistent).to.equal(true);
								Expect(pEnvelope.providers['mock-sqlite'].body.Deleted).to.equal(1);

								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Undelete',
			function ()
			{
				test
				(
					'Should return consistent undelete result',
					function (fDone)
					{
						libTestHelper.proxyGet(19650, '/1.0/Book/Undelete/3',
							(pError, pEnvelope) =>
							{
								Expect(pError).to.equal(null);
								Expect(pEnvelope.consistent).to.equal(true);

								// Record restored
								Expect(pEnvelope.providers['mock-sqlite'].body.Deleted).to.equal(0);
								Expect(pEnvelope.providers['mock-mysql'].body.Deleted).to.equal(0);
								Expect(pEnvelope.providers['mock-sqlite'].body.Title).to.equal('Neuromancer');

								fDone();
							});
					}
				);
			}
		);
	}
);
