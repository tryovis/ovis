import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import moment from 'moment';
import { createLensHarness } from './testhelpers/lensHarness.mjs';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const transpile = (source) =>
	ts.transpileModule(source, {
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
	}).outputText;
const helpers = await import(
	`data:text/javascript;base64,${Buffer.from(
		transpile(fs.readFileSync(new URL('./tableFilterItems.ts', import.meta.url), 'utf8'))
	).toString('base64')}`
);
const scopeBundle = await build({
	entryPoints: [fileURLToPath(new URL('./components/therapy/fixedFilterSelection.ts', import.meta.url))],
	bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent'
});
const { applyFixedFilterSelection } = await import(`data:text/javascript;base64,${Buffer.from(scopeBundle.outputFiles[0].text).toString('base64')}`);
function functions(file, names, callbackMarker) {
	const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
	const script = source.includes('<script')
		? source.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]
		: source;
	const ast = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true),
		found = new Map();
	const walk = (node) => {
		if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
			found.set(node.name.text, node.getText(ast));
		if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast)))
			found.set(node.name.getText(ast), `const ${node.getText(ast)};`);
		if (
			callbackMarker &&
			ts.isPropertyAssignment(node) &&
			node.name.getText(ast) === 'onClick' &&
			node.initializer.getText(ast).includes(callbackMarker)
		)
			found.set('click', `globalThis.click=${node.initializer.getText(ast)};`);
		ts.forEachChild(node, walk);
	};
	walk(ast);
	for (const n of names) assert.ok(found.has(n), `${file}: ${n}`);
	return transpile(
		[...found.values(), ...names.map((n) => `globalThis.${n}=${n};`)].join('\n')
	).replace(/^export /gm, '');
}
const basics = functions('./components/quicktools/QuicktoolsBasics.svelte', [
	'addDiagnosis',
	'addHistology',
	'addGender',
	'addOtherGender',
	'handleGenderButton'
]);
const certs = functions('./components/quicktools/QuicktoolsCertification.svelte', [
	'addItem',
	'applyCertification'
]);
const catalogues = functions('./components/quicktools/QuicktoolsCatalogues.svelte', [
	'DKH_CATEGORIES',
	'addItem',
	'selectCatalog',
	'addICD',
	'selectDKH'
]);
const tnm = functions('./components/TNMPicker.svelte', [
	'addEquals',
	'applyExact',
	'applyGrouped',
	'close'
]);
const number = functions('./components/NumberPicker.svelte', ['addNumber']);
const datePicker = functions('./components/DatePicker.svelte', ['addDate']);
const table = functions('./tableBuilder.ts', ['addItem', 'handleArray', 'bindCellClickHandler']);
const stacked = functions(
	'./components/GenericStackedBarChart.svelte',
	['addItem'],
	'tmpInputArray.category'
);
const category = functions('./components/GenericCategoryChart.svelte', ['addItem']);
const assignment = {
	operand: 'AND',
	children: [{ key: 'ICD_ICD10Group', system: 'diagnosis', type: 'EQUALS', value: 'C30-C39' }]
};
const definitions = {
	patient: { gender: ['m', 'w', 'd'], vitalState: ['alive', 'dead'], patID: ['SYNTHETIC-1'] },
	diagnosis: {
		gender: ['m', 'w'],
		ICD_ICD10Group: ['C30-C39'],
		ICD_ICD10_3: ['C34', 'C32'],
		ICDO_histologyCode: ['8140/3'],
		primaryCase: ['Ja', 'Nein'],
		recurrence: ['true', 'false'],
		centerCase: ['Ja', 'Nein'],
		internal: ['Meine Einrichtung'],
		rareCancer: ['true'],
		sclc: ['sclc'],
		nsclc: ['nsclc'],
		oz_example: ['true'],
		enets_gepNet: ['true'],
		ageAtDiagnosisGroup: ['60-69']
	},
	histology: { ICDO_histologyCode: ['8140/3'] },
	therapy: {
		type: ['OP', 'ST'],
		ops_code: ['5-123', '5-456'],
		substance_substance: ['Drug A', 'Drug B'],
		surgeon: ['SYNTH-A', 'SYNTH-B'],
		metastasisResection: ['R1', 'R2'],
		complication_complication: ['Bleeding', 'Infection'],
		complication_grade: ['1', '2', '3']
	},
	supplementary: { type: ['ECOG'], status: ['0', '1', '2'] },
	molecularMarker: { type: ['HER2'], status: ['positive', 'negative'] },
	tnm: { T: ['2', '2a'], TGroup: ['2'], N: ['1'], NGroup: ['1'], M: ['0'], MGroup: ['0'] }
};
function fixture(restricted = true) {
	const catalogue = Object.entries(definitions).map(([system, fields]) => ({
		key: system,
		childCategories: Object.entries(fields).flatMap(([key, values]) =>
			[key, '!' + key].map((k) => ({
				key: k,
				name: key,
				system,
				type: k.startsWith('!') ? 'NEQUALS' : 'EQUALS',
				fieldType: 'single-select',
				criteria: (restricted ? [] : values).map((value) => ({ key: value, name: String(value) }))
			}))
		)
	}));
	const lens = createLensHarness(catalogue),
		picker = [],
		reloads = [];
	catalogue
		.find((group) => group.key === 'diagnosis')
		.childCategories.push({
			key: 'diagnosisDate',
			name: 'Diagnosis date',
			system: 'diagnosis',
			type: 'BETWEEN',
			fieldType: 'date',
			criteria: []
		});
	lens.setCatalogue(catalogue);
	const c = vm.createContext({
		...helpers,
		fixedFilter: null,
		applyFixedFilterSelection,
		$datePickerStore: {},
		$numberPickerStore: {},
		moment,
		get: (s) => s,
		userStore: { currentFilter: restricted ? JSON.stringify(assignment) : '' },
		dataPasser: lens.dataPasser,
		currentDataPasser: lens.dataPasser,
		console: { log() {}, error() {} },
		reloadOnly: () => reloads.push(lens.query()),
		selectedDiagnose: '',
		selectedHistologie: '',
		genderOtherExclusionList: ['m', 'w'],
		genderOtherExclusionSet: new Set(['m', 'w']),
		makeBindId: (p, v) => p + v,
		lensReady: true,
		selectedCatalog: null,
		collection: 'tnm',
		typeOfTNM: 'T',
		selectedTNM: '2',
		toggleTNMPicker() {},
		toggleNumberPicker() {},
		isConfirmDisabled: false,
		tnmPickerStore: { set: (v) => picker.push(v) },
		numberStore: { set: (v) => picker.push(v) },
		dateStore: { set: (v) => picker.push(v) }
	});
	return {
		lens,
		c,
		picker,
		reloads,
		run: (script) => vm.runInContext(script, c),
		rows: () => lens.query()[0],
		row: (key, system) =>
			lens.query()[0].find((r) => r.key === key && (!system || r.system === system))
	};
}
for (const restricted of [true, false]) {
	test(`quick selections use actual codes and compose without dropping criteria (${
		restricted ? 'restricted' : 'full'
	})`, () => {
		const h = fixture(restricted);
		h.run(basics);
		h.c.addDiagnosis('C34 → Lung');
		h.c.addGender('m');
		h.c.addGender('w');
		h.c.addHistology('8140/3 → Histology');
		assert.deepEqual(
			h.row('ICD_ICD10_3').values.map((v) => v.value),
			['C34']
		);
		assert.deepEqual(
			h.row('gender', 'patient').values.map((v) => v.value),
			['m', 'w']
		);
		assert.equal(h.row('ICDO_histologyCode').values[0].value, '8140/3');
		h.c.addOtherGender();
		assert.deepEqual(
			h.row('!gender').values.map((v) => v.value),
			['m', 'w']
		);
		assert.equal(h.row('!gender').type, 'NEQUALS');
		h.c.addDiagnosis('C30-C39 → Fixed group');
		assert.equal(Boolean(h.row('ICD_ICD10Group')), !restricted);
		assert.equal(h.reloads.length, 6);
	});
	test(`all certification buttons retain positive and negative values (${
		restricted ? 'restricted' : 'full'
	})`, () => {
		const h = fixture(restricted);
		h.run(certs);
		for (const [key, values] of Object.entries({
			primaryCase: ['Ja', 'Nein'],
			recurrence: ['true', 'false'],
			centerCase: ['Ja', 'Nein'],
			internal: ['Meine Einrichtung']
		}))
			for (const value of values)
				h.c.applyCertification({
					key,
					system: 'diagnosis',
					type: 'EQUALS',
					value,
					label: key,
					id: key,
					bindId: key
				});
		h.c.applyCertification({
			key: '!internal',
			system: 'diagnosis',
			type: 'NEQUALS',
			value: 'Meine Einrichtung',
			label: 'internal',
			id: 'internal',
			bindId: 'internal'
		});
		assert.equal(h.rows().length, 5);
		assert.equal(h.row('!internal').type, 'NEQUALS');
		assert.deepEqual(
			h.row('primaryCase').values.map((v) => v.value),
			['Ja', 'Nein']
		);
	});
	test(`predefined catalogue selections work without global criteria (${
		restricted ? 'restricted' : 'full'
	})`, () => {
		const h = fixture(restricted);
		h.run(catalogues);
		for (const [key, label] of [
			['euracan', 'EURACAN'],
			['sclc', 'SCLC'],
			['nsclc', 'NSCLC'],
			['oz_example', 'ONKOZERT'],
			['enets_gepNet', 'NET'],
			['agegroups_adult', '60-69']
		])
			h.c.selectCatalog(key, label);
		assert.equal(h.rows().length, 6);
		assert.equal(h.row('rareCancer').values[0].value, 'true');
		assert.equal(h.row('ageAtDiagnosisGroup').values[0].value, '60-69');
	});
	test(`TNM dialog exact/grouped clicks remain separate (${
		restricted ? 'restricted' : 'full'
	})`, () => {
		const h = fixture(restricted);
		h.run(tnm);
		h.c.applyExact();
		h.c.applyGrouped();
		assert.equal(h.row('T').values[0].value, '2');
		assert.equal(h.row('TGroup').values[0].value, '2');
		assert.equal(h.reloads.length, 2);
	});
	test(`DKH presets reload once with every selected diagnosis and optional age (${
		restricted ? 'restricted' : 'full'
	})`, () => {
		const h = fixture(restricted);
		h.run(catalogues);
		h.c.selectDKH('uterus');
		assert.deepEqual(
			h.row('ICD_ICD10_3').values.map((v) => v.value),
			['C54', 'C55']
		);
		assert.equal(h.reloads.length, 1);
		assert.equal(h.reloads[0][0][0].values.length, 2);
		h.c.selectDKH('pediatric_all');
		assert.equal(h.row('ageAtDiagnosisGroup').values[0].value, '0-17');
		assert.equal(h.reloads.length, 2);
		h.c.selectDKH('unknown');
		assert.equal(h.reloads.length, 2);
	});
	test(`table clicks filter scalar/array/status fields and open the correct pickers (${
		restricted ? 'restricted' : 'full'
	})`, () => {
		const h = fixture(restricted);
		h.run(table);
		const click = (system, key, value, row = {}) => {
			const cell = { closest: () => ({}) };
			const dt = {
				settings: () => [{ aoColumns: [{ data: key }] }],
				row: () => ({ data: () => row })
			};
			h.c.bindCellClickHandler(() => dt, cell, value, 0, system, true);
			cell.onclick();
		};
		click('patient', 'gender', 'm');
		click('diagnosis', 'ICD.ICD10_3', 'C34');
		click('histology', 'ICDO_histologyCode', '8140/3');
		click('therapy', 'ops', ['5-123', '5-456']);
		click('therapy', 'substance', ['Drug A', 'Drug B']);
		click('therapy', 'surgeon', ['SYNTH-A', 'SYNTH-B']);
		click('therapy', 'metastasisResection', ['R1', 'R2']);
		click('supplementary', 'status', '1', { type: 'ECOG' });
		click('molecularMarker', 'status', 'positive', { type: 'HER2' });
		assert.equal(h.row('gender', 'patient').values[0].value, 'm');
		assert.equal(h.row('ICDO_histologyCode', 'diagnosis').values[0].value, '8140/3');
		assert.equal(h.row('ops_code').values.length, 2);
		assert.equal(h.row('type', 'supplementary').values[0].value, 'ECOG');
		assert.equal(h.row('type', 'molecularMarker').values[0].value, 'HER2');
		click('diagnosis', 'diagnosisDate', '15.06.2026');
		click('diagnosis', 'ageAtDiagnosis', 65);
		click('tnm', 'T', '2');
		assert.equal(h.picker[0].typeOfDate, 'diagnosisDate');
		assert.equal(h.picker[1].fieldName, 'ageAtDiagnosis');
		assert.equal(h.picker[2].typeOfTNM, 'T');
	});
}
test('number intervals stay disjoint and do not modify another editable OR branch', () => {
	const h = fixture();
	h.run(number);
	h.c.collection = 'diagnosis';
	h.c.fieldName = 'ageAtDiagnosis';
	h.lens.dataPasser.setQueryStoreAPI([
		[],
		[
			{
				id: 'other',
				key: 'gender',
				name: 'gender',
				type: 'EQUALS',
				system: 'patient',
				values: [{ name: 'w', value: 'w', queryBindId: 'other-value' }]
			}
		]
	]);
	for (const [lo, hi] of [
		[20, 30],
		[50, 60],
		[20, 30]
	]) {
		h.c.lowerValue = lo;
		h.c.upperValue = hi;
		h.c.addNumber();
	}
	assert.deepEqual(
		h.row('ageAtDiagnosis').values.map((v) => v.value),
		[
			{ min: 20, max: 30 },
			{ min: 50, max: 60 }
		]
	);
	assert.equal(h.lens.query()[1][0].values[0].value, 'w');
});

test('date dialog day, year and interval clicks retain inclusive calendar bounds', () => {
	const h = fixture();
	h.run(datePicker);
	h.c.toggleDatePicker = () => {};
	h.c.collection = 'histology';
	h.c.typeOfDate = 'diagnosisDate';
	Object.assign(h.c, {
		selectedOption: 'datum',
		selectedUpperDay: '15',
		selectedUpperMonth: '06',
		selectedUpperYear: '2026',
		lowerDay: '15',
		lowerMonth: '06',
		lowerYear: '2026'
	});
	h.c.addDate();
	Object.assign(h.c, { selectedOption: 'jahr', selectedUpperYear: '2025', lowerYear: '2025' });
	h.c.addDate();
	Object.assign(h.c, {
		selectedOption: 'datum',
		selectedUpperDay: '01',
		selectedUpperMonth: '02',
		selectedUpperYear: '2024',
		lowerDay: '29',
		lowerMonth: '02',
		lowerYear: '2024'
	});
	h.c.addDate();
	assert.deepEqual(
		h.row('diagnosisDate', 'diagnosis').values.map((v) => v.value),
		[
			{ min: new Date(2026, 5, 15).getTime(), max: new Date(2026, 5, 15).getTime() },
			{ min: new Date(2025, 0, 1).getTime(), max: new Date(2025, 11, 31).getTime() },
			{ min: new Date(2024, 1, 1).getTime(), max: new Date(2024, 1, 29).getTime() }
		]
	);
	assert.equal(h.reloads.length, 3);
});
test('native Lens insertion never merges same labels across collections or operators', () => {
	const h = fixture(false);
	h.run(basics);
	h.c.addGender('m');
	h.lens.dataPasser.addStratifierToQueryAPI({
		label: 'w',
		catalogueGroupCode: 'gender',
		parentGroupCode: 'diagnosis'
	});
	h.c.addOtherGender();
	assert.equal(h.rows().length, 3);
	assert.deepEqual(
		h.row('gender', 'patient').values.map((v) => v.value),
		['m']
	);
	assert.equal(h.row('gender', 'diagnosis').values[0].value, 'w');
});
for (const collection of ['therapy', 'supplementary', 'molecularMarker'])
	test(`stacked chart selects both dimensions in ${collection} and Other uses exclusions`, () => {
		const h = fixture();
		h.c.collection = collection;
		h.c.OTHER_LABEL = 'Other';
		h.c.tmpInputArray = {
			category: ['Synthetic type'],
			groups: [
				{ label: '1', count: [2] },
				{ label: 'Other', count: [3] }
			]
		};
		h.c.datasets = [{ label: '1' }, { label: 'Other' }];
		h.run(stacked);
		h.c.click(null, [{ index: 0, datasetIndex: 0 }]);
		const status = collection === 'therapy' ? 'complication_grade' : 'status';
		assert.equal(h.row(status).values[0].value, '1');
		h.c.click(null, [{ index: 0, datasetIndex: 1 }]);
		assert.equal(h.row('!' + status).type, 'NEQUALS');
	});
test('category raw null/numeric/string values remain typed in the query', () => {
	const h = fixture();
	h.c.collection = 'therapy';
	h.run(category);
	for (const value of [null, 7, '7']) h.c.addItem('testValue', 'EQUALS', value);
	assert.deepEqual(
		h.row('testValue').values.map((v) => v.value),
		[null, 7, '7']
	);
});
