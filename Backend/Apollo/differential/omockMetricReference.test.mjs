import assert from 'node:assert/strict';
import test from 'node:test';
import {
	calculateRawOmockMetrics,
	rawOmockDate,
	rawAgeAtDiagnosis,
	metricHistogram,
	normalizeLabelCountMetric,
	normalizeTumorYearGenderMetric
} from './omockMetricReference.mjs';

const source = () => ({
	patient: [
		{ patID: 'p1', gender: 'm', birthDate: '2000-01-01', vitalState: 'alive' },
		{ patID: 'p2', gender: 'w', birthDate: '', vitalState: '' },
		{ patID: 'p3', gender: null, birthDate: '1990-01-01' },
		{ patID: 'p4', gender: '', birthDate: '1980-01-01' }
	],
	diagnosis: [
		{ patID: 'p1', tumorID: 't1', ICD_ICD10: 'C34.1', diagnosisDate: '2020-01-01' },
		{ patID: 'p1', tumorID: 't2', ICD_ICD10: 'C50.9', diagnosisDate: '2024-01-01' },
		{ patID: 'p2', tumorID: 't3', ICD_ICD10: '', diagnosisDate: '2020-01-01' },
		{ patID: 'p3', tumorID: 't4', diagnosisDate: '' }
	],
	therapy: [
		{ tumorID: 't1', therapyID: 'a', generalType: 'operation' },
		{ tumorID: 't1', therapyID: 'b', generalType: 'systemic' },
		{ tumorID: 't2', therapyID: 'c', generalType: 'radiation' },
		{ tumorID: 't3', therapyID: 'd', generalType: 'radiation' }
	],
	singleRadiation: [{ therapyID: 'c' }, { therapyID: 'c' }],
	progress: [{ tumorID: 't1' }, { tumorID: 't1' }, { tumorID: 't4' }]
});

test('raw metrics distinguish patient, tumor and event units without mutating OMock', () => {
	const raw = source();
	const before = structuredClone(raw);
	const actual = calculateRawOmockMetrics(raw);
	assert.deepEqual(raw, before);
	assert.equal(actual.counts.patient, 4);
	assert.equal(actual.counts.diagnosis, 4);
	assert.equal(actual.counts.therapy, 4);
	assert.equal(actual.counts.radiation, 3);
	assert.deepEqual(actual.diagnosisAge, [
		{ value: 20, count: 1 },
		{ value: 24, count: 1 }
	]);
	assert.deepEqual(actual.ageSummary, {
		known: 2,
		missing: 2,
		minimum: 20,
		maximum: 24,
		mean: 22,
		median: 22
	});
	assert.deepEqual(actual.diagnosisIcd3, [
		{ value: '', count: 2 },
		{ value: 'C34', count: 1 },
		{ value: 'C50', count: 1 }
	]);
});

test('tumor locks deduplicate multi-tumor patients, exclude unrelated patients and support empty scope', () => {
	const actual = calculateRawOmockMetrics(source(), { tumorIds: ['t1', 't2'] });
	assert.equal(actual.counts.patient, 1);
	assert.equal(actual.counts.diagnosis, 2);
	assert.equal(actual.counts.progress, 2);
	assert.deepEqual(actual.patientGender, [{ value: 'm', count: 1 }]);
	const empty = calculateRawOmockMetrics(source(), { tumorIds: [] });
	assert.ok(Object.values(empty.counts).every((count) => count === 0));
	assert.deepEqual(empty.ageSummary, {
		known: 0,
		missing: 0,
		minimum: null,
		maximum: null,
		mean: null,
		median: null
	});
});

test('local event predicates do not count unrelated events from the same tumor', () => {
	const actual = calculateRawOmockMetrics(source(), {
		tumorIds: ['t1'],
		includeRow: (collection, row) => collection !== 'therapy' || row.generalType === 'operation'
	});
	assert.equal(actual.counts.diagnosis, 1);
	assert.equal(actual.counts.therapy, 1);
	assert.equal(actual.counts.operation, 1);
	assert.equal(actual.counts.systemic, 0);
});

test('date parsing covers UTC offsets, German dates, leap days and unknown/invalid values', () => {
	assert.equal(rawOmockDate('29.02.2024').toISOString(), '2024-02-29T00:00:00.000Z');
	assert.equal(rawOmockDate('2024-01-01T00:30:00+01:00').toISOString(), '2023-12-31T23:30:00.000Z');
	for (const invalid of [
		null,
		undefined,
		'',
		' ',
		'-',
		'not-a-date',
		'00.00.0000',
		'2023-02-29',
		'31.04.2024',
		'1899-12-31',
		0,
		false
	]) {
		assert.equal(rawOmockDate(invalid), null, String(invalid));
		assert.equal(rawAgeAtDiagnosis('2024-01-01', invalid), null, String(invalid));
	}
	assert.equal(rawAgeAtDiagnosis('2000-01-01', '2000-01-01'), 0);
	assert.equal(rawAgeAtDiagnosis('2020-07-02', '2000-01-01'), 21);
});

test('histogram preserves blank, space, dash and typed values; missing joins null', () => {
	assert.deepEqual(
		metricHistogram([null, undefined, '', ' ', '-', 0, false, '0']),
		[
			{ value: ' ', count: 1 },
			{ value: '-', count: 1 },
			{ value: '', count: 1 },
			{ value: '0', count: 1 },
			{ value: 0, count: 1 },
			{ value: false, count: 1 },
			{ value: null, count: 2 }
		].sort((a, b) => JSON.stringify(a.value).localeCompare(JSON.stringify(b.value), 'en'))
	);
});

test('result normalizers preserve counts and collapse only missing values into null', () => {
	assert.deepEqual(normalizeLabelCountMetric({ label: ['m', '', null], count: [2, 1, 3] }), [
		{ value: '', count: 1 },
		{ value: 'm', count: 2 },
		{ value: null, count: 3 }
	]);
	assert.deepEqual(
		normalizeTumorYearGenderMetric({
			category: ['2020', '2024'],
			groups: [
				{ label: 'C34', gender: 'm', count: [1, 0] },
				{ label: 'C50', gender: 'w', count: [0, 2] }
			]
		}),
		[
			{ value: ['C34', '2020', 'm'], count: 1 },
			{ value: ['C50', '2024', 'w'], count: 2 }
		]
	);
});
