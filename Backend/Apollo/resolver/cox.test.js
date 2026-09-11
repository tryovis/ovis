const assert = require('node:assert/strict');
const test = require('node:test');

const { internal } = require('./cox');

test('exports only GraphQL resolver types as enumerable properties', () => {
	assert.deepEqual(Object.keys(require('./cox')), ['Query']);
});

test('sends only endpoint and selected covariates to R', () => {
	const rows = internal.prepareRowsForR(
		[
			{
				patID: 'patient-1',
				tumorID: 'tumour-1',
				center: 'Center A',
				time: 365,
				event: 1,
				entity: 'C50',
				age: 62,
				gender: 'female',
				ecog: '0'
			}
		],
		['age', 'gender']
	);

	assert.deepEqual(rows, { time: [365], event: [1], age: [62], gender: ['female'] });
});

test('preserves missing values and row alignment in column transport', () => {
	assert.deepEqual(
		internal.prepareRowsForR(
			[
				{ time: 10, event: 0, age: null },
				{ time: 20, event: 1, age: 55 },
				{ time: 30, event: 0 }
			],
			['age']
		),
		{ time: [10, 20, 30], event: [0, 1, 0], age: [null, 55, null] }
	);
});

test('analyses every row above the former 50,000 limit', async () => {
	const n = 50_001;
	const { Query } = require('./cox');
	const originalFetch = globalThis.fetch;
	const originalLimit = process.env.COX_MAX_ROWS;
	let sentRows = 0;
	process.env.COX_MAX_ROWS = '1'; // Old deployment settings must not truncate/reject the cohort.
	globalThis.fetch = async (_url, options) => {
		const payload = JSON.parse(options.body);
		sentRows = payload.rows.time.length;
		assert.ok(payload.deadlineUnixMs > Date.now());
		return {
			ok: true,
			text: async () => JSON.stringify({ status: 'OK', completeCases: n, events: n, warnings: [] })
		};
	};
	const db = {
		collection(name) {
			return {
				aggregate(pipeline) {
					if (name === 'diagnosis')
						return {
							async *[Symbol.asyncIterator]() {
								for (let i = 0; i < n; i++)
									yield {
										patID: i,
										tumorID: i,
										diagnosisDate: new Date('2020-01-01'),
										ageAtDiagnosis: 60
									};
							},
							async close() {}
						};
					assert.equal(name, 'kaplanMeier');
					return {
						toArray: async () =>
							pipeline[0].$match.tumorID.$in.map((tumorID) => ({
								tumorID,
								vitalDate: new Date('2021-01-01'),
								vitalState: 1
							}))
					};
				}
			};
		}
	};
	try {
		const result = await Query.getSurvivalCoxRegression(
			null,
			{ covariates: ['age'] },
			{
				db,
				collections: { diagnosis: 'diagnosis', kaplanmeier: 'kaplanMeier' }
			}
		);
		assert.equal(sentRows, n);
		assert.equal(result.completeCases, n);
		assert.equal(result.omittedCases, 0);
	} finally {
		globalThis.fetch = originalFetch;
		if (originalLimit === undefined) delete process.env.COX_MAX_ROWS;
		else process.env.COX_MAX_ROWS = originalLimit;
	}
});

test('counts every index patient as omitted when no model can be fitted', () => {
	const result = internal.emptyResult({
		message: 'No endpoint data',
		covariates: ['age'],
		dataset: {
			matchingDiagnoses: 12,
			indexPatients: 10,
			rows: [],
			availability: [],
			exclusions: { missingSurvival: 10, invalidTime: 0, invalidEvent: 0 }
		}
	});

	assert.equal(result.completeCases, 0);
	assert.equal(result.omittedCases, 10);
});
