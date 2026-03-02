/**
* Proxy Integration — Retold-Level Tests
*
* Tests the full proxy server: startup, shutdown, envelope structure,
* timing, and request metadata.
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
	'Proxy Integration',
	function ()
	{
		this.timeout(15000);

		let _Proxy;

		suiteSetup
		(
			function (fDone)
			{
				libTestHelper.createMockServer(19520,
					{
						'GET /1.0/Book/1': { status: 200, body: { IDBook: 1, GUIDBook: 'aaa', Title: 'Dune', Genre: 'Science Fiction', CreateDate: '2024-01-01' } },
						'GET /1.0/Books': { status: 200, body: [{ IDBook: 1, Title: 'Dune', Genre: 'Science Fiction' }, { IDBook: 2, Title: 'Foundation', Genre: 'Science Fiction' }] },
						'GET /1.0/Books/Count': { status: 200, body: { Count: 2 } },
						'GET /1.0/Book/Schema': { status: 200, body: { title: 'Book', properties: { IDBook: {}, Title: {}, Genre: {} } } }
					},
					() =>
					{
						libTestHelper.createMockServer(19521,
							{
								'GET /1.0/Book/1': { status: 200, body: { IDBook: 50, GUIDBook: 'bbb', Title: 'Dune', Genre: 'Science Fiction', CreateDate: '2024-01-01T00:00:00Z' } },
								'GET /1.0/Books': { status: 200, body: [{ IDBook: 50, Title: 'Dune', Genre: 'Science Fiction' }, { IDBook: 51, Title: 'Foundation', Genre: 'Science Fiction' }] },
								'GET /1.0/Books/Count': { status: 200, body: { Count: 2 } },
								'GET /1.0/Book/Schema': { status: 200, body: { title: 'Book', properties: { IDBook: {}, Title: {}, Genre: {} } } }
							},
							() =>
							{
								_Proxy = new libConsistencyProxy(
									{
										port: 19530,
										backends: { 'mock-sqlite': 19520, 'mock-mysql': 19521 }
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
			'Envelope Structure',
			function ()
			{
				test
				(
					'Should return a well-formed JSON envelope',
					function (fDone)
					{
						libTestHelper.proxyGet(19530, '/1.0/Book/1',
							(pError, pEnvelope) =>
							{
								Expect(pError).to.equal(null);
								Expect(pEnvelope).to.be.an('object');

								// Request metadata
								Expect(pEnvelope.request).to.be.an('object');
								Expect(pEnvelope.request.method).to.equal('GET');
								Expect(pEnvelope.request.path).to.equal('/1.0/Book/1');
								Expect(pEnvelope.request).to.have.property('timestamp');

								// Consistency report
								Expect(pEnvelope).to.have.property('consistent');
								Expect(pEnvelope).to.have.property('providerCount');
								Expect(pEnvelope).to.have.property('differences');
								Expect(pEnvelope).to.have.property('summary');
								Expect(pEnvelope.differences).to.be.an('array');

								// Provider results
								Expect(pEnvelope.providers).to.be.an('object');
								Expect(pEnvelope.providers['mock-sqlite']).to.be.an('object');
								Expect(pEnvelope.providers['mock-mysql']).to.be.an('object');

								fDone();
							});
					}
				);

				test
				(
					'Should include provider count matching configured backends',
					function (fDone)
					{
						libTestHelper.proxyGet(19530, '/1.0/Books/Count',
							(pError, pEnvelope) =>
							{
								Expect(pEnvelope.providerCount).to.equal(2);
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Timing Data',
			function ()
			{
				test
				(
					'Should include timing data for each provider',
					function (fDone)
					{
						libTestHelper.proxyGet(19530, '/1.0/Book/1',
							(pError, pEnvelope) =>
							{
								Expect(pEnvelope.providers['mock-sqlite'].timingMs).to.be.a('number');
								Expect(pEnvelope.providers['mock-mysql'].timingMs).to.be.a('number');
								Expect(pEnvelope.providers['mock-sqlite'].timingMs).to.be.at.least(0);

								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Provider Results',
			function ()
			{
				test
				(
					'Should include status code in each provider result',
					function (fDone)
					{
						libTestHelper.proxyGet(19530, '/1.0/Book/1',
							(pError, pEnvelope) =>
							{
								Expect(pEnvelope.providers['mock-sqlite'].status).to.equal(200);
								Expect(pEnvelope.providers['mock-mysql'].status).to.equal(200);
								fDone();
							});
					}
				);

				test
				(
					'Should include parsed body in each provider result',
					function (fDone)
					{
						libTestHelper.proxyGet(19530, '/1.0/Book/1',
							(pError, pEnvelope) =>
							{
								Expect(pEnvelope.providers['mock-sqlite'].body).to.be.an('object');
								Expect(pEnvelope.providers['mock-sqlite'].body.Title).to.equal('Dune');
								Expect(pEnvelope.providers['mock-mysql'].body.Title).to.equal('Dune');
								fDone();
							});
					}
				);
			}
		);
	}
);
