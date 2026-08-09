import assert from 'node:assert/strict';
import test from 'node:test';

import {
	ReferenceModel,
	evaluateDocumentNode,
	normalizeAstKeys,
	valuesAtPath
} from './referenceEvaluator.mjs';

const group = (operand, children) => ({ operand, children });
const equals = (system, key, value) => ({ system, key, type: 'EQUALS', value });

test('key normalization never rewrites filter values', () => {
	const ast = {
		operand: 'AND',
		children: [
			equals('study', 'studyPatients_patID', 'patient_edge_one'),
			equals('diagnosis', 'ICDO_histologyCode', '8500_3')
		]
	};

	assert.deepEqual(normalizeAstKeys(ast), {
		operand: 'AND',
		children: [
			equals('studyPatient', 'patID', 'patient_edge_one'),
			equals('diagnosis', 'ICDO_histologyCode', '8500_3')
		]
	});
});

test('missing fields and empty arrays are both empty values', () => {
	assert.deepEqual(valuesAtPath({}, 'surgeon').length, 1);
	assert.deepEqual(valuesAtPath({ surgeon: [] }, 'surgeon').length, 1);
	assert.equal(evaluateDocumentNode({}, equals('therapy', 'surgeon', '-')), true);
	assert.equal(evaluateDocumentNode({ surgeon: [] }, equals('therapy', 'surgeon', '-')), true);
	assert.equal(
		evaluateDocumentNode(
			{ surgeon: ['A'] },
			{ ...equals('therapy', '!surgeon', '-'), type: 'NEQUALS' }
		),
		true
	);
});

test('AND conditions on an object array must match the same element', () => {
	const document = {
		ops: [
			{ code: 'A', text: 'first' },
			{ code: 'B', text: 'second' }
		]
	};

	assert.equal(
		evaluateDocumentNode(
			document,
			group('AND', [equals('therapy', 'ops.code', 'A'), equals('therapy', 'ops.text', 'second')])
		),
		false
	);
	assert.equal(
		evaluateDocumentNode(
			document,
			group('AND', [equals('therapy', 'ops.code', 'A'), equals('therapy', 'ops.text', 'first')])
		),
		true
	);
});

test('foreign same-system AND conditions use one source document', () => {
	const model = new ReferenceModel({
		diagnosis: [{ _id: 'd1', tumorID: 't1' }],
		therapy: [
			{ _id: 'a', tumorID: 't1', status: 'A', intention: 'X' },
			{ _id: 'b', tumorID: 't1', status: 'B', intention: 'Y' }
		]
	});
	const ast = group('AND', [equals('therapy', 'status', 'A'), equals('therapy', 'intention', 'Y')]);

	assert.deepEqual([...model.matchingTumors(ast)], []);
	assert.equal(model.evaluateTargetDocument({ tumorID: 't1' }, 'diagnosis', ast), false);
});

test('wrapped foreign negation excludes a tumor if any source row has the value', () => {
	const model = new ReferenceModel({
		diagnosis: [{ tumorID: 't1' }],
		consultation: [
			{ tumorID: 't1', status: 'done' },
			{ tumorID: 't1', status: 'not done' }
		]
	});
	const negated = {
		key: '!status',
		operand: 'OR',
		children: [{ key: '!status', type: 'NEQUALS', system: 'consultation', value: 'done' }]
	};
	const wrapped = group('OR', [group('AND', [negated])]);

	assert.deepEqual([...model.matchingTumors(wrapped)], []);
});

test('negated foreign filters include orphan target tumors with no source row', () => {
	const model = new ReferenceModel({
		diagnosis: [{ tumorID: 't1', code: 'C1' }],
		therapy: [{ tumorID: 'orphan', status: 'active' }]
	});
	const negated = {
		key: '!code',
		operand: 'OR',
		children: [{ key: '!code', type: 'NEQUALS', system: 'diagnosis', value: 'C1' }]
	};

	assert.deepEqual([...model.matchingTumors(negated)], ['orphan']);
	assert.equal(model.evaluateTargetDocument({ tumorID: 'orphan' }, 'therapy', negated), true);
});

test('patient tumor filters must match within one of the patient tumors', () => {
	const patient = { patID: 'p1', tumorID: ['t1', 't2'] };
	const model = new ReferenceModel({
		patient: [patient],
		diagnosis: [
			{ tumorID: 't1', code: 'A' },
			{ tumorID: 't2', code: 'B' }
		],
		therapy: [
			{ tumorID: 't1', status: 'X' },
			{ tumorID: 't2', status: 'Y' }
		]
	});

	assert.equal(
		model.evaluatePatient(
			patient,
			group('AND', [equals('diagnosis', 'code', 'A'), equals('therapy', 'status', 'Y')])
		),
		false
	);
	assert.equal(
		model.evaluatePatient(
			patient,
			group('OR', [equals('diagnosis', 'code', 'A'), equals('therapy', 'status', 'Y')])
		),
		true
	);
});

test('mixed-system tumor AND still keeps same-system clauses on one source row', () => {
	const model = new ReferenceModel({
		diagnosis: [{ tumorID: 't1', code: 'C1' }],
		therapy: [
			{ tumorID: 't1', status: 'A', intention: 'X' },
			{ tumorID: 't1', status: 'B', intention: 'Y' }
		],
		status: [{ tumorID: 't1', status: 'active' }]
	});
	const ast = group('AND', [
		equals('therapy', 'status', 'A'),
		equals('therapy', 'intention', 'Y'),
		equals('diagnosis', 'code', 'C1'),
		equals('status', 'status', 'active')
	]);

	assert.deepEqual([...model.matchingTumors(ast)], []);
});

test('foreign XOR and NOR combine at tumor level across source rows', () => {
	const model = new ReferenceModel({
		diagnosis: [{ tumorID: 't1' }],
		tnm: [
			{ tumorID: 't1', T: 'T1', N: 'N0' },
			{ tumorID: 't1', T: 'T2', N: 'N1' }
		]
	});
	const branches = [equals('tnm', 'T', 'T1'), equals('tnm', 'N', 'N1')];

	assert.deepEqual([...model.matchingTumors(group('XOR', branches))], []);
	assert.deepEqual([...model.matchingTumors(group('NOR', branches))], []);
});

test('study-patient evaluation keeps study and patient clauses on one participation row', () => {
	const patient = { _id: 'p', patID: 'p1', gender: 'w', tumorID: ['t1', 't2'] };
	const study = {
		_id: 's',
		studyKey: 'study-1',
		status: 'open'
	};
	const model = new ReferenceModel({
		patient: [patient],
		diagnosis: [
			{ tumorID: 't1', patID: 'p1', code: 'A' },
			{ tumorID: 't2', patID: 'p1', code: 'B' }
		],
		therapy: [
			{ tumorID: 't1', patID: 'p1', status: 'same' },
			{ tumorID: 't2', patID: 'p1', status: 'other' }
		],
		study: [study],
		studyPatient: [
			{ _id: 'sp1', studyKey: 'study-1', patID: 'p1', recruitmentDate: new Date('2020-01-01') },
			{ _id: 'sp2', studyKey: 'study-1', patID: 'p2', recruitmentDate: new Date('2020-01-02') }
		]
	});
	const row = model.studyPatientRows()[0];

	assert.equal(
		model.evaluateStudyPatient(
			row,
			group('AND', [equals('study', 'status', 'open'), equals('patient', 'gender', 'w')])
		),
		true
	);
	assert.equal(
		model.evaluateStudyPatient(
			row,
			group('AND', [
				equals('study', 'status', 'open'),
				equals('diagnosis', 'code', 'A'),
				equals('therapy', 'status', 'other')
			])
		),
		false
	);
	assert.equal(
		model.evaluateStudyPatient(
			row,
			group('AND', [
				equals('study', 'status', 'open'),
				equals('diagnosis', 'code', 'A'),
				equals('therapy', 'status', 'same')
			])
		),
		true
	);
});
