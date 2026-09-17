import assert from 'node:assert/strict';
import test from 'node:test';
import {
	addChartQueryItem,
	assignment,
	chartHandler,
	createLensHarness,
	leaf,
	mapHandler
} from './patientCohortFilterHarness.mjs';

const item = (key, value, system = 'diagnosis') => ({
	id: '-',
	key,
	name: '-',
	system,
	type: 'EQUALS',
	values: [{ name: String(value), value, queryBindId: '-' }]
});
const row = (h, key, system = 'patient') =>
	h.query()[0].find((candidate) => candidate.key === key && candidate.system === system);
const values = (h, key, system = 'patient') => row(h, key, system).values.map(({ value }) => value);
const clickSlice = (file, h, sourceValue) =>
	chartHandler(file, h, [sourceValue])(null, [{ index: 0 }]);
function clickAge(h, age, hit = true) {
	const click = chartHandler('./PatientCohortAgeChart.svelte', h);
	click(null, [], {
		getElementsAtEventForMode: () => (hit ? [{ datasetIndex: 0, index: 0 }] : []),
		data: { datasets: [{ data: [{ x: age, y: 7 }] }] }
	});
}

for (const restricted of [true, false]) {
	const mode = restricted ? 'empty' : 'populated';
	test(`gender clicks preserve all source codes and work before reload (${mode} criteria)`, () => {
		for (const value of ['m', 'w', 'f', 'd', 'x', '-', 'male', 'female']) {
			const h = createLensHarness({ restricted });
			clickSlice('./PatientCohortGenderChart.svelte', h, value);
			assert.deepEqual(values(h, 'gender'), [value]);
			assert.equal(h.reloads.length, 1);
			assert.deepEqual(h.reloads[0], h.query());
			assert.equal(h.events.at(-1), 'reload');
			assert.equal(row(h, 'gender').name, 'patient gender');
		}
	});

	test(`vital-status clicks keep full source values instead of legend translations (${mode} criteria)`, () => {
		for (const value of [
			'am Leben',
			'Verstorben (Tumorbedingt: Ja)',
			'Verstorben (Tumorbedingt: Nein)',
			'Verstorben (Tumorbedingt: Unbekannt)',
			'-'
		]) {
			const h = createLensHarness({ restricted });
			clickSlice('./PatientCohortDeathChart.svelte', h, value);
			assert.deepEqual(values(h, 'vitalState'), [value]);
			assert.deepEqual(h.reloads[0], h.query());
		}
	});

	test(`age clicks retain native numeric ranges, including zero (${mode} criteria)`, () => {
		for (const age of [0, 65, 100]) {
			const h = createLensHarness({ restricted });
			clickAge(h, age);
			clickAge(h, age);
			assert.equal(row(h, 'ageAtDiagnosis', 'diagnosis').type, 'BETWEEN');
			assert.deepEqual(values(h, 'ageAtDiagnosis', 'diagnosis'), [{ min: age, max: age }]);
			assert.deepEqual(h.reloads.at(-1), h.query());
		}
	});

	test(`all geographic drill-down levels use their source key and patient system (${mode} criteria)`, async () => {
		for (const [level, key, value, description] of [
			[1, 'countryCode', 'DE', 'Deutschland'],
			[2, 'state', 'Bayern', 'Bavaria'],
			[3, 'county', 'München', 'Munich'],
			[4, 'postalCode', '80331', 'München Zentrum']
		]) {
			const h = createLensHarness({ restricted });
			const pending = mapHandler(h, level)(value, description);
			assert.deepEqual(values(h, key), [value]);
			assert.deepEqual(h.reloads[0], h.query(), 'write must precede asynchronous map navigation');
			await pending;
		}
	});

	test(`C34, male/female, age, vital status, place and year combine and remove independently (${mode} criteria)`, async () => {
		const otherGroup = {
			id: 'other-group-row',
			key: 'gender',
			name: 'patient gender',
			system: 'patient',
			type: 'EQUALS',
			values: [{ name: 'Display f', value: 'f', queryBindId: 'other-group-value' }]
		};
		const h = createLensHarness({ restricted, initialQuery: [[], [otherGroup]] });
		addChartQueryItem(h.dataPasser, item('ICD_ICD10_3', 'C34'), assignment);
		clickSlice('./PatientCohortGenderChart.svelte', h, 'm');
		clickSlice('./PatientCohortGenderChart.svelte', h, 'w');
		clickSlice('./PatientCohortGenderChart.svelte', h, 'm');
		clickAge(h, 65);
		clickSlice('./PatientCohortDeathChart.svelte', h, 'am Leben');
		await mapHandler(h, 1)('DE', 'Deutschland');
		h.dataPasser.addStratifierToQueryAPI({
			label: '01.01.2026 - 12.31.2026',
			catalogueGroupCode: 'diagnosisDate',
			parentGroupCode: 'diagnosis'
		});
		assert.deepEqual(
			h
				.query()[0]
				.map(({ key }) => key)
				.sort(),
			[
				'ICD_ICD10_3',
				'ageAtDiagnosis',
				'countryCode',
				'diagnosisDate',
				'gender',
				'vitalState'
			].sort()
		);
		assert.deepEqual(values(h, 'gender'), ['m', 'w']);
		assert.deepEqual(h.query()[1], [otherGroup]);
		assert.equal(h.ast().operand, 'OR');
		assert.equal(h.ast().children.length, 2);
		assert.equal(h.ast().children[0].operand, 'AND');
		assert.equal(h.ast().children[0].children.find(({ key }) => key === 'gender').operand, 'OR');
		const bindings = h
			.query()[0]
			.flatMap(({ values }) => values.map(({ queryBindId }) => queryBindId));
		assert.equal(new Set(bindings).size, bindings.length);
		h.removeValue('gender', 'm');
		assert.deepEqual(values(h, 'gender'), ['w']);
		h.removeValue('ageAtDiagnosis', { min: 65, max: 65 }, 'diagnosis');
		assert.equal(row(h, 'ageAtDiagnosis', 'diagnosis'), undefined);
		h.removeRow('vitalState');
		assert.deepEqual(values(h, 'ICD_ICD10_3', 'diagnosis'), ['C34']);
		assert.deepEqual(values(h, 'countryCode'), ['DE']);
		assert.equal(row(h, 'diagnosisDate', 'diagnosis').type, 'BETWEEN');
		assert.deepEqual(h.query()[1], [otherGroup]);
		assert.equal(
			h.query()[0].some(({ key }) => key === 'ICD_ICD10Group'),
			false
		);
	});
}

test('missing gender and vital values use the established empty-value filter', () => {
	for (const file of ['./PatientCohortGenderChart.svelte', './PatientCohortDeathChart.svelte']) {
		for (const value of [null, ' null ', '-']) {
			const h = createLensHarness();
			clickSlice(file, h, value);
			assert.deepEqual(
				h.query()[0][0].values.map(({ value }) => value),
				['-']
			);
		}
	}
});

test('an assigned gender stays mandatory while selecting another gender remains a personal refinement', () => {
	const assignedFilter = { operand: 'AND', children: [leaf('gender', 'm')] };
	const h = createLensHarness({ assignedFilter });
	clickSlice('./PatientCohortGenderChart.svelte', h, 'm');
	assert.deepEqual(h.query(), [[]]);
	assert.deepEqual(h.events, ['reload']);
	clickSlice('./PatientCohortGenderChart.svelte', h, 'w');
	assert.deepEqual(values(h, 'gender'), ['w']);
	assert.deepEqual(assignedFilter, { operand: 'AND', children: [leaf('gender', 'm')] });
});

test('empty chart areas and invalid age points never insert filters or reload', () => {
	const h = createLensHarness();
	for (const file of ['./PatientCohortGenderChart.svelte', './PatientCohortDeathChart.svelte']) {
		const click = chartHandler(file, h, ['m']);
		click(null, []);
		click(null, [{ index: 9 }]);
	}
	clickAge(h, 65, false);
	for (const value of [null, undefined, NaN, Infinity]) clickAge(h, value);
	assert.deepEqual(h.query(), [[]]);
	assert.deepEqual(h.events, []);
});

test('patched Lens AST roundtrip preserves primitive types, range operators and same-name fields in different systems', () => {
	const astRow = (key, values, system = 'patient', type = 'EQUALS') => ({
		key,
		operand: 'OR',
		children: values.map((value) => leaf(key, value, system, type))
	});
	const ast = {
		operand: 'OR',
		children: [
			{
				operand: 'AND',
				children: [
					astRow('syntheticValue', [null, 0, 42, true, false, '42', 'false', '<label>']),
					astRow('gender', ['m']),
					astRow('gender', ['w'], 'diagnosis'),
					astRow('ageAtDiagnosis', [{ min: 20, max: 30 }], 'diagnosis', 'BETWEEN'),
					astRow('ageAtDiagnosis', [{ min: 50, max: 60 }], 'diagnosis', 'NBETWEEN'),
					astRow(
						'diagnosisDate',
						[{ min: 1767225600000, max: 1798675200000 }],
						'diagnosis',
						'BETWEEN'
					)
				]
			}
		]
	};
	const h = createLensHarness();
	h.dataPasser.setQueryStoreFromAstAPI(ast);
	assert.deepEqual(h.ast(), ast, 'AST → actual Lens query conversion → actual Lens AST conversion');
	assert.equal(
		h.query()[0][1].name,
		h.query()[0][2].name,
		'fixture exercises equal display names across systems'
	);
	h.dataPasser.addStratifierToQueryAPI({
		label: 'f',
		catalogueGroupCode: 'gender',
		parentGroupCode: 'patient'
	});
	addChartQueryItem(h.dataPasser, item('gender', 'f', 'patient'));
	assert.deepEqual(values(h, 'gender'), ['m', 'f']);
	assert.deepEqual(values(h, 'gender', 'diagnosis'), ['w']);
	assert.equal(h.query()[0].filter(({ key }) => key === 'ageAtDiagnosis').length, 2);
	assert.deepEqual(
		h.ast().children[0].children.find(({ key }) => key === 'syntheticValue').children,
		ast.children[0].children[0].children
	);
});

test('missing numeric and date selections remain typed equalities beside later native ranges', () => {
	const originalAssignment = JSON.stringify(assignment);
	for (const [key, nextValue] of [
		['ageAtDiagnosis', 65],
		['diagnosisDate', '01.01.2026 - 12.31.2026']
	]) {
		const h = createLensHarness();
		addChartQueryItem(h.dataPasser, item(key, null), assignment);
		assert.equal(row(h, key, 'diagnosis').type, 'EQUALS');
		assert.deepEqual(
			row(h, key, 'diagnosis').values.map(({ value }) => value),
			[null]
		);
		assert.deepEqual(h.events, ['write'], 'null must bypass native number/date string conversion');
		addChartQueryItem(h.dataPasser, item(key, nextValue), assignment);
		assert.equal(h.query()[0].length, 2);
		assert.deepEqual(
			h
				.query()[0]
				.find((candidate) => candidate.type === 'EQUALS')
				.values.map(({ value }) => value),
			[null]
		);
		const range = h.query()[0].find((candidate) => candidate.type === 'BETWEEN').values[0].value;
		assert.ok(Number.isFinite(range.min) && Number.isFinite(range.max));
	}
	const negative = createLensHarness();
	addChartQueryItem(
		negative.dataPasser,
		{ ...item('!ageAtDiagnosis', null), type: 'NEQUALS' },
		assignment
	);
	assert.deepEqual(negative.ast().children[0].children[0].children, [
		leaf('!ageAtDiagnosis', null, 'diagnosis', 'NEQUALS')
	]);
	assert.equal(JSON.stringify(assignment), originalAssignment);
});

test('patched Lens preserves open, zero and date-string range bounds during AST restoration', () => {
	for (const type of ['BETWEEN', 'NBETWEEN']) {
		for (const [key, value] of [
			['ageAtDiagnosis', { min: null, max: 30 }],
			['ageAtDiagnosis', { min: 50, max: null }],
			['ageAtDiagnosis', { min: null, max: null }],
			['ageAtDiagnosis', { min: 0, max: 0 }],
			['ageAtDiagnosis', { min: 0, max: 30 }],
			['diagnosisDate', { min: '2026-01-01', max: '2026-12-31' }],
			['diagnosisDate', { min: null, max: '2026-12-31' }]
		]) {
			const ast = {
				operand: 'OR',
				children: [
					{
						operand: 'AND',
						children: [
							{
								key,
								operand: 'OR',
								children: [leaf(key, value, 'diagnosis', type)]
							}
						]
					}
				]
			};
			const h = createLensHarness();
			h.dataPasser.setQueryStoreFromAstAPI(ast);
			assert.deepEqual(h.ast(), ast);
			if (value.min === 0)
				assert.doesNotMatch(h.query()[0][0].values[0].name, /[≤≥]/, 'zero is a real bound');
		}
	}
});

test('patched Lens restores an empty AST without getAstAPI crashing on its empty query array', () => {
	const emptyAst = { operand: 'OR', children: [] };
	const h = createLensHarness();
	h.dataPasser.setQueryStoreFromAstAPI(emptyAst);
	assert.deepEqual(h.query(), []);
	assert.deepEqual(h.ast(), emptyAst);
	assert.deepEqual(JSON.parse(JSON.stringify(h.dataPasser.getAstAPI())), emptyAst);
});
