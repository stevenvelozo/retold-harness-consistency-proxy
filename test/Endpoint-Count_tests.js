/**
* Endpoint Tests — Count
*
* Tests consistency proxy behavior for Count endpoints:
*   GET /1.0/Entities/Count                                  (total count)
*   GET /1.0/Entities/Count/FilteredTo/:Filter               (filtered count)
*   GET /1.0/Entities/Count/By/:ByField/:ByValue             (count by field)
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/
var Chai = require("chai");
var Expect = Chai.expect;

const libTestHelper = require('./Test-Helper.js');
const libConsistencyProxy = require('../source/Retold-Harness-Consistency-Proxy.js');

suite
(
	'Endpoint: Count',
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
					'GET /1.0/Books/Count': { status: 200, body: { Count: 3 } },
					'GET /1.0/Books/Count/FilteredTo/FBV~Genre~EQ~Science%20Fiction': { status: 200, body: { Count: 2 } },
					'GET /1.0/Books/Count/By/Genre/Science%20Fiction': { status: 200, body: { Count: 2 } },
					'GET /1.0/Books/Count/By/Genre/Cyberpunk': { status: 200, body: { Count: 1 } }
				};

				let tmpRoutesB =
				{
					'GET /1.0/Books/Count': { status: 200, body: { Count: 3 } },
					'GET /1.0/Books/Count/FilteredTo/FBV~Genre~EQ~Science%20Fiction': { status: 200, body: { Count: 2 } },
					'GET /1.0/Books/Count/By/Genre/Science%20Fiction': { status: 200, body: { Count: 2 } },
					'GET /1.0/Books/Count/By/Genre/Cyberpunk': { status: 200, body: { Count: 1 } }
				};

				libTestHelper.createMockServer(19660, tmpRoutesA,
					() =>
					{
						libTestHelper.createMockServer(19661, tmpRoutesB,
							() =>
							{
								_Proxy = new libConsistencyProxy(
									{
										port: 19670,
										backends: { 'mock-sqlite': 19660, 'mock-mysql': 19661 }
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
			'Total Count',
			function ()
			{
				test
				(
					'Should return consistent total count',
					function (fDone)
					{
						libTestHelper.proxyGet(19670, '/1.0/Books/Count',
							(pError, pEnvelope) =>
							{
								Expect(pError).to.equal(null);
								Expect(pEnvelope.consistent).to.equal(true);

								Expect(pEnvelope.providers['mock-sqlite'].body.Count).to.equal(3);
								Expect(pEnvelope.providers['mock-mysql'].body.Count).to.equal(3);

								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Filtered Count',
			function ()
			{
				test
				(
					'Should return consistent filtered count',
					function (fDone)
					{
						libTestHelper.proxyGet(19670, '/1.0/Books/Count/FilteredTo/FBV~Genre~EQ~Science%20Fiction',
							(pError, pEnvelope) =>
							{
								Expect(pError).to.equal(null);
								Expect(pEnvelope.consistent).to.equal(true);

								Expect(pEnvelope.providers['mock-sqlite'].body.Count).to.equal(2);
								Expect(pEnvelope.providers['mock-mysql'].body.Count).to.equal(2);

								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Count By Field',
			function ()
			{
				test
				(
					'Should return consistent count by field value',
					function (fDone)
					{
						libTestHelper.proxyGet(19670, '/1.0/Books/Count/By/Genre/Science%20Fiction',
							(pError, pEnvelope) =>
							{
								Expect(pError).to.equal(null);
								Expect(pEnvelope.consistent).to.equal(true);

								Expect(pEnvelope.providers['mock-sqlite'].body.Count).to.equal(2);

								fDone();
							});
					}
				);

				test
				(
					'Should return consistent count for different field values',
					function (fDone)
					{
						libTestHelper.proxyGet(19670, '/1.0/Books/Count/By/Genre/Cyberpunk',
							(pError, pEnvelope) =>
							{
								Expect(pError).to.equal(null);
								Expect(pEnvelope.consistent).to.equal(true);

								Expect(pEnvelope.providers['mock-sqlite'].body.Count).to.equal(1);
								Expect(pEnvelope.providers['mock-mysql'].body.Count).to.equal(1);

								fDone();
							});
					}
				);
			}
		);
	}
);
