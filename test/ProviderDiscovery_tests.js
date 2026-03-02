/**
* Provider Discovery — Low-Level Object Tests
*
* Tests the backend argument parsing, port probing, and default port map
* from the Provider-Discovery module.
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/
var Chai = require("chai");
var Expect = Chai.expect;

const libTestHelper = require('./Test-Helper.js');
const libProviderDiscovery = require('../source/Provider-Discovery.js');

suite
(
	'Provider Discovery',
	function ()
	{
		this.timeout(10000);

		suiteTeardown
		(
			function (fDone)
			{
				libTestHelper.closeAllMockServers(fDone);
			}
		);

		suite
		(
			'Backend Argument Parsing',
			function ()
			{
				test
				(
					'Should parse --backends argument correctly',
					function ()
					{
						let tmpResult = libProviderDiscovery.parseBackendsArg('sqlite:8086,mysql:8087,postgresql:8089');
						Expect(tmpResult).to.be.an('object');
						Expect(tmpResult.sqlite).to.equal(8086);
						Expect(tmpResult.mysql).to.equal(8087);
						Expect(tmpResult.postgresql).to.equal(8089);
					}
				);

				test
				(
					'Should handle empty backends arg',
					function ()
					{
						let tmpResult = libProviderDiscovery.parseBackendsArg('');
						Expect(tmpResult).to.be.an('object');
						Expect(Object.keys(tmpResult).length).to.equal(0);
					}
				);

				test
				(
					'Should handle null backends arg',
					function ()
					{
						let tmpResult = libProviderDiscovery.parseBackendsArg(null);
						Expect(tmpResult).to.be.an('object');
						Expect(Object.keys(tmpResult).length).to.equal(0);
					}
				);

				test
				(
					'Should handle malformed backends arg gracefully',
					function ()
					{
						let tmpResult = libProviderDiscovery.parseBackendsArg('sqlite:abc,bad,mysql:8087');
						Expect(tmpResult).to.be.an('object');
						Expect(tmpResult.mysql).to.equal(8087);
						Expect(tmpResult).to.not.have.property('sqlite'); // abc is NaN
						Expect(tmpResult).to.not.have.property('bad');
					}
				);

				test
				(
					'Should handle single backend',
					function ()
					{
						let tmpResult = libProviderDiscovery.parseBackendsArg('mysql:8087');
						Expect(tmpResult).to.be.an('object');
						Expect(Object.keys(tmpResult).length).to.equal(1);
						Expect(tmpResult.mysql).to.equal(8087);
					}
				);

				test
				(
					'Should handle all seven providers',
					function ()
					{
						let tmpResult = libProviderDiscovery.parseBackendsArg('sqlite:8086,mysql:8087,mssql:8088,postgresql:8089,mongodb:8090,dgraph:8091,solr:8092');
						Expect(Object.keys(tmpResult).length).to.equal(7);
					}
				);
			}
		);

		suite
		(
			'Default Port Map',
			function ()
			{
				test
				(
					'Should have correct default port map',
					function ()
					{
						let tmpMap = libProviderDiscovery.DefaultProviderPortMap;
						Expect(tmpMap.sqlite).to.equal(8086);
						Expect(tmpMap.mysql).to.equal(8087);
						Expect(tmpMap.mssql).to.equal(8088);
						Expect(tmpMap.postgresql).to.equal(8089);
						Expect(tmpMap.mongodb).to.equal(8090);
						Expect(tmpMap.dgraph).to.equal(8091);
						Expect(tmpMap.solr).to.equal(8092);
					}
				);

				test
				(
					'Should have exactly seven providers in default map',
					function ()
					{
						let tmpMap = libProviderDiscovery.DefaultProviderPortMap;
						Expect(Object.keys(tmpMap).length).to.equal(7);
					}
				);
			}
		);

		suite
		(
			'Port Probing',
			function ()
			{
				test
				(
					'Should probe a live port',
					function (fDone)
					{
						libTestHelper.createMockServer(19501,
							{
								'GET /1.0/Books/Count': { status: 200, body: { Count: 5 } }
							},
							() =>
							{
								libProviderDiscovery.probePort(19501,
									(pIsLive) =>
									{
										Expect(pIsLive).to.equal(true);
										fDone();
									});
							});
					}
				);

				test
				(
					'Should not probe a dead port',
					function (fDone)
					{
						libProviderDiscovery.probePort(19599,
							(pIsLive) =>
							{
								Expect(pIsLive).to.equal(false);
								fDone();
							});
					}
				);
			}
		);
	}
);
