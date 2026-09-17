import assert from 'node:assert/strict';
import test from 'node:test';
import {
	createEditorValue,
	createFieldIndex,
	isDateField,
	isEditableAst,
	parseEditorField,
	serializeEditorAst,
	validateEditorAst
} from './filterEditorModel.js';

const field = (key, system, type = 'EQUALS', fieldType = 'single-select') => ({
	key,
	system,
	type,
	fieldType,
	criteria: []
});
const catalogue = [
	{
		childCategories: [
			field('gender', 'patient'),
			field('age', 'patient', 'BETWEEN', 'number'),
			field('ICD_ICD10', 'diagnosis'),
			field('isTumor', 'diagnosis'),
			field('diagnosisDate', 'diagnosis', 'BETWEEN', 'date'),
			field('start', 'study', 'BETWEEN', 'date'),
			field('ops_code', 'therapy'),
			field('status', 'therapy'),
			field('status', 'study'),
			field('!gender', 'patient', 'NEQUALS'),
			field('!age', 'patient', 'NBETWEEN', 'number')
		]
	}
];
const index = createFieldIndex(catalogue);
const leaf = (key = 'gender', value = 'm', system = 'patient', type = 'EQUALS') => ({
	key,
	system,
	type,
	value
});
const or = (...children) => ({ operand: 'OR', children });
const and = (...children) => ({ operand: 'AND', children });
const ast = (...children) => or(and(or(...children)));
const validate = (value) => validateEditorAst(value, index);

test('indexes scoped fields once and handles generated negative catalogue entries', () => {
	assert.equal(index.size, 9);
	assert.equal(index.get('gender(patient)').type, 'EQUALS');
	assert.equal(index.get('age(patient)').type, 'BETWEEN');
	assert.equal(index.get('status(therapy)').system, 'therapy');
	assert.equal(index.get('status(study)').system, 'study');
	const reversed = createFieldIndex([
		{ childCategories: [...catalogue[0].childCategories].reverse() }
	]);
	assert.equal(reversed.get('gender(patient)').type, 'EQUALS');
	assert.deepEqual(catalogue[0].childCategories[9], field('!gender', 'patient', 'NEQUALS'));
	assert.equal(createFieldIndex(null).size, 0);
});

test('field parsing safely rejects incomplete, malformed and unknown datalist text', () => {
	for (const value of [
		'',
		'gender',
		'gender(',
		'gender()',
		'(patient)',
		'gender(other)',
		'unknown(patient)',
		'gender(patient)tail',
		'gender((patient))',
		'!!gender(patient)',
		null,
		{},
		0
	]) {
		assert.equal(parseEditorField(value, index), null, String(value));
	}
	assert.equal(parseEditorField(' gender(patient) ', index).type, 'EQUALS');
	assert.equal(parseEditorField('!gender(patient)', index).type, 'NEQUALS');
	assert.equal(parseEditorField('!age(patient)', index).type, 'NBETWEEN');
	assert.equal(parseEditorField('ops_code(therapy)', index).key, 'ops_code');
});

test('date metadata identifies start and negated fields, with legacy name fallback', () => {
	assert.equal(isDateField(leaf('start', null, 'study'), index), true);
	assert.equal(isDateField(leaf('!start', null, 'study'), index), true);
	assert.equal(isDateField(leaf('!diagnosisDate', null, 'diagnosis'), index), true);
	assert.equal(isDateField(leaf('age', null), index), false);
	assert.equal(isDateField(leaf('oldDate', null, 'legacy'), new Map()), true);
});

test('scalar values preserve empty strings, missing values, numbers, booleans and free text', () => {
	for (const value of [
		'',
		' ',
		'-',
		null,
		0,
		false,
		true,
		12.5,
		'unknown-to-current-cohort',
		'a,b',
		'[]'
	]) {
		assert.equal(validate(ast(leaf('gender', value))).valid, true, String(value));
	}
	for (const value of [
		undefined,
		NaN,
		Infinity,
		-Infinity,
		[],
		['m', 'f'],
		{},
		{ min: null, max: null }
	]) {
		assert.equal(validate(ast({ ...leaf(), value })).valid, false, String(value));
	}
	const missing = leaf();
	delete missing.value;
	assert.equal(validate(ast(missing)).valid, false);
});

test('validates numeric ranges, zero and open or missing bounds', () => {
	for (const value of [
		{ min: 0, max: 0 },
		{ min: -5, max: 1 },
		{ min: '0', max: '10' },
		{ min: null, max: 0 },
		{ min: 0, max: null },
		{ min: null, max: null }
	]) {
		assert.equal(validate(ast(leaf('age', value, 'patient', 'BETWEEN'))).valid, true);
		assert.equal(validate(ast(leaf('!age', value, 'patient', 'NBETWEEN'))).valid, true);
	}
	for (const value of [
		{ min: 5, max: 4 },
		{ min: '', max: 4 },
		{ min: NaN, max: null },
		{ min: null, max: Infinity },
		{ min: false, max: 3 },
		{ min: 'bad', max: 3 },
		{ min: 1 },
		null,
		[],
		'0'
	]) {
		assert.equal(
			validate(ast(leaf('age', value, 'patient', 'BETWEEN'))).valid,
			false,
			JSON.stringify(value)
		);
	}
});

test('date ranges validate calendar ordering, leap days and open bounds for date fields named start', () => {
	for (const value of [
		{ min: '2024-02-29', max: '2024-03-01' },
		{ min: 0, max: 0 },
		{ min: null, max: '2024-01-01' },
		{ min: '2024-01-01', max: null },
		{ min: null, max: null }
	]) {
		assert.equal(
			validate(ast(leaf('start', value, 'study', 'BETWEEN'))).valid,
			true,
			JSON.stringify(value)
		);
	}
	for (const value of [
		{ min: '2024-03-01', max: '2024-02-29' },
		{ min: '2023-02-29', max: null },
		{ min: '2024-02-30T00:00:00Z', max: null },
		{ min: '', max: null },
		{ min: 'bad', max: null },
		{ min: true, max: null },
		{ min: Infinity, max: null }
	]) {
		assert.equal(
			validate(ast(leaf('start', value, 'study', 'BETWEEN'))).valid,
			false,
			JSON.stringify(value)
		);
	}
});

test('all leaves are validated even when an invalid eleventh value is off the selected page', () => {
	const leaves = Array.from({ length: 11 }, () => leaf());
	leaves[10] = { key: '', system: '', type: 'EQUALS', value: '' };
	const selected = ast(...leaves);
	selected.children[0].children[0]._page = 0;
	const result = validate(selected);
	assert.equal(result.valid, false);
	assert.ok(result.inconsistentFields.includes(leaves[10]));
	assert.ok(result.errors.some(({ path }) => path.join('.') === '0.0.10'));
	selected.children[0].children[0]._page = 1;
	assert.equal(validate(selected).valid, false);
});

test('AND, outer OR, negated array values and date combinations remain editable', () => {
	const selected = or(
		and(
			or(leaf('gender', 'm')),
			or(leaf('ops_code', 'A', 'therapy'), leaf('ops_code', 'B', 'therapy'))
		),
		and(
			or(leaf('!ops_code', 'C', 'therapy', 'NEQUALS'), leaf('!ops_code', '', 'therapy', 'NEQUALS')),
			or(leaf('start', { min: null, max: '2024-12-31' }, 'study', 'BETWEEN'))
		)
	);
	assert.equal(validate(selected).valid, true);
	assert.deepEqual(JSON.parse(serializeEditorAst(selected)), selected);
});

test('unsupported shapes and mixed field/operator rows are rejected instead of silently converted', () => {
	for (const value of [
		null,
		{},
		[],
		and(),
		or(null),
		or(and()),
		or(and(or())),
		or(and(leaf())),
		or(and(or(and(or(leaf()))))),
		ast(leaf(), leaf('status', 'done', 'study')),
		ast(leaf(), leaf('!gender', 'f', 'patient', 'NEQUALS')),
		ast(leaf('gender', 'm', 'patient', 'UNKNOWN'))
	]) {
		assert.equal(validate(value).valid, false, JSON.stringify(value));
	}
	assert.equal(validate(or()).valid, true);
});

test('numeric and date chart missing-value selections remain scalar equality conditions', () => {
	for (const selected of [
		ast(leaf('age', null)),
		ast(leaf('age', 0)),
		ast(leaf('!age', null, 'patient', 'NEQUALS')),
		ast(leaf('diagnosisDate', null, 'diagnosis'))
	]) {
		assert.equal(validate(selected).valid, true);
		assert.deepEqual(JSON.parse(serializeEditorAst(selected)), selected);
	}
});

test('render guard accepts empty roots and editable groups but rejects unsupported logical structure', () => {
	for (const selected of [
		or(),
		ast(leaf()),
		ast(leaf('', '', '')),
		or(and(or(leaf())), and(or(leaf('ops_code', 'A', 'therapy'))))
	]) {
		assert.equal(isEditableAst(selected), true, JSON.stringify(selected));
	}
	for (const selected of [
		null,
		[],
		{},
		{ operand: 'NOR', children: [] },
		{ operand: 'XOR', children: [leaf()] },
		or(null),
		or(and()),
		or(and(or())),
		or(and(or(null))),
		or(and(leaf())),
		or(and(or(and(or(leaf()))))),
		ast(leaf(), leaf('status', 'active', 'study'))
	]) {
		assert.equal(isEditableAst(selected), false, JSON.stringify(selected));
	}
});

test('comparison operator is semantic; legacy missing or superfluous ! prefixes are preserved', () => {
	for (const selected of [
		ast(leaf('gender', 'm', 'patient', 'NEQUALS')),
		ast(leaf('!gender', 'm'))
	]) {
		assert.equal(validate(selected).valid, true);
		assert.deepEqual(JSON.parse(serializeEditorAst(selected)), selected);
	}
});

test('serialization strips only pagination and preserves isTumor, scalar types and predicates', () => {
	const selected = or(and(or(leaf('isTumor', false, 'diagnosis')), or(leaf('gender', null))));
	selected._page = 3;
	selected.children[0].children[0]._page = 1;
	selected.children[0].children[0].key = 'isTumor';
	selected.comment = 'preserved';
	const before = structuredClone(selected);
	const result = JSON.parse(serializeEditorAst(selected));
	assert.equal('_page' in result, false);
	assert.equal('_page' in result.children[0].children[0], false);
	assert.equal(result.children[0].children[0].children[0].value, false);
	assert.equal(result.children[0].children[1].children[0].value, null);
	assert.equal(result.comment, 'preserved');
	assert.equal(result.children[0].children[0].key, 'isTumor');
	assert.deepEqual(selected, before);
});

test('new values retain row negation and have independent range objects', () => {
	const first = leaf('!age', { min: 20, max: 30 }, 'patient', 'NBETWEEN');
	const added = createEditorValue(first);
	const another = createEditorValue(first);
	assert.deepEqual(added, leaf('!age', { min: null, max: null }, 'patient', 'NBETWEEN'));
	added.value.min = 10;
	assert.deepEqual(first.value, { min: 20, max: 30 });
	assert.deepEqual(another.value, { min: null, max: null });
	assert.deepEqual(
		createEditorValue(leaf('!gender', 'm', 'patient', 'NEQUALS')),
		leaf('!gender', '', 'patient', 'NEQUALS')
	);
});
