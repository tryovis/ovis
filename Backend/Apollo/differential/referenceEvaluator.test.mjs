import assert from 'node:assert/strict';
import test from 'node:test';

import {
	ReferenceModel,
	evaluateDocumentNode,
	normalizeAstKeys,
	roundToNextUTCMidnight,
	valuesAtPath
} from './referenceEvaluator.mjs';

const group = (operand, children) => ({ operand, children });

function* neutralWrapperVariants(node) {
	yield node;
	for (const operand of ['AND', 'OR', 'XOR']) yield group(operand, [node]);
	yield group('NOR', [group('NOR', [node])]);
	for (const [index, child] of (node.children ?? []).entries()) {
		for (const variant of neutralWrapperVariants(child)) {
			if (variant === child) continue;
			yield {
				...node,
				children: node.children.map((item, childIndex) => (childIndex === index ? variant : item))
			};
		}
	}
}
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

test('negated optional-event filters include known tumors with no event row', () => {
	const model = new ReferenceModel({
		diagnosis: [{ tumorID: 't1' }, { tumorID: 't2' }],
		therapy: [{ tumorID: 't1', status: 'active' }]
	});
	const negated = {
		key: '!status',
		operand: 'OR',
		children: [{ key: '!status', type: 'NEQUALS', system: 'therapy', value: 'active' }]
	};

	assert.deepEqual([...model.matchingTumors(negated)], ['t2']);
	assert.equal(model.evaluateTargetDocument({ tumorID: 't2' }, 'diagnosis', negated), true);
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

test('literal empty string, null, missing and the blank category have distinct meanings', () => {
	const rows = [
		{ id: 'missing' },
		{ id: 'null', value: null },
		{ id: 'empty', value: '' },
		{ id: 'space', value: ' ' },
		{ id: 'dash', value: '-' },
		{ id: 'array', value: [] },
		{ id: 'zero', value: 0 },
		{ id: 'false', value: false },
		{ id: 'text', value: 'known' }
	];
	for (const [requested, expected] of [
		['', ['empty']],
		[null, ['missing', 'null']],
		['-', ['missing', 'null', 'empty', 'space', 'dash', 'array']],
		[0, ['zero']],
		[false, ['false']]
	]) {
		assert.deepEqual(
			rows
				.filter((row) => evaluateDocumentNode(row, equals('therapy', 'value', requested)))
				.map((row) => row.id),
			expected,
			`EQUALS ${JSON.stringify(requested)}`
		);
		assert.deepEqual(
			rows
				.filter((row) =>
					evaluateDocumentNode(row, { ...equals('therapy', 'value', requested), type: 'NEQUALS' })
				)
				.map((row) => row.id),
			rows.map((row) => row.id).filter((id) => !expected.includes(id)),
			`NEQUALS ${JSON.stringify(requested)}`
		);
	}
});

test('date bounds use the parsed UTC instant and do not move ISO midnight to the next day', () => {
	const midnight = Date.parse('2024-02-29T00:00:00.000Z');
	for (const input of [midnight, '2024-02-29', '2024-02-29T00:00:00.000Z', new Date(midnight)]) {
		assert.equal(roundToNextUTCMidnight(input).getTime(), midnight);
	}
	assert.equal(roundToNextUTCMidnight('2024-02-28T23:00:00-01:00').getTime(), midnight);
	assert.equal(
		roundToNextUTCMidnight('2024-02-29T12:00:00Z').toISOString(),
		'2024-03-01T00:00:00.000Z'
	);
	const between = {
		system: 'diagnosis',
		key: 'diagnosisDate',
		type: 'BETWEEN',
		value: { min: '2024-02-29', max: '2024-02-29' }
	};
	assert.equal(evaluateDocumentNode({ diagnosisDate: new Date(midnight) }, between), true);
	assert.equal(evaluateDocumentNode({ diagnosisDate: new Date('2024-03-01') }, between), false);
});

test('AND with a patient predicate still requires every tumor predicate on the same tumor', () => {
	const patient = { patID: 'p1', gender: 'w', tumorID: ['t1', 't2'] };
	const model = new ReferenceModel({
		patient: [patient],
		diagnosis: [
			{ tumorID: 't1', patID: 'p1', code: 'A' },
			{ tumorID: 't2', patID: 'p1', code: 'B' }
		],
		therapy: [
			{ tumorID: 't1', status: 'X' },
			{ tumorID: 't2', status: 'Y' }
		]
	});
	const wrongTumor = group('AND', [
		equals('patient', 'gender', 'w'),
		equals('diagnosis', 'code', 'A'),
		equals('therapy', 'status', 'Y')
	]);
	assert.equal(model.evaluatePatient(patient, wrongTumor), false);
	assert.equal(
		model.evaluatePatient(
			patient,
			group('AND', [
				equals('patient', 'gender', 'w'),
				equals('diagnosis', 'code', 'A'),
				equals('therapy', 'status', 'X')
			])
		),
		true
	);
});

test('local diagnosis AND foreign therapy conditions cannot use different therapy events', () => {
	const diagnosis = { tumorID: 't1', code: 'A' };
	const model = new ReferenceModel({
		diagnosis: [diagnosis],
		therapy: [
			{ tumorID: 't1', status: 'X', intention: 'curative' },
			{ tumorID: 't1', status: 'Y', intention: 'palliative' }
		]
	});
	const ast = group('AND', [
		equals('diagnosis', 'code', 'A'),
		equals('therapy', 'status', 'X'),
		equals('therapy', 'intention', 'palliative')
	]);
	assert.equal(model.evaluateTargetDocument(diagnosis, 'diagnosis', ast), false);
	const nested = group('AND', [
		group('OR', [group('AND', ast.children.slice(0, 2))]),
		group('OR', [group('AND', ast.children.slice(2))])
	]);
	assert.equal(model.evaluateTargetDocument(diagnosis, 'diagnosis', nested), false);
});

test('a one-child NOR negates at both document and joined tumor level', () => {
	const model = new ReferenceModel({
		diagnosis: [
			{ tumorID: 't1', code: 'A' },
			{ tumorID: 't2', code: 'B' }
		]
	});
	const ast = group('NOR', [equals('diagnosis', 'code', 'A')]);
	assert.equal(evaluateDocumentNode({ code: 'A' }, ast), false);
	assert.deepEqual([...model.matchingTumors(ast)], ['t2']);
});

test('foreign negation is defined by its operator even without an exclamation marker', () => {
	const model = new ReferenceModel({
		diagnosis: [{ tumorID: 't1' }, { tumorID: 't2' }],
		therapy: [
			{ tumorID: 't1', status: 'A' },
			{ tumorID: 't1', status: 'B' },
			{ tumorID: 't2', status: 'B' }
		]
	});
	const ast = group('OR', [{ ...equals('therapy', 'status', 'A'), type: 'NEQUALS' }]);
	assert.deepEqual([...model.matchingTumors(ast)], ['t2']);
});

test('multiple excluded values and excluded intervals exclude their union locally', () => {
	const strings = [{ code: 'A' }, { code: 'B' }, { code: 'C' }, {}];
	const excludeValues = group(
		'OR',
		['A', 'B'].map((value) => ({ ...equals('diagnosis', 'code', value), type: 'NEQUALS' }))
	);
	assert.deepEqual(
		strings.map((row) => evaluateDocumentNode(row, excludeValues)),
		[false, false, true, true]
	);
	const excludeRanges = group(
		'OR',
		[
			{ min: 20, max: 30 },
			{ min: 50, max: 60 }
		].map((value) => ({ system: 'diagnosis', key: 'age', type: 'NBETWEEN', value }))
	);
	assert.deepEqual(
		[20, 25, 30, 40, 50, 60, 70, null].map((age) => evaluateDocumentNode({ age }, excludeRanges)),
		[false, false, false, true, false, false, true, true]
	);
});

test('adding an event match cannot re-admit tumors forbidden by an exclusion group', () => {
	const model = new ReferenceModel({
		diagnosis: [{ tumorID: 't1' }, { tumorID: 't2' }],
		therapy: [
			{ tumorID: 't1', type: 'OP' },
			{ tumorID: 't1', type: 'systemic' },
			{ tumorID: 't2', type: 'OP' }
		]
	});
	const negative = group('OR', [{ ...equals('therapy', 'type', 'systemic'), type: 'NEQUALS' }]);
	assert.deepEqual(
		[...model.matchingTumors(group('AND', [negative, equals('therapy', 'type', 'OP')]))],
		['t2']
	);
});

test('closed and open numeric ranges preserve zero and require one array value within both bounds', () => {
	const rows = [
		{ age: 0 },
		{ age: 25 },
		{ age: 40 },
		{ age: 55 },
		{ age: '25' },
		{ age: null },
		{},
		{ age: [] },
		{ age: [0, 100] }
	];
	const selected = (type, min, max) =>
		rows.map((row) =>
			evaluateDocumentNode(row, { system: 'diagnosis', key: 'age', type, value: { min, max } })
		);
	assert.deepEqual(selected('BETWEEN', 0, 0), [
		true,
		false,
		false,
		false,
		false,
		false,
		false,
		false,
		true
	]);
	assert.deepEqual(selected('BETWEEN', 20, 60), [
		false,
		true,
		true,
		true,
		false,
		false,
		false,
		false,
		false
	]);
	assert.deepEqual(selected('BETWEEN', null, 0), [
		true,
		false,
		false,
		false,
		false,
		false,
		false,
		false,
		true
	]);
	assert.deepEqual(selected('BETWEEN', 40, null), [
		false,
		false,
		true,
		true,
		false,
		false,
		false,
		false,
		true
	]);
	assert.deepEqual(selected('BETWEEN', null, null), [
		false,
		false,
		false,
		false,
		false,
		true,
		true,
		true,
		false
	]);
	assert.deepEqual(
		selected('NBETWEEN', 20, 60),
		selected('BETWEEN', 20, 60).map((match) => !match)
	);
});

test('study BSON date fields without Date suffix accept ISO bounds and open ends', () => {
	const row = { start: new Date('2024-02-29T12:00:00Z') };
	const leaf = {
		system: 'study',
		key: 'start',
		type: 'BETWEEN',
		value: { min: '2024-02-29', max: '2024-03-01' }
	};
	assert.equal(evaluateDocumentNode(row, leaf), true);
	assert.equal(
		evaluateDocumentNode(row, { ...leaf, value: { min: null, max: '2024-02-29' } }),
		false
	);
	assert.equal(
		evaluateDocumentNode(row, { ...leaf, value: { min: '2024-02-29', max: null } }),
		true
	);
});

test('null date equality cannot coerce a missing value into the Unix epoch', () => {
	const leaf = equals('diagnosis', 'diagnosisDate', new Date(0));
	assert.equal(evaluateDocumentNode({ diagnosisDate: null }, leaf), false);
	assert.equal(evaluateDocumentNode({}, leaf), false);
	assert.equal(evaluateDocumentNode({ diagnosisDate: new Date(0) }, leaf), true);
});

test('an unrelated local predicate does not weaken foreign same-row array requirements', () => {
	const diagnosis = { tumorID: 't1', code: 'A' };
	const model = new ReferenceModel({
		diagnosis: [diagnosis],
		therapy: [
			{
				tumorID: 't1',
				ops: [
					{ code: 'x', text: 'first' },
					{ code: 'y', text: 'second' }
				]
			}
		]
	});
	const ast = group('AND', [
		equals('diagnosis', 'code', 'A'),
		equals('therapy', 'ops.code', 'x'),
		equals('therapy', 'ops.text', 'second')
	]);
	assert.equal(model.evaluateTargetDocument(diagnosis, 'diagnosis', ast), false);
});

test('adding a scalar in the same system cannot split an object-array AND across entries', () => {
	const row = {
		type: 'OP',
		ops: [
			{ code: 'x', text: 'first' },
			{ code: 'y', text: 'second' }
		]
	};
	const ast = group('AND', [
		equals('therapy', 'type', 'OP'),
		equals('therapy', 'ops.code', 'x'),
		equals('therapy', 'ops.text', 'second')
	]);
	assert.equal(evaluateDocumentNode(row, ast), false);
	assert.equal(
		evaluateDocumentNode({ ...row, ops: [...row.ops, { code: 'x', text: 'second' }] }, ast),
		true
	);
});

test('absent identity cannot be authorized by null, negative or mixed NOR/XOR filters', () => {
	const rows = [
		{ tumorID: 'known', type: 'OP' },
		{ tumorID: 'orphan', type: 'OP' }
	];
	const model = new ReferenceModel({
		diagnosis: [{ tumorID: 'known', patID: 'p1' }],
		patient: [{ patID: 'p1', tumorID: ['known'], gender: 'w' }],
		therapy: rows
	});
	const excludedDiagnosis = { ...equals('diagnosis', 'code', 'A'), type: 'NEQUALS' };
	const absentField = equals('diagnosis', 'code', null);
	for (const ast of [
		excludedDiagnosis,
		absentField,
		{ ...equals('patient', 'gender', 'm'), type: 'NEQUALS' },
		group('NOR', [equals('diagnosis', 'code', 'A'), equals('therapy', 'type', 'other')]),
		group('XOR', [equals('diagnosis', 'code', 'A'), equals('therapy', 'type', 'OP')])
	]) {
		assert.deepEqual(
			rows.map((row) => model.evaluateTargetDocument(row, 'therapy', ast)),
			[true, false]
		);
	}
	assert.deepEqual(
		rows.map((row) =>
			model.evaluateTargetDocument(
				row,
				'therapy',
				group('OR', [excludedDiagnosis, equals('therapy', 'type', 'OP')])
			)
		),
		[true, true]
	);
});

test('several negative array fields keep missing and empty arrays in the result', () => {
	const ast = group('AND', [
		group('OR', [{ ...equals('therapy', '!radiation.areaGrouped', 'Thorax'), type: 'NEQUALS' }]),
		group('OR', [{ ...equals('therapy', '!radiation.subArea', '7.7'), type: 'NEQUALS' }])
	]);
	const rows = [
		{},
		{ radiation: null },
		{ radiation: [] },
		{ radiation: [{ areaGrouped: 'Abdomen', subArea: '1.1' }] },
		{ radiation: [{ areaGrouped: 'Thorax', subArea: '1.1' }] },
		{ radiation: [{ areaGrouped: 'Abdomen', subArea: '7.7' }] }
	];
	assert.deepEqual(
		rows.map((row) => evaluateDocumentNode(row, ast)),
		[true, true, true, true, false, false]
	);
});

test('literal null on a dotted array field distinguishes missing entries from an empty array', () => {
	// Expected IDs were also checked with Mongo $documents + {$match: {'ops.code': {$eq: null}}}.
	const rows = [
		{ tag: 'missing' },
		{ tag: 'null', ops: null },
		{ tag: 'empty', ops: [] },
		{ tag: 'entry-missing', ops: [{}] },
		{ tag: 'entry-null', ops: [{ code: null }] },
		{ tag: 'mixed', ops: [{ code: 'A' }, {}] }
	];
	assert.deepEqual(
		rows
			.filter((row) => evaluateDocumentNode(row, equals('therapy', 'ops.code', null)))
			.map((row) => row.tag),
		['missing', 'null', 'entry-missing', 'entry-null', 'mixed']
	);
});

test('hand-derived nested logic keeps same-event witnesses and negates the whole event group', () => {
	const diagnosis = ['C50', 'C34', 'C34', 'C50', 'C34', 'C50', 'C50'].map((code, index) => ({
		tumorID: `t${index + 1}`,
		code
	}));
	const therapy = [
		['t1', 'OP', 'curative'],
		['t1', 'systemic', 'palliative'],
		['t2', 'OP', 'palliative'],
		['t3', 'OP', 'curative'],
		['t4', 'systemic', 'palliative'],
		['t6', 'OP', 'palliative'],
		['t6', 'systemic', 'curative'],
		['t7', 'OP', 'curative']
	].map(([tumorID, type, intention]) => ({ tumorID, type, intention }));
	const model = new ReferenceModel({ diagnosis, therapy });
	const A = equals('therapy', 'type', 'OP'),
		B = equals('therapy', 'intention', 'palliative'),
		C = equals('diagnosis', 'code', 'C34');
	for (const [ast, expected] of [
		[group('AND', [A, group('OR', [B, C])]), ['t2', 't3', 't6']],
		[group('OR', [group('AND', [A, B]), group('AND', [A, C])]), ['t2', 't3', 't6']],
		[group('AND', [A, group('XOR', [B, C])]), ['t3', 't6']],
		[group('AND', [A, group('NOR', [B, C])]), ['t7']],
		[group('NOR', [group('AND', [A, B]), C]), ['t1', 't4', 't7']],
		[group('AND', [A, group('OR', [{ ...B, type: 'NEQUALS' }])]), ['t3', 't7']],
		[
			group('AND', [
				A,
				group('OR', [
					{ ...B, type: 'NEQUALS' },
					{ ...B, type: 'NEQUALS', value: 'unknown' }
				])
			]),
			['t3', 't7']
		]
	]) {
		for (const variant of neutralWrapperVariants(ast)) {
			assert.deepEqual([...model.matchingTumors(variant)], expected, JSON.stringify(variant));
			assert.deepEqual(
				diagnosis
					.filter((row) => model.evaluateTargetDocument(row, 'diagnosis', variant))
					.map((row) => row.tumorID),
				expected,
				JSON.stringify(variant)
			);
		}
	}
});

test('bare and wrapped negative leaves have equal foreign exclusions and local record semantics', () => {
	const diagnosis = ['t1', 't3', 't7', 't8'].map((tumorID) => ({ tumorID }));
	const therapy = [
		{ id: 't1-op', tumorID: 't1', type: 'OP', intention: 'curative', dose: 1 },
		{ id: 't1-systemic', tumorID: 't1', type: 'systemic', intention: 'palliative', dose: 15 },
		{ id: 't3-op', tumorID: 't3', type: 'OP', intention: 'curative', dose: 1 },
		{ id: 't7-op', tumorID: 't7', type: 'OP', intention: 'curative', dose: 30 }
	];
	const model = new ReferenceModel({ diagnosis, therapy });
	const A = equals('therapy', 'type', 'OP');
	for (const negative of [
		{ ...equals('therapy', 'intention', 'palliative'), type: 'NEQUALS' },
		{ ...equals('therapy', 'dose', { min: 10, max: 20 }), type: 'NBETWEEN' }
	]) {
		for (const leaf of neutralWrapperVariants(negative)) {
			assert.deepEqual([...model.matchingTumors(leaf)], ['t3', 't7', 't8']);
		}
		for (const ast of neutralWrapperVariants(group('AND', [A, negative]))) {
			assert.deepEqual([...model.matchingTumors(ast)], ['t3', 't7'], JSON.stringify(ast));
			assert.deepEqual(
				diagnosis
					.filter((row) => model.evaluateTargetDocument(row, 'diagnosis', ast))
					.map((row) => row.tumorID),
				['t3', 't7'],
				JSON.stringify(ast)
			);
			assert.deepEqual(
				therapy
					.filter((row) => model.evaluateTargetDocument(row, 'therapy', ast))
					.map((row) => row.id),
				['t1-op', 't3-op', 't7-op'],
				JSON.stringify(ast)
			);
		}
	}
});
