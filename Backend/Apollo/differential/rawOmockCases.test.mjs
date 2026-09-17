import assert from 'node:assert/strict';
import test from 'node:test';
import {
	allRawRows,
	and,
	appendRawEdgeFixtures,
	rawFilterCases,
	selectRawIds
} from './rawOmockCases.mjs';
import { calculateRawOmockMetrics } from './omockMetricReference.mjs';

const raw = {
	patient: [
		{ patID: 'p1', gender: 'm', birthDate: '2000-01-01' },
		{ patID: 'p2', gender: 'w', birthDate: '1970-01-01' },
		{ patID: 'p3', gender: null, birthDate: '1980-01-01' },
		{ patID: 'p4', gender: '', birthDate: '2024-02-29' },
		{ patID: 'p5', birthDate: '1990-01-01' },
		{ patID: 'p6', gender: ' ', birthDate: '1960-01-01' },
		{ patID: 'p7', gender: '-' },
		{ patID: 'p8', gender: 'w' }
	],
	diagnosis: [
		{
			tumorID: 't1',
			patID: 'p1',
			ICD_ICD10: 'C34.1',
			diagnosisDate: '2024-01-01',
			diagnosisReason: ''
		},
		{
			tumorID: 't2',
			patID: 'p1',
			ICD_ICD10: 'C50.9',
			diagnosisDate: '2025-01-01',
			diagnosisReason: 'reason'
		},
		{
			tumorID: 't3',
			patID: 'p2',
			ICD_ICD10: 'C50.9',
			diagnosisDate: '2024-12-31',
			diagnosisReason: null
		},
		{ tumorID: 't4', patID: 'p3', ICD_ICD10: 'C32', diagnosisDate: null },
		{
			tumorID: 't5',
			patID: 'p4',
			ICD_ICD10: 'C34',
			diagnosisDate: '29.02.2024',
			diagnosisReason: '-'
		},
		{
			tumorID: 't6',
			patID: 'p5',
			ICD_ICD10: 'C34',
			diagnosisDate: 'not-a-date',
			diagnosisReason: ' '
		},
		{
			tumorID: 't7',
			patID: 'p6',
			ICD_ICD10: 'C34',
			diagnosisDate: '2024-02-29T23:00:00+01:00',
			diagnosisReason: 'reason'
		}
	],
	therapy: [
		{ therapyID: 'h1', tumorID: 't1', generalType: ' Operation ' },
		{ therapyID: 'h2', tumorID: 't1', generalType: 'systemic' },
		{ therapyID: 'h3', tumorID: 'orphan', generalType: 'operation' }
	],
	progress: []
};

const cases = rawFilterCases();
const requests = cases.filter(({ lock }) => lock === allRawRows).map(({ request }) => request);
const leafRequest = (key, type, value) => {
	const found = requests.find(
		({ ast }) =>
			ast?.key === key && ast?.type === type && JSON.stringify(ast.value) === JSON.stringify(value)
	);
	assert.ok(found, `Missing matrix request ${key} ${type} ${JSON.stringify(value)}`);
	return found;
};

test('direct source selection never widens a diagnosis lock to a sibling tumor of the same patient', () => {
	const before = structuredClone(raw);
	const lung = leafRequest('ICD_ICD10_3', 'EQUALS', 'C34');
	const male = leafRequest('gender', 'EQUALS', 'm');
	assert.deepEqual(selectRawIds(raw, and(lung, male)), { tumorIds: ['t1'], patientIds: ['p1'] });
	assert.deepEqual(selectRawIds(raw, and(lung, leafRequest('ICD_ICD10_3', 'EQUALS', 'C50'))), {
		tumorIds: [],
		patientIds: []
	});
	assert.deepEqual(raw, before);
});

test('patient-only requests retain patients without diagnoses, diagnosis locks exclude them', () => {
	const female = leafRequest('gender', 'EQUALS', 'w');
	assert.deepEqual(selectRawIds(raw, female), { tumorIds: ['t3'], patientIds: ['p2', 'p8'] });
	assert.deepEqual(selectRawIds(raw, and(female, leafRequest('ICD_ICD10_3', 'EQUALS', 'C50'))), {
		tumorIds: ['t3'],
		patientIds: ['p2']
	});
	const full = calculateRawOmockMetrics(raw);
	assert.equal(full.counts.therapy, 3, 'unscoped counts include orphan source events');
	const selected = calculateRawOmockMetrics(raw, selectRawIds(raw, female));
	assert.equal(selected.counts.patient, 2);
	assert.equal(selected.counts.therapy, 0);
});

test('blank, null and broad missing filters have distinct independently specified membership', () => {
	assert.deepEqual(selectRawIds(raw, leafRequest('gender', 'EQUALS', '')).patientIds, ['p4']);
	assert.deepEqual(selectRawIds(raw, leafRequest('gender', 'EQUALS', null)).patientIds, [
		'p3',
		'p5'
	]);
	assert.deepEqual(selectRawIds(raw, leafRequest('gender', 'EQUALS', '-')).patientIds, [
		'p3',
		'p4',
		'p5',
		'p6',
		'p7'
	]);
	assert.deepEqual(selectRawIds(raw, leafRequest('!gender', 'NEQUALS', '-')).patientIds, [
		'p1',
		'p2',
		'p8'
	]);
	assert.deepEqual(selectRawIds(raw, leafRequest('diagnosisReason', 'EQUALS', null)).tumorIds, [
		't3',
		't4'
	]);
	assert.deepEqual(selectRawIds(raw, leafRequest('!diagnosisReason', 'NEQUALS', '')).tumorIds, [
		't2',
		't3',
		't4',
		't5',
		't6',
		't7'
	]);
});

test('date boundaries include UTC midnight precisely and normalize timestamp bounds independently', () => {
	const leapDay = { min: '2024-02-29T00:00:00Z', max: '2024-02-29T00:00:00Z' };
	assert.deepEqual(selectRawIds(raw, leafRequest('diagnosisDate', 'BETWEEN', leapDay)).tumorIds, [
		't5'
	]);
	assert.deepEqual(
		selectRawIds(
			raw,
			leafRequest('diagnosisDate', 'BETWEEN', {
				min: Date.UTC(2024, 1, 29),
				max: Date.UTC(2024, 1, 29)
			})
		).tumorIds,
		['t5']
	);
	assert.deepEqual(
		selectRawIds(
			raw,
			leafRequest('diagnosisDate', 'BETWEEN', {
				min: '2024-02-28T23:00:00Z',
				max: '2024-02-29T23:00:00Z'
			})
		).tumorIds,
		['t5', 't7']
	);
	assert.deepEqual(
		selectRawIds(
			raw,
			leafRequest('!diagnosisDate', 'NBETWEEN', {
				min: '2024-02-29T00:00:00Z',
				max: '2024-03-01T00:00:00Z'
			})
		).tumorIds,
		['t1', 't2', 't3', 't4', 't6']
	);
});

test('negative age range includes missing ages and zero while disjoint OR does not fill the gap', () => {
	assert.deepEqual(
		selectRawIds(raw, leafRequest('!ageAtDiagnosis', 'NBETWEEN', { min: 30, max: 60 })).tumorIds,
		['t1', 't2', 't4', 't5', 't6', 't7']
	);
	const disjoint = requests.find(
		({ ast }) =>
			ast?.operand === 'OR' && ast.children.every((leaf) => leaf.key === 'ageAtDiagnosis')
	);
	assert.ok(disjoint);
	assert.deepEqual(selectRawIds(raw, disjoint).tumorIds, ['t1', 't2', 't7']);
	assert.deepEqual(
		selectRawIds(raw, leafRequest('previousTherapy_surgery', 'EQUALS', true)).tumorIds,
		['t1']
	);
});

test('fixture preparation clones source, preserves originals and adds explicit invalid/empty/date variants', () => {
	const before = structuredClone(raw);
	const fixture = appendRawEdgeFixtures(raw);
	assert.deepEqual(raw, before);
	assert.deepEqual(fixture.patient.slice(0, raw.patient.length), raw.patient);
	assert.deepEqual(fixture.diagnosis.slice(0, raw.diagnosis.length), raw.diagnosis);
	assert.equal(fixture.patient.length - raw.patient.length, 37);
	assert.equal(fixture.diagnosis.length - raw.diagnosis.length, 42);
	assert.equal(new Set(fixture.patient.map(({ patID }) => patID)).size, fixture.patient.length);
	assert.equal(
		new Set(fixture.diagnosis.map(({ tumorID }) => tumorID)).size,
		fixture.diagnosis.length
	);
	const noDiagnosis = fixture.patient.find(({ patID }) => patID === 'OMOCK-VERIFY-WITHOUT-TUMOR');
	assert.equal(noDiagnosis?.gender, 'w');
	assert.equal(
		fixture.diagnosis.some(({ patID }) => patID === noDiagnosis.patID),
		false
	);
	const dates = fixture.diagnosis.map(({ diagnosisDate }) => diagnosisDate);
	for (const value of ['', null, undefined, 'not-a-date', '2023-02-29', '29.02.2024']) {
		assert.ok(dates.includes(value), `Fixture missing ${String(value)}`);
	}
});
