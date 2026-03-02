/**
* Response Comparator Service
*
* Fable service that normalizes and diffs responses from multiple harness
* backends. Strips auto-generated fields (IDs, GUIDs, timestamps) before
* comparison so that only business-relevant data is evaluated.
*
* @author Steven Velozo <steven@velozo.com>
*/
const libFableServiceProviderBase = require('fable-serviceproviderbase');

// Patterns for fields to exclude from value comparison
const _ExcludedFieldPatterns =
[
	/^ID[A-Z]/,            // IDBook, IDAuthor, IDBookAuthorJoin, etc.
	/^GUID[A-Z]/,          // GUIDBook, GUIDAuthor, etc.
	/^CreateDate$/,
	/^UpdateDate$/,
	/^DeleteDate$/,
	/^CreatingIDUser$/,
	/^UpdatingIDUser$/,
	/^DeletingIDUser$/
];

class ResponseComparator extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'ResponseComparator';
	}

	/**
	* Compare responses from multiple providers.
	*
	* @param {object} pResults - Map of { providerKey: { status, body, timingMs, error } }
	* @returns {object} Comparison report
	*/
	compare(pResults)
	{
		let tmpProviderKeys = Object.keys(pResults);

		if (tmpProviderKeys.length === 0)
		{
			return (
				{
					consistent: true,
					providerCount: 0,
					differences: [],
					summary: 'No providers to compare'
				});
		}

		if (tmpProviderKeys.length === 1)
		{
			return (
				{
					consistent: true,
					providerCount: 1,
					differences: [],
					summary: `Only 1 provider (${tmpProviderKeys[0]}), nothing to compare`
				});
		}

		let tmpDifferences = [];

		// Check for errors first
		let tmpErrorProviders = [];
		let tmpLiveProviders = [];

		for (let i = 0; i < tmpProviderKeys.length; i++)
		{
			let tmpKey = tmpProviderKeys[i];

			if (pResults[tmpKey].error)
			{
				tmpErrorProviders.push(tmpKey);
			}
			else
			{
				tmpLiveProviders.push(tmpKey);
			}
		}

		if (tmpErrorProviders.length > 0)
		{
			let tmpErrorValues = {};

			for (let i = 0; i < tmpProviderKeys.length; i++)
			{
				let tmpKey = tmpProviderKeys[i];
				tmpErrorValues[tmpKey] = pResults[tmpKey].error || 'OK';
			}

			tmpDifferences.push(
				{
					path: '$.error',
					values: tmpErrorValues
				});
		}

		// Compare status codes
		if (tmpLiveProviders.length > 1)
		{
			let tmpStatusValues = {};
			let tmpStatusSet = {};

			for (let i = 0; i < tmpLiveProviders.length; i++)
			{
				let tmpKey = tmpLiveProviders[i];
				let tmpStatus = pResults[tmpKey].status;
				tmpStatusValues[tmpKey] = tmpStatus;
				tmpStatusSet[tmpStatus] = true;
			}

			if (Object.keys(tmpStatusSet).length > 1)
			{
				tmpDifferences.push(
					{
						path: '$.status',
						values: tmpStatusValues
					});
			}
		}

		// Compare response bodies
		if (tmpLiveProviders.length > 1)
		{
			let tmpFirstKey = tmpLiveProviders[0];
			let tmpFirstBody = pResults[tmpFirstKey].body;

			this._compareBodyAcrossProviders(tmpLiveProviders, pResults, tmpDifferences);
		}

		// Build summary
		let tmpSummary = this._buildSummary(tmpProviderKeys, tmpDifferences, tmpErrorProviders);

		return (
			{
				consistent: tmpDifferences.length === 0,
				providerCount: tmpProviderKeys.length,
				differences: tmpDifferences,
				summary: tmpSummary
			});
	}

	/**
	* Compare response bodies across all live providers.
	*
	* @param {Array} pProviderKeys - Keys of providers that responded
	* @param {object} pResults - Full results map
	* @param {Array} pDifferences - Differences array to append to
	*/
	_compareBodyAcrossProviders(pProviderKeys, pResults, pDifferences)
	{
		let tmpFirstKey = pProviderKeys[0];
		let tmpFirstBody = pResults[tmpFirstKey].body;

		// Determine response type
		if (Array.isArray(tmpFirstBody))
		{
			this._compareArrayResponses(pProviderKeys, pResults, pDifferences);
		}
		else if (tmpFirstBody && typeof tmpFirstBody === 'object')
		{
			// Check if it's a Count response
			if (tmpFirstBody.hasOwnProperty('Count'))
			{
				this._compareCountResponses(pProviderKeys, pResults, pDifferences);
			}
			else
			{
				this._compareObjectResponses(pProviderKeys, pResults, pDifferences);
			}
		}
		else
		{
			// Scalar or string — compare directly
			this._compareScalarResponses(pProviderKeys, pResults, pDifferences);
		}
	}

	/**
	* Compare single-object responses (Read, Create, Update).
	*/
	_compareObjectResponses(pProviderKeys, pResults, pDifferences)
	{
		// Collect all field names across all providers
		let tmpAllFields = {};

		for (let i = 0; i < pProviderKeys.length; i++)
		{
			let tmpBody = pResults[pProviderKeys[i]].body;

			if (tmpBody && typeof tmpBody === 'object')
			{
				let tmpKeys = Object.keys(tmpBody);

				for (let j = 0; j < tmpKeys.length; j++)
				{
					tmpAllFields[tmpKeys[j]] = true;
				}
			}
		}

		let tmpFieldNames = Object.keys(tmpAllFields);

		for (let i = 0; i < tmpFieldNames.length; i++)
		{
			let tmpField = tmpFieldNames[i];

			// Skip excluded fields
			if (this._isExcludedField(tmpField))
			{
				continue;
			}

			// Compare this field across providers
			let tmpValues = {};
			let tmpValueSet = {};

			for (let j = 0; j < pProviderKeys.length; j++)
			{
				let tmpKey = pProviderKeys[j];
				let tmpBody = pResults[tmpKey].body;
				let tmpValue = (tmpBody && tmpBody.hasOwnProperty(tmpField))
					? tmpBody[tmpField]
					: undefined;

				// Normalize null-like values for comparison
				let tmpNormalized = this._normalizeValue(tmpValue);
				tmpValues[tmpKey] = tmpValue;
				tmpValueSet[JSON.stringify(tmpNormalized)] = true;
			}

			if (Object.keys(tmpValueSet).length > 1)
			{
				pDifferences.push(
					{
						path: `$.body.${tmpField}`,
						values: tmpValues
					});
			}
		}
	}

	/**
	* Compare array responses (Reads).
	*/
	_compareArrayResponses(pProviderKeys, pResults, pDifferences)
	{
		// Compare array lengths
		let tmpLengthValues = {};
		let tmpLengthSet = {};

		for (let i = 0; i < pProviderKeys.length; i++)
		{
			let tmpKey = pProviderKeys[i];
			let tmpBody = pResults[tmpKey].body;
			let tmpLength = Array.isArray(tmpBody) ? tmpBody.length : 0;
			tmpLengthValues[tmpKey] = tmpLength;
			tmpLengthSet[tmpLength] = true;
		}

		if (Object.keys(tmpLengthSet).length > 1)
		{
			pDifferences.push(
				{
					path: '$.body.length',
					values: tmpLengthValues
				});
		}

		// Compare element-by-element on normalized business fields
		// Find the minimum array length to compare
		let tmpMinLength = Infinity;

		for (let i = 0; i < pProviderKeys.length; i++)
		{
			let tmpBody = pResults[pProviderKeys[i]].body;
			let tmpLength = Array.isArray(tmpBody) ? tmpBody.length : 0;

			if (tmpLength < tmpMinLength)
			{
				tmpMinLength = tmpLength;
			}
		}

		// Sort each array by ID column for stable comparison
		let tmpSortedBodies = {};

		for (let i = 0; i < pProviderKeys.length; i++)
		{
			let tmpKey = pProviderKeys[i];
			let tmpBody = pResults[tmpKey].body;

			if (Array.isArray(tmpBody))
			{
				tmpSortedBodies[tmpKey] = this._sortArrayByBusinessFields(tmpBody);
			}
			else
			{
				tmpSortedBodies[tmpKey] = [];
			}
		}

		// Compare each element
		for (let idx = 0; idx < tmpMinLength; idx++)
		{
			let tmpAllFields = {};

			for (let i = 0; i < pProviderKeys.length; i++)
			{
				let tmpElement = tmpSortedBodies[pProviderKeys[i]][idx];

				if (tmpElement && typeof tmpElement === 'object')
				{
					let tmpKeys = Object.keys(tmpElement);

					for (let j = 0; j < tmpKeys.length; j++)
					{
						tmpAllFields[tmpKeys[j]] = true;
					}
				}
			}

			let tmpFieldNames = Object.keys(tmpAllFields);

			for (let f = 0; f < tmpFieldNames.length; f++)
			{
				let tmpField = tmpFieldNames[f];

				if (this._isExcludedField(tmpField))
				{
					continue;
				}

				let tmpValues = {};
				let tmpValueSet = {};

				for (let p = 0; p < pProviderKeys.length; p++)
				{
					let tmpKey = pProviderKeys[p];
					let tmpElement = tmpSortedBodies[tmpKey][idx];
					let tmpValue = (tmpElement && tmpElement.hasOwnProperty(tmpField))
						? tmpElement[tmpField]
						: undefined;
					let tmpNormalized = this._normalizeValue(tmpValue);
					tmpValues[tmpKey] = tmpValue;
					tmpValueSet[JSON.stringify(tmpNormalized)] = true;
				}

				if (Object.keys(tmpValueSet).length > 1)
				{
					pDifferences.push(
						{
							path: `$.body[${idx}].${tmpField}`,
							values: tmpValues
						});
				}
			}
		}
	}

	/**
	* Compare Count responses.
	*/
	_compareCountResponses(pProviderKeys, pResults, pDifferences)
	{
		let tmpCountValues = {};
		let tmpCountSet = {};

		for (let i = 0; i < pProviderKeys.length; i++)
		{
			let tmpKey = pProviderKeys[i];
			let tmpBody = pResults[tmpKey].body;
			let tmpCount = (tmpBody && tmpBody.hasOwnProperty('Count')) ? tmpBody.Count : null;
			tmpCountValues[tmpKey] = tmpCount;
			tmpCountSet[JSON.stringify(tmpCount)] = true;
		}

		if (Object.keys(tmpCountSet).length > 1)
		{
			pDifferences.push(
				{
					path: '$.body.Count',
					values: tmpCountValues
				});
		}
	}

	/**
	* Compare scalar/string responses.
	*/
	_compareScalarResponses(pProviderKeys, pResults, pDifferences)
	{
		let tmpValues = {};
		let tmpValueSet = {};

		for (let i = 0; i < pProviderKeys.length; i++)
		{
			let tmpKey = pProviderKeys[i];
			let tmpNormalized = this._normalizeValue(pResults[tmpKey].body);
			tmpValues[tmpKey] = pResults[tmpKey].body;
			tmpValueSet[JSON.stringify(tmpNormalized)] = true;
		}

		if (Object.keys(tmpValueSet).length > 1)
		{
			pDifferences.push(
				{
					path: '$.body',
					values: tmpValues
				});
		}
	}

	/**
	* Check if a field name matches an excluded pattern.
	*
	* @param {string} pFieldName
	* @returns {boolean}
	*/
	_isExcludedField(pFieldName)
	{
		for (let i = 0; i < _ExcludedFieldPatterns.length; i++)
		{
			if (_ExcludedFieldPatterns[i].test(pFieldName))
			{
				return true;
			}
		}

		return false;
	}

	/**
	* Normalize a value for comparison purposes.
	* Treats null, undefined, empty string, and 0 distinctly but
	* normalizes type coercions that databases may introduce.
	*
	* @param {*} pValue
	* @returns {*}
	*/
	_normalizeValue(pValue)
	{
		if (pValue === null || pValue === undefined)
		{
			return null;
		}

		// Normalize numeric strings to numbers
		if (typeof pValue === 'string' && pValue.match(/^\-?\d+(\.\d+)?$/))
		{
			return parseFloat(pValue);
		}

		return pValue;
	}

	/**
	* Sort an array of record objects by business fields for stable comparison.
	* Uses the first non-excluded string or numeric field as the sort key.
	*
	* @param {Array} pArray
	* @returns {Array} Sorted copy
	*/
	_sortArrayByBusinessFields(pArray)
	{
		if (!pArray || pArray.length === 0)
		{
			return [];
		}

		// Find a good sort key — first string field that isn't excluded
		let tmpSortField = null;
		let tmpFirstElement = pArray[0];

		if (tmpFirstElement && typeof tmpFirstElement === 'object')
		{
			let tmpKeys = Object.keys(tmpFirstElement);

			for (let i = 0; i < tmpKeys.length; i++)
			{
				let tmpKey = tmpKeys[i];

				if (!this._isExcludedField(tmpKey))
				{
					let tmpVal = tmpFirstElement[tmpKey];

					if (typeof tmpVal === 'string' && tmpVal.length > 0)
					{
						tmpSortField = tmpKey;
						break;
					}
				}
			}

			// Fallback to first non-excluded numeric field
			if (!tmpSortField)
			{
				for (let i = 0; i < tmpKeys.length; i++)
				{
					let tmpKey = tmpKeys[i];

					if (!this._isExcludedField(tmpKey) && typeof tmpFirstElement[tmpKey] === 'number')
					{
						tmpSortField = tmpKey;
						break;
					}
				}
			}
		}

		if (!tmpSortField)
		{
			return pArray.slice();
		}

		return pArray.slice().sort(
			(a, b) =>
			{
				let tmpA = a[tmpSortField] || '';
				let tmpB = b[tmpSortField] || '';

				if (typeof tmpA === 'number' && typeof tmpB === 'number')
				{
					return tmpA - tmpB;
				}

				return String(tmpA).localeCompare(String(tmpB));
			});
	}

	/**
	* Build a human-readable summary string.
	*
	* @param {Array} pProviderKeys - All provider keys
	* @param {Array} pDifferences - Detected differences
	* @param {Array} pErrorProviders - Providers that returned errors
	* @returns {string}
	*/
	_buildSummary(pProviderKeys, pDifferences, pErrorProviders)
	{
		let tmpTotal = pProviderKeys.length;

		if (pErrorProviders.length === tmpTotal)
		{
			return `All ${tmpTotal} providers returned errors`;
		}

		if (pDifferences.length === 0)
		{
			return `All ${tmpTotal} providers agree`;
		}

		// Find which providers differ
		let tmpDifferingProviders = {};

		for (let i = 0; i < pDifferences.length; i++)
		{
			let tmpDiff = pDifferences[i];
			let tmpValues = tmpDiff.values;
			let tmpValueKeys = Object.keys(tmpValues);

			// Find the majority value
			let tmpValueCounts = {};

			for (let j = 0; j < tmpValueKeys.length; j++)
			{
				let tmpStringified = JSON.stringify(tmpValues[tmpValueKeys[j]]);

				if (!tmpValueCounts[tmpStringified])
				{
					tmpValueCounts[tmpStringified] = [];
				}

				tmpValueCounts[tmpStringified].push(tmpValueKeys[j]);
			}

			// Find minority providers
			let tmpMaxCount = 0;
			let tmpMajorityValue = null;
			let tmpCountEntries = Object.keys(tmpValueCounts);

			for (let j = 0; j < tmpCountEntries.length; j++)
			{
				if (tmpValueCounts[tmpCountEntries[j]].length > tmpMaxCount)
				{
					tmpMaxCount = tmpValueCounts[tmpCountEntries[j]].length;
					tmpMajorityValue = tmpCountEntries[j];
				}
			}

			for (let j = 0; j < tmpCountEntries.length; j++)
			{
				if (tmpCountEntries[j] !== tmpMajorityValue)
				{
					let tmpMinorityProviders = tmpValueCounts[tmpCountEntries[j]];

					for (let k = 0; k < tmpMinorityProviders.length; k++)
					{
						tmpDifferingProviders[tmpMinorityProviders[k]] = true;
					}
				}
			}
		}

		let tmpDifferingList = Object.keys(tmpDifferingProviders);
		let tmpAgreeing = tmpTotal - tmpDifferingList.length;

		if (tmpDifferingList.length === 0)
		{
			return `${tmpTotal} providers with ${pDifferences.length} difference(s)`;
		}

		let tmpDiffPaths = pDifferences.map((pDiff) => pDiff.path.replace('$.', '')).slice(0, 5);
		let tmpPathSummary = tmpDiffPaths.join(', ');

		if (pDifferences.length > 5)
		{
			tmpPathSummary += ` (+${pDifferences.length - 5} more)`;
		}

		return `${tmpAgreeing} of ${tmpTotal} providers agree. ${tmpDifferingList.join(', ')} differ(s) on: ${tmpPathSummary}`;
	}
}

module.exports = ResponseComparator;
