/**
* Request Fan-out — Meadow-Level Service Tests
*
* Tests the parallel HTTP request fan-out service: GET/POST forwarding,
* header handling, timing collection, and error resilience.
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/
var Chai = require("chai");
var Expect = Chai.expect;

const libFable = require('fable');
const libTestHelper = require('./Test-Helper.js');
const libRequestFanout = require('../source/Service-RequestFanout.js');

suite
(
	'Request Fan-out',
	function ()
	{
		this.timeout(10000);

		let _Fable;
		let _Fanout;

		suiteSetup
		(
			function (fDone)
			{
				_Fable = new libFable(
					{
						Product: 'FanoutTest',
						LogStreams: [{ streamtype: 'console', level: 'fatal' }]
					});
				_Fable.serviceManager.addServiceType('RequestFanout', libRequestFanout);
				_Fable.serviceManager.instantiateServiceProvider('RequestFanout');
				_Fanout = _Fable.RequestFanout;

				// Create two mock servers
				libTestHelper.createMockServer(19510,
					{
						'GET /1.0/Book/1': { status: 200, body: { IDBook: 1, Title: 'Dune' } },
						'GET /1.0/Books/Count': { status: 200, body: { Count: 6 } },
						'POST /1.0/Book': { status: 200, body: { IDBook: 10, Title: 'New Book' } }
					},
					() =>
					{
						libTestHelper.createMockServer(19511,
							{
								'GET /1.0/Book/1': { status: 200, body: { IDBook: 1, Title: 'Dune' } },
								'GET /1.0/Books/Count': { status: 200, body: { Count: 6 } },
								'POST /1.0/Book': { status: 200, body: { IDBook: 55, Title: 'New Book' } }
							},
							() =>
							{
								_Fanout.setBackends({ 'mock-a': 19510, 'mock-b': 19511 });
								fDone();
							});
					});
			}
		);

		suiteTeardown
		(
			function (fDone)
			{
				libTestHelper.closeAllMockServers(fDone);
			}
		);

		suite
		(
			'GET Fan-out',
			function ()
			{
				test
				(
					'Should fan out GET requests to all backends',
					function (fDone)
					{
						_Fanout.fanout('GET', '/1.0/Book/1', {}, null,
							(pError, pResults) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResults).to.be.an('object');
								Expect(pResults['mock-a']).to.be.an('object');
								Expect(pResults['mock-b']).to.be.an('object');
								Expect(pResults['mock-a'].status).to.equal(200);
								Expect(pResults['mock-b'].status).to.equal(200);
								Expect(pResults['mock-a'].body.Title).to.equal('Dune');
								Expect(pResults['mock-b'].body.Title).to.equal('Dune');
								Expect(pResults['mock-a'].timingMs).to.be.a('number');
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'POST Fan-out',
			function ()
			{
				test
				(
					'Should fan out POST requests with body',
					function (fDone)
					{
						let tmpBody = JSON.stringify({ Title: 'New Book', Genre: 'Test' });

						_Fanout.fanout('POST', '/1.0/Book', { 'content-type': 'application/json' }, tmpBody,
							(pError, pResults) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResults['mock-a'].status).to.equal(200);
								Expect(pResults['mock-a'].body.Title).to.equal('New Book');
								Expect(pResults['mock-b'].body.Title).to.equal('New Book');
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Error Handling',
			function ()
			{
				test
				(
					'Should handle connection errors gracefully',
					function (fDone)
					{
						_Fanout.setBackends({ 'mock-a': 19510, 'dead': 19599 });

						_Fanout.fanout('GET', '/1.0/Books/Count', {}, null,
							(pError, pResults) =>
							{
								Expect(pError).to.equal(null);
								Expect(pResults['mock-a'].status).to.equal(200);
								Expect(pResults['dead'].error).to.be.a('string');
								Expect(pResults['dead'].error).to.contain('Connection error');

								// Reset backends
								_Fanout.setBackends({ 'mock-a': 19510, 'mock-b': 19511 });
								fDone();
							});
					}
				);

				test
				(
					'Should error when no backends configured',
					function (fDone)
					{
						_Fanout.setBackends({});

						_Fanout.fanout('GET', '/1.0/Books/Count', {}, null,
							(pError) =>
							{
								Expect(pError).to.equal('No backends configured');

								// Reset
								_Fanout.setBackends({ 'mock-a': 19510, 'mock-b': 19511 });
								fDone();
							});
					}
				);
			}
		);
	}
);
