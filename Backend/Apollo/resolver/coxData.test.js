const assert = require('node:assert/strict');
const test = require('node:test');

const {
	buildCoxRows,
	buildIndexDiagnosisPipeline,
	normalizeCovariates,
	summarizeAvailability,
	loadCoxDataset,
	COX_COVARIATES,
	internal
} = require('./coxData');

test('normalizes and validates the selected Cox covariates', () => {
	assert.deepEqual(normalizeCovariates(['age', 'gender', 'age']), ['age', 'gender']);
	assert.throws(() => normalizeCovariates([]), /At least one/);
	assert.throws(() => normalizeCovariates(['therapy']), /Unsupported/);
});

test('applies cohort filters before selecting one index diagnosis per patient', () => {
	const filterStage = { $match: { 'ICD.ICD10_3': 'C50' } };
	const pipeline = buildIndexDiagnosisPipeline([filterStage]);
	const filterIndex = pipeline.indexOf(filterStage);
	const sortIndex = pipeline.findIndex((stage) => stage.$sort);
	const groupIndex = pipeline.findIndex((stage) => stage.$group);

	assert.equal(filterIndex, 0);
	assert.ok(filterIndex < sortIndex);
	assert.ok(sortIndex < groupIndex);
	assert.equal(pipeline[groupIndex].$group.diagnosis.$first, '$$ROOT');
});

test('builds an OS row with KM-compatible UICC and TNM groups', () => {
	const diagnosisDate = new Date('2020-01-01T00:00:00Z');
	const result = buildCoxRows(
		[
			{
				patID: 'p1',
				tumorID: 't1',
				diagnosisDate,
				ageAtDiagnosis: 63,
				gender: 'w',
				ICD: { ICD10_3: 'C50' },
				metastasis: 'both',
				organizationalUnit: 'Center A',
				matchingDiagnosisCount: 2
			}
		],
		{
			survivalRecords: [
				{ tumorID: 't1', vitalDate: new Date('2021-01-01T00:00:00Z'), vitalState: 1 }
			],
			tnmRecords: [
				{
					tumorID: 't1',
					type: 'clinical',
					T: 'cT2',
					N: 'cN1',
					M: 'cM0',
					UICC: 'IIA',
					tnmOccurrenceDate: new Date('2020-01-02T00:00:00Z')
				},
				{
					tumorID: 't1',
					type: 'pathological',
					T: 'pT3',
					N: 'pN2',
					M: 'pM0',
					UICC: 'III',
					tnmOccurrenceDate: new Date('2020-01-20T00:00:00Z')
				}
			],
			histologyRecords: [
				{
					tumorID: 't1',
					ICDO_grading: '2',
					ICDO_histologyDate: new Date('2020-01-03T00:00:00Z')
				}
			],
			statusRecords: [
				{
					tumorID: 't1',
					type: 'ECOG',
					status: '1',
					statusOccurrenceDate: new Date('2019-12-20T00:00:00Z')
				}
			]
		}
	);

	assert.equal(result.rows.length, 1);
	assert.deepEqual(
		{
			age: result.rows[0].age,
			gender: result.rows[0].gender,
			uicc: result.rows[0].uicc,
			tStage: result.rows[0].tStage,
			nStage: result.rows[0].nStage,
			mStage: result.rows[0].mStage,
			grading: result.rows[0].grading,
			ecog: result.rows[0].ecog,
			diagnosisYear: result.rows[0].diagnosisYear,
			synchronousMetastasis: result.rows[0].synchronousMetastasis
		},
		{
			age: 63,
			gender: 'female',
			uicc: 'II',
			tStage: 'T3',
			nStage: 'N2',
			mStage: 'M0',
			grading: 'G2',
			ecog: '1',
			diagnosisYear: 2020,
			synchronousMetastasis: 'present'
		}
	);
	assert.equal(result.rows[0].time, 366);
	assert.equal(result.rows[0].event, 1);
});

test('loads only selected data and preserves results across batch boundaries', async () => {
	const diagnoses = Array.from({ length: 4005 }, (_, i) => ({
		patID: `p${i}`,
		tumorID: `t${i}`,
		diagnosisDate: new Date('2020-01-01'),
		ageAtDiagnosis: 40 + (i % 45),
		gender: i % 2 ? 'm' : 'w',
		matchingDiagnosisCount: 2
	}));
	const sources = {
		kaplanMeier: diagnoses
			.slice(1)
			.map(({ tumorID }) => ({ tumorID, vitalDate: new Date('2021-01-01'), vitalState: 1 })),
		tnm: diagnoses.map(({ tumorID }) => ({
			tumorID,
			type: 'pathological',
			T: 'T2',
			N: 'N1',
			M: 'M0',
			UICC: 'II',
			tnmOccurrenceDate: new Date('2020-02-01')
		})),
		histology: diagnoses.map(({ tumorID }) => ({
			tumorID,
			ICDO_grading: '2',
			ICDO_histologyDate: new Date('2020-02-01')
		})),
		status: diagnoses.map(({ tumorID }) => ({
			tumorID,
			type: 'ECOG',
			status: '1',
			statusOccurrenceDate: new Date('2020-02-01')
		}))
	};
	const expected = buildCoxRows(diagnoses, {
		survivalRecords: sources.kaplanMeier,
		tnmRecords: sources.tnm,
		histologyRecords: sources.histology,
		statusRecords: sources.status
	});
	for (const covariate of COX_COVARIATES) {
		const reads = [];
		let closed = false;
		const db = {
			collection(name) {
				return {
					aggregate(pipeline, options) {
						if (name === 'diagnosis') {
							assert.equal(options.allowDiskUse, true);
							return {
								async *[Symbol.asyncIterator]() {
									yield* diagnoses;
								},
								async close() {
									closed = true;
								}
							};
						}
						const ids = new Set(pipeline[0].$match.tumorID.$in);
						reads.push({ name, size: ids.size });
						return {
							toArray: async () => sources[name].filter((record) => ids.has(record.tumorID))
						};
					}
				};
			}
		};
		const result = await loadCoxDataset(
			db,
			{
				diagnosis: 'diagnosis',
				kaplanmeier: 'kaplanMeier',
				tnm: 'tnm',
				histology: 'histology',
				status: 'status'
			},
			[],
			undefined,
			[covariate]
		);
		assert.equal(closed, true);
		assert.equal(result.indexPatients, diagnoses.length);
		assert.equal(result.matchingDiagnoses, diagnoses.length * 2);
		assert.deepEqual(result.exclusions, expected.exclusions);
		assert.deepEqual(
			result.rows,
			expected.rows.map((row) => ({
				time: row.time,
				event: row.event,
				[covariate]: row[covariate]
			}))
		);
		assert.deepEqual(result.availability, summarizeAvailability(expected.rows, [covariate]));
		const extra = ['uicc', 'tStage', 'nStage', 'mStage'].includes(covariate)
			? ['tnm']
			: covariate === 'grading'
			? ['histology']
			: covariate === 'ecog'
			? ['status']
			: [];
		assert.deepEqual([...new Set(reads.map((read) => read.name))], ['kaplanMeier', ...extra]);
		assert.ok(reads.every((read) => read.size <= 2000));
		assert.equal(
			reads.filter((read) => read.name === 'kaplanMeier').reduce((sum, read) => sum + read.size, 0),
			diagnoses.length
		);
	}
});

test('closes diagnosis cursor when supporting data loading fails', async () => {
	let closed = false;
	const db = {
		collection(name) {
			return {
				aggregate() {
					if (name === 'diagnosis')
						return {
							async *[Symbol.asyncIterator]() {
								yield { tumorID: 1 };
							},
							async close() {
								closed = true;
							}
						};
					return {
						toArray: async () => {
							throw new Error('read failed');
						}
					};
				}
			};
		}
	};
	await assert.rejects(
		loadCoxDataset(db, { diagnosis: 'diagnosis', kaplanmeier: 'kaplanMeier' }, [], undefined, [
			'age'
		]),
		/read failed/
	);
	assert.equal(closed, true);
});

test('selection keeps the first record on equal date/priority and closest baseline value', () => {
	const date = new Date('2020-01-01');
	const records = [
		{ type: 'clinical', tnmOccurrenceDate: new Date('2020-01-02'), value: 'A' },
		{ type: 'pathological', tnmOccurrenceDate: new Date('2020-03-01'), value: 'B' },
		{ type: 'pathological', tnmOccurrenceDate: new Date('2020-03-01'), value: 'C' },
		{ type: 'definitive', tnmOccurrenceDate: new Date('2019-12-31'), value: 'D' }
	];
	assert.equal(
		internal.selectFirstTnmAfterDiagnosis(records, date, (r) => r.value, true),
		'B'
	);
	assert.equal(
		internal.selectFirstTnmAfterDiagnosis(records, date, (r) => r.value),
		'A'
	);
	assert.equal(
		internal.selectBaselineValue(records, date, (r) => r.value, undefined, {
			dateForRecord: (r) => r.tnmOccurrenceDate
		}),
		'A'
	);
});

test('uses the first post-diagnosis UICC and priority-grouped TNM values', () => {
	const diagnosisDate = new Date('2020-01-01T00:00:00Z');
	const records = [
		{
			type: 'pathological',
			UICC: 'IVB',
			T: 'pT4a',
			N: 'pN3',
			M: 'pM1',
			tnmOccurrenceDate: new Date('2021-01-01T00:00:00Z')
		},
		{
			type: 'clinical',
			UICC: 'II A',
			T: 'cT2',
			N: 'cN1',
			M: 'cM0',
			tnmOccurrenceDate: new Date('2020-01-02T00:00:00Z')
		}
	];

	assert.equal(
		internal.selectFirstTnmAfterDiagnosis(records, diagnosisDate, (record) =>
			internal.normalizeUiccGroup(record.UICC)
		),
		'II'
	);
	assert.equal(
		internal.selectFirstTnmAfterDiagnosis(
			records,
			diagnosisDate,
			(record) => internal.normalizeTnmGroup(record.T, 'T', ['1', '2', '3', '4']),
			true
		),
		'T4'
	);
});

test('excludes post-baseline values and invalid survival intervals', () => {
	const diagnosis = {
		patID: 'p1',
		tumorID: 't1',
		diagnosisDate: new Date('2020-01-01T00:00:00Z')
	};
	const withInvalidTime = buildCoxRows([diagnosis], {
		survivalRecords: [{ tumorID: 't1', vitalDate: new Date('2019-12-31T00:00:00Z'), vitalState: 0 }]
	});
	assert.equal(withInvalidTime.rows.length, 0);
	assert.equal(withInvalidTime.exclusions.invalidTime, 1);

	assert.equal(
		internal.selectBaselineValue(
			[{ value: '1', date: new Date('2021-01-01T00:00:00Z') }],
			diagnosis.diagnosisDate,
			(record) => record.value,
			{ beforeDays: 90, afterDays: 90 },
			{ dateForRecord: (record) => record.date }
		),
		null
	);
});

test('reports availability and categorical level counts', () => {
	const availability = summarizeAvailability([
		{ age: 50, gender: 'female' },
		{ age: null, gender: 'male' },
		{ age: 70, gender: 'female' }
	]);
	const age = availability.find((entry) => entry.covariate === 'age');
	const gender = availability.find((entry) => entry.covariate === 'gender');

	assert.equal(age.available, 2);
	assert.equal(age.missing, 1);
	assert.deepEqual(gender.levels, [
		{ value: 'female', count: 2 },
		{ value: 'male', count: 1 }
	]);
});
