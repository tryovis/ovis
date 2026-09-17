import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { createLensHarness } from './testhelpers/lensHarness.mjs';

const helperSource = fs.readFileSync(new URL('./tableFilterItems.ts', import.meta.url), 'utf8');
const helperCode = ts.transpileModule(helperSource, {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText;
const { addChartQueryItem } = await import(
	`data:text/javascript;base64,${Buffer.from(helperCode).toString('base64')}`
);

const leaf = (key, value, system = 'diagnosis') => ({ key, value, system, type: 'EQUALS' });
const assigned = {
	operand: 'OR',
	children: [
		{ operand: 'AND', children: [{ operand: 'OR', children: [leaf('ICD_ICD10Group', 'C30-C39')] }] }
	]
};
const item = (key, value, system = 'diagnosis') => ({
	id: 'Random generierte UUID',
	key,
	name: 'childCategorie.name',
	system,
	type: 'EQUALS',
	values: [{ name: value, value, queryBindId: 'Auch eine random UUID' }]
});
const field = (key, values, system = 'diagnosis') => ({
	key,
	name: key,
	system,
	type: 'EQUALS',
	fieldType: 'single-select',
	criteria: values.map((value) => ({ key: value, name: value }))
});

function catalogue(restricted) {
	return [
		{
			key: 'diagnosis',
			childCategories: [
				field('ICD_ICD10Group', restricted ? [] : ['C30-C39', 'C50-C59']),
				field('ICD_ICD10_3', restricted ? [] : ['C31', 'C32', 'C34']),
				{
					key: 'diagnosisDate',
					name: 'Diagnosis date',
					system: 'diagnosis',
					type: 'BETWEEN',
					fieldType: 'date',
					criteria: []
				}
			]
		},
		{
			key: 'patient',
			childCategories: [field('gender', restricted ? [] : ['m', 'f'], 'patient')]
		}
	];
}

function harness(restricted = false, initialQuery = [[]]) {
	const h = createLensHarness(catalogue(restricted), initialQuery);
	return { ...h, restoreCriteria: () => h.setCatalogue(catalogue(false)) };
}

function addDate(dataPasser) {
	dataPasser.addStratifierToQueryAPI({
		label: '01.01.2026 - 12.31.2026',
		catalogueGroupCode: 'diagnosisDate',
		parentGroupCode: 'diagnosis'
	});
}

function assertIndependentRows(query, expectedKeys) {
	assert.deepEqual(query[0].map(({ key }) => key).sort(), [...expectedKeys].sort());
	assert.equal(new Set(query[0].map(({ id }) => id)).size, query[0].length);
	assert.equal(new Set(query[0].map(({ name }) => name)).size, query[0].length);
	const bindings = query[0].flatMap(({ values }) => values.map(({ queryBindId }) => queryBindId));
	assert.equal(new Set(bindings).size, bindings.length);
}

for (const restricted of [false, true]) {
	test(`Lens keeps category, gender and date independent (${
		restricted ? 'empty' : 'populated'
	} criteria)`, () => {
		const h = harness(restricted);
		addChartQueryItem(h.dataPasser, item('ICD_ICD10_3', 'C34'), restricted ? assigned : undefined);
		addChartQueryItem(
			h.dataPasser,
			item('gender', 'm', 'patient'),
			restricted ? assigned : undefined
		);
		addDate(h.dataPasser);
		const query = h.query();
		assertIndependentRows(query, ['ICD_ICD10_3', 'gender', 'diagnosisDate']);
		assert.equal(query[0].find(({ key }) => key === 'diagnosisDate').type, 'BETWEEN');
		assert.deepEqual(query[0].find(({ key }) => key === 'diagnosisDate').values[0].value, {
			min: Date.parse('01.01.2026'),
			max: Date.parse('12.31.2026')
		});
		const categoryAndDate = query[0].filter(({ key }) => key !== 'gender');
		h.removeRow('gender');
		assert.deepEqual(
			h.query()[0],
			categoryAndDate,
			'removing gender must retain category and date'
		);
		h.removeValue('ICD_ICD10_3', 'C34');
		assert.deepEqual(
			h.query()[0],
			categoryAndDate.filter(({ key }) => key === 'diagnosisDate')
		);
	});
}

test('restricted C34 fallback and later native C32 remain one OR row, with individually removable values', () => {
	const h = harness(true);
	addChartQueryItem(h.dataPasser, item('ICD_ICD10_3', 'C34'), assigned);
	assert.equal(
		h.query()[0][0].name,
		'ICD_ICD10_3',
		'preserve Lens field metadata despite empty criteria'
	);
	h.restoreCriteria();
	h.dataPasser.addStratifierToQueryAPI({
		label: 'C32',
		catalogueGroupCode: 'ICD_ICD10_3',
		parentGroupCode: 'diagnosis'
	});
	assert.equal(h.query()[0].length, 1, 'native selection must extend the existing row');
	assert.deepEqual(h.ast(), {
		operand: 'OR',
		children: [
			{
				operand: 'AND',
				children: [
					{
						key: 'ICD_ICD10_3',
						operand: 'OR',
						children: [leaf('ICD_ICD10_3', 'C34'), leaf('ICD_ICD10_3', 'C32')]
					}
				]
			}
		]
	});
	const [row] = h.query()[0];
	assert.notEqual(row.values[0].queryBindId, row.values[1].queryBindId);
	h.removeValue('ICD_ICD10_3', 'C34');
	assert.deepEqual(
		h.query()[0][0].values.map(({ value }) => value),
		['C32']
	);
});

test('multiple missing chart values remain independently removable after native date insertion', () => {
	const h = harness(true);
	addChartQueryItem(h.dataPasser, item('ICD_ICD10_3', 'C34'), assigned);
	addChartQueryItem(h.dataPasser, item('ICD_ICD10_3', 'C32'), assigned);
	addDate(h.dataPasser);
	assertIndependentRows(h.query(), ['ICD_ICD10_3', 'diagnosisDate']);
	h.removeValue('ICD_ICD10_3', 'C32');
	assert.deepEqual(
		h
			.query()[0]
			.find(({ key }) => key === 'ICD_ICD10_3')
			.values.map(({ value }) => value),
		['C34']
	);
	assert.equal(h.query()[0].find(({ key }) => key === 'diagnosisDate').values.length, 1);
});

test('fixed C30-C39 never reaches native Lens insertion while its C34 refinement does', () => {
	const h = harness(true);
	addChartQueryItem(h.dataPasser, item('ICD_ICD10Group', 'C30-C39'), JSON.stringify(assigned));
	assert.deepEqual(h.query(), [[]]);
	assert.equal(h.nativeCalls(), 0);
	addChartQueryItem(h.dataPasser, item('ICD_ICD10_3', 'C34'), JSON.stringify(assigned));
	addChartQueryItem(h.dataPasser, item('ICD_ICD10Group', 'C30-C39'), JSON.stringify(assigned));
	assert.deepEqual(
		h.query()[0].map(({ key }) => key),
		['ICD_ICD10_3']
	);
	assert.equal(h.nativeCalls(), 1);
});

test('a C34 chart refinement preserves another editable OR group', () => {
	const other = {
		id: 'other-gender-row',
		name: 'gender',
		key: 'gender',
		system: 'patient',
		type: 'EQUALS',
		values: [{ name: 'f', value: 'f', queryBindId: 'other-gender-value' }]
	};
	const h = harness(true, [[], [other]]);
	addChartQueryItem(h.dataPasser, item('ICD_ICD10_3', 'C34'), assigned);
	assert.deepEqual(h.query()[1], [other]);
	assert.equal(h.ast().operand, 'OR');
	assert.equal(h.ast().children.length, 2);
});
