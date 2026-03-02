/**
* Response Comparator — Low-Level Object Tests
*
* Tests the response normalization and diff engine: field exclusion,
* type coercion, array comparison, count comparison, and report generation.
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/
var Chai = require("chai");
var Expect = Chai.expect;

const libFable = require('fable');
const libResponseComparator = require('../source/Service-ResponseComparator.js');

suite
(
	'Response Comparator',
	function ()
	{
		this.timeout(10000);

		let _Fable;
		let _Comparator;

		suiteSetup
		(
			function ()
			{
				_Fable = new libFable(
					{
						Product: 'ComparatorTest',
						LogStreams: [{ streamtype: 'console', level: 'fatal' }]
					});
				_Fable.serviceManager.addServiceType('ResponseComparator', libResponseComparator);
				_Fable.serviceManager.instantiateServiceProvider('ResponseComparator');
				_Comparator = _Fable.ResponseComparator;
			}
		);

		suite
		(
			'Object Consistency',
			function ()
			{
				test
				(
					'Should report consistent when all providers agree on an object',
					function ()
					{
						let tmpResults =
						{
							'sqlite': { status: 200, body: { IDBook: 1, Title: 'Dune', Genre: 'SciFi', GUIDBook: 'aaa' }, timingMs: 10, error: null },
							'mysql': { status: 200, body: { IDBook: 5, Title: 'Dune', Genre: 'SciFi', GUIDBook: 'bbb' }, timingMs: 20, error: null }
						};

						let tmpReport = _Comparator.compare(tmpResults);
						Expect(tmpReport.consistent).to.equal(true);
						Expect(tmpReport.differences.length).to.equal(0);
						Expect(tmpReport.summary).to.contain('agree');
					}
				);

				test
				(
					'Should detect differences in business fields',
					function ()
					{
						let tmpResults =
						{
							'sqlite': { status: 200, body: { IDBook: 1, Title: 'Dune', Genre: 'SciFi' }, timingMs: 10, error: null },
							'mysql': { status: 200, body: { IDBook: 5, Title: 'DUNE', Genre: 'SciFi' }, timingMs: 20, error: null }
						};

						let tmpReport = _Comparator.compare(tmpResults);
						Expect(tmpReport.consistent).to.equal(false);
						Expect(tmpReport.differences.length).to.be.greaterThan(0);

						let tmpTitleDiff = tmpReport.differences.find((pDiff) => pDiff.path === '$.body.Title');
						Expect(tmpTitleDiff).to.be.an('object');
						Expect(tmpTitleDiff.values.sqlite).to.equal('Dune');
						Expect(tmpTitleDiff.values.mysql).to.equal('DUNE');
					}
				);

				test
				(
					'Should handle single provider gracefully',
					function ()
					{
						let tmpResults =
						{
							'sqlite': { status: 200, body: { Title: 'Dune' }, timingMs: 10, error: null }
						};

						let tmpReport = _Comparator.compare(tmpResults);
						Expect(tmpReport.consistent).to.equal(true);
						Expect(tmpReport.summary).to.contain('nothing to compare');
					}
				);

				test
				(
					'Should report consistent with three agreeing providers',
					function ()
					{
						let tmpResults =
						{
							'sqlite': { status: 200, body: { IDBook: 1, Title: 'Dune', Genre: 'SciFi' }, timingMs: 10, error: null },
							'mysql': { status: 200, body: { IDBook: 5, Title: 'Dune', Genre: 'SciFi' }, timingMs: 20, error: null },
							'postgresql': { status: 200, body: { IDBook: 100, Title: 'Dune', Genre: 'SciFi' }, timingMs: 15, error: null }
						};

						let tmpReport = _Comparator.compare(tmpResults);
						Expect(tmpReport.consistent).to.equal(true);
						Expect(tmpReport.providerCount).to.equal(3);
					}
				);
			}
		);

		suite
		(
			'Field Exclusion',
			function ()
			{
				test
				(
					'Should exclude ID fields from comparison',
					function ()
					{
						let tmpResults =
						{
							'sqlite': { status: 200, body: { IDBook: 1, GUIDBook: 'aaa-111', Title: 'Dune' }, timingMs: 10, error: null },
							'mysql': { status: 200, body: { IDBook: 999, GUIDBook: 'bbb-222', Title: 'Dune' }, timingMs: 20, error: null }
						};

						let tmpReport = _Comparator.compare(tmpResults);
						Expect(tmpReport.consistent).to.equal(true);

						let tmpIDDiff = tmpReport.differences.find((pDiff) => pDiff.path.indexOf('IDBook') !== -1);
						Expect(tmpIDDiff).to.equal(undefined);
					}
				);

				test
				(
					'Should exclude GUID fields from comparison',
					function ()
					{
						let tmpResults =
						{
							'sqlite': { status: 200, body: { IDBook: 1, GUIDBook: 'aaa-111', Title: 'Dune' }, timingMs: 10, error: null },
							'mysql': { status: 200, body: { IDBook: 999, GUIDBook: 'bbb-222', Title: 'Dune' }, timingMs: 20, error: null }
						};

						let tmpReport = _Comparator.compare(tmpResults);

						let tmpGUIDDiff = tmpReport.differences.find((pDiff) => pDiff.path.indexOf('GUIDBook') !== -1);
						Expect(tmpGUIDDiff).to.equal(undefined);
					}
				);

				test
				(
					'Should exclude timestamp fields from comparison',
					function ()
					{
						let tmpResults =
						{
							'sqlite': { status: 200, body: { Title: 'Dune', CreateDate: '2024-01-01', UpdateDate: '2024-06-01' }, timingMs: 10, error: null },
							'mysql': { status: 200, body: { Title: 'Dune', CreateDate: '2024-01-01T00:00:00Z', UpdateDate: null }, timingMs: 20, error: null }
						};

						let tmpReport = _Comparator.compare(tmpResults);
						Expect(tmpReport.consistent).to.equal(true);
					}
				);

				test
				(
					'Should exclude user tracking fields from comparison',
					function ()
					{
						let tmpResults =
						{
							'sqlite': { status: 200, body: { Title: 'Dune', CreatingIDUser: 1, UpdatingIDUser: 1, DeletingIDUser: 0 }, timingMs: 10, error: null },
							'mysql': { status: 200, body: { Title: 'Dune', CreatingIDUser: 50, UpdatingIDUser: 50, DeletingIDUser: 0 }, timingMs: 20, error: null }
						};

						let tmpReport = _Comparator.compare(tmpResults);
						Expect(tmpReport.consistent).to.equal(true);
					}
				);

				test
				(
					'Should exclude foreign key ID fields (IDAuthor, etc)',
					function ()
					{
						let tmpResults =
						{
							'sqlite': { status: 200, body: { IDBookAuthorJoin: 1, IDBook: 1, IDAuthor: 1, Role: 'Primary' }, timingMs: 10, error: null },
							'mysql': { status: 200, body: { IDBookAuthorJoin: 99, IDBook: 50, IDAuthor: 75, Role: 'Primary' }, timingMs: 20, error: null }
						};

						let tmpReport = _Comparator.compare(tmpResults);
						Expect(tmpReport.consistent).to.equal(true);
					}
				);
			}
		);

		suite
		(
			'Type Normalization',
			function ()
			{
				test
				(
					'Should normalize numeric strings for comparison',
					function ()
					{
						let tmpResults =
						{
							'sqlite': { status: 200, body: { Price: 19.99, Deleted: 0 }, timingMs: 10, error: null },
							'mysql': { status: 200, body: { Price: '19.99', Deleted: '0' }, timingMs: 20, error: null }
						};

						let tmpReport = _Comparator.compare(tmpResults);
						Expect(tmpReport.consistent).to.equal(true);
					}
				);

				test
				(
					'Should not conflate different numeric strings',
					function ()
					{
						let tmpResults =
						{
							'sqlite': { status: 200, body: { Price: 19.99 }, timingMs: 10, error: null },
							'mysql': { status: 200, body: { Price: '20.00' }, timingMs: 20, error: null }
						};

						let tmpReport = _Comparator.compare(tmpResults);
						Expect(tmpReport.consistent).to.equal(false);
					}
				);
			}
		);

		suite
		(
			'Status Code Comparison',
			function ()
			{
				test
				(
					'Should detect status code differences',
					function ()
					{
						let tmpResults =
						{
							'sqlite': { status: 200, body: { Title: 'Dune' }, timingMs: 10, error: null },
							'mongodb': { status: 404, body: { Error: 'Record not Found' }, timingMs: 15, error: null }
						};

						let tmpReport = _Comparator.compare(tmpResults);
						Expect(tmpReport.consistent).to.equal(false);

						let tmpStatusDiff = tmpReport.differences.find((pDiff) => pDiff.path === '$.status');
						Expect(tmpStatusDiff).to.be.an('object');
						Expect(tmpStatusDiff.values.sqlite).to.equal(200);
						Expect(tmpStatusDiff.values.mongodb).to.equal(404);
					}
				);
			}
		);

		suite
		(
			'Count Comparison',
			function ()
			{
				test
				(
					'Should compare consistent Count responses',
					function ()
					{
						let tmpResults =
						{
							'sqlite': { status: 200, body: { Count: 6 }, timingMs: 10, error: null },
							'mysql': { status: 200, body: { Count: 6 }, timingMs: 20, error: null }
						};

						let tmpReport = _Comparator.compare(tmpResults);
						Expect(tmpReport.consistent).to.equal(true);
					}
				);

				test
				(
					'Should detect inconsistent Count responses',
					function ()
					{
						let tmpResults =
						{
							'sqlite': { status: 200, body: { Count: 6 }, timingMs: 10, error: null },
							'mysql': { status: 200, body: { Count: 6 }, timingMs: 20, error: null },
							'mongodb': { status: 200, body: { Count: 0 }, timingMs: 15, error: null }
						};

						let tmpReport = _Comparator.compare(tmpResults);
						Expect(tmpReport.consistent).to.equal(false);

						let tmpCountDiff = tmpReport.differences.find((pDiff) => pDiff.path === '$.body.Count');
						Expect(tmpCountDiff).to.be.an('object');
						Expect(tmpCountDiff.values.mongodb).to.equal(0);
					}
				);
			}
		);

		suite
		(
			'Array Comparison',
			function ()
			{
				test
				(
					'Should compare array lengths',
					function ()
					{
						let tmpResults =
						{
							'sqlite': { status: 200, body: [{ Title: 'A' }, { Title: 'B' }], timingMs: 10, error: null },
							'mysql': { status: 200, body: [{ Title: 'A' }, { Title: 'B' }, { Title: 'C' }], timingMs: 20, error: null }
						};

						let tmpReport = _Comparator.compare(tmpResults);
						Expect(tmpReport.consistent).to.equal(false);

						let tmpLengthDiff = tmpReport.differences.find((pDiff) => pDiff.path === '$.body.length');
						Expect(tmpLengthDiff).to.be.an('object');
						Expect(tmpLengthDiff.values.sqlite).to.equal(2);
						Expect(tmpLengthDiff.values.mysql).to.equal(3);
					}
				);

				test
				(
					'Should compare array elements on business fields',
					function ()
					{
						let tmpResults =
						{
							'sqlite': { status: 200, body: [{ IDBook: 1, Title: 'Dune', Genre: 'SciFi' }], timingMs: 10, error: null },
							'mysql': { status: 200, body: [{ IDBook: 99, Title: 'Dune', Genre: 'Fantasy' }], timingMs: 20, error: null }
						};

						let tmpReport = _Comparator.compare(tmpResults);
						Expect(tmpReport.consistent).to.equal(false);

						// Should find Genre difference but not IDBook
						let tmpGenreDiff = tmpReport.differences.find((pDiff) => pDiff.path === '$.body[0].Genre');
						Expect(tmpGenreDiff).to.be.an('object');

						let tmpIDDiff = tmpReport.differences.find((pDiff) => pDiff.path.indexOf('IDBook') !== -1);
						Expect(tmpIDDiff).to.equal(undefined);
					}
				);

				test
				(
					'Should report consistent arrays with same business data',
					function ()
					{
						let tmpResults =
						{
							'sqlite': { status: 200, body: [{ IDBook: 1, Title: 'Dune' }, { IDBook: 2, Title: 'Foundation' }], timingMs: 10, error: null },
							'mysql': { status: 200, body: [{ IDBook: 50, Title: 'Dune' }, { IDBook: 51, Title: 'Foundation' }], timingMs: 20, error: null }
						};

						let tmpReport = _Comparator.compare(tmpResults);
						Expect(tmpReport.consistent).to.equal(true);
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
					'Should handle error providers',
					function ()
					{
						let tmpResults =
						{
							'sqlite': { status: 200, body: { Title: 'Dune' }, timingMs: 10, error: null },
							'mysql': { status: 0, body: null, timingMs: 0, error: 'Connection error: ECONNREFUSED' }
						};

						let tmpReport = _Comparator.compare(tmpResults);
						Expect(tmpReport.consistent).to.equal(false);

						let tmpErrorDiff = tmpReport.differences.find((pDiff) => pDiff.path === '$.error');
						Expect(tmpErrorDiff).to.be.an('object');
					}
				);
			}
		);
	}
);
