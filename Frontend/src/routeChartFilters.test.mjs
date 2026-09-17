import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { createLensHarness } from './testhelpers/lensHarness.mjs';
import { getDiagnosisBarChartClickFilterTarget } from './routes/diagnosis/diagnosisBarChartFilterTarget.js';
import { getDiagnosisChartDateRange } from './routes/diagnosis/diagnosisDateRange.js';
import { createStudyShortnameQueryItem } from './routes/study/studyPatientChartModel.js';

const require = createRequire(import.meta.url);
const {
	internal: { localQuery }
} = require('../../Backend/Apollo/astTranslator.js');

const transpile = (source) =>
	ts.transpileModule(source, {
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
	}).outputText;
const helperSource = fs.readFileSync(new URL('./tableFilterItems.ts', import.meta.url), 'utf8');
const { addChartQueryItem } = await import(
	`data:text/javascript;base64,${Buffer.from(transpile(helperSource)).toString('base64')}`
);

// Pull the real event callback and its local insertion function out of each component.
// Chart rendering and stores are fixtures; query insertion and AST conversion execute
// the actual application helper and installed Lens functions.
function callbacks(path, bindingNames, callbackMarker) {
	const fullSource = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
	const source = path.endsWith('.svelte')
		? fullSource.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]
		: fullSource;
	const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
	const bindings = new Map();
	let callback;
	function visit(node) {
		if (ts.isVariableDeclaration(node) && bindingNames.includes(node.name.getText(parsed))) {
			bindings.set(node.name.getText(parsed), `const ${node.getText(parsed)};`);
		}
		if (ts.isFunctionDeclaration(node) && bindingNames.includes(node.name?.text)) {
			bindings.set(node.name.text, node.getText(parsed));
		}
		if (
			callbackMarker &&
			ts.isPropertyAssignment(node) &&
			node.name.getText(parsed) === 'onClick' &&
			node.initializer.getText(parsed).includes(callbackMarker)
		) {
			callback = node.initializer.getText(parsed);
		}
		ts.forEachChild(node, visit);
	}
	visit(parsed);
	for (const name of bindingNames)
		assert.ok(bindings.has(name), `missing real callback binding ${path}:${name}`);
	if (callbackMarker) assert.ok(callback, `missing real onClick callback in ${path}`);
	return new vm.Script(
		transpile(
			[
				...bindingNames.map((name) => bindings.get(name)),
				`globalThis.invoke = ${callback ?? bindingNames.at(-1)};`
			].join('\n')
		)
	);
}

const diagnosisCallback = callbacks(
	'./routes/diagnosis/DiagnosisBarChart.svelte',
	['addItem'],
	'getDiagnosisBarChartClickFilterTarget'
);
const studyCallback = callbacks(
	'./routes/study/StudyPatientChart.svelte',
	['addItem'],
	'createStudyShortnameQueryItem'
);
const tnmCallback = callbacks('./routes/tnm/drawTNM.ts', ['parseTNM', 'handleCubeClick']);
const leaf = (key, value, system = 'diagnosis') => ({ key, system, type: 'EQUALS', value });
const assigned = leaf('ICD_ICD10Group', 'C30-C39');
const field = (key, system, values = []) => ({
	key,
	name: key,
	system,
	fieldType: 'single-select',
	type: 'EQUALS',
	criteria: values.map((value) => ({ key: value, name: value }))
});
function fields(restricted) {
	return [
		{
			key: 'diagnosis',
			childCategories: [
				field('ICD_ICD10Group', 'diagnosis', restricted ? [] : ['C30-C39']),
				field('ICD_ICD10_3', 'diagnosis', restricted ? [] : ['C34', 'C32']),
				field('grading_first', 'diagnosis', restricted ? [] : ['G2']),
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
		{ key: 'patient', childCategories: [field('gender', 'patient', restricted ? [] : ['m', 'f'])] },
		{
			key: 'study',
			childCategories: [field('shortname', 'study', restricted ? [] : ['Trial A', 'Trial B'])]
		},
		{
			key: 'tnm',
			childCategories: [
				field('T', 'tnm', restricted ? [] : ['2a']),
				field('N', 'tnm', restricted ? [] : ['1b']),
				field('M', 'tnm', restricted ? [] : ['0']),
				field('TGroup', 'tnm', restricted ? [] : ['2']),
				field('NGroup', 'tnm', restricted ? [] : ['1']),
				field('MGroup', 'tnm', restricted ? [] : ['0'])
			]
		}
	];
}
function context(h, currentFilter, extra = {}) {
	const state = { reloads: 0 };
	const ctx = vm.createContext({
		addChartQueryItem,
		get: (store) => store,
		userStore: { currentFilter },
		dataPasser: h.dataPasser,
		reloadOnly: () => {
			state.reloads += 1;
		},
		console: { log() {}, error() {} },
		...extra
	});
	return { ctx, state };
}
function clickDiagnosis({
	restricted = true,
	feature = 'ICD_ICD10Group',
	label = 'C30-C39',
	xKey = 'ICD_ICD10_3',
	category = 'C34',
	gender = false,
	currentFilter = assigned
} = {}) {
	const h = createLensHarness(fields(restricted));
	const c = context(h, currentFilter, {
		getDiagnosisBarChartClickFilterTarget,
		getDiagnosisChartDateRange,
		chartConfig: { data: { datasets: [{ label, stack: 'm' }], labels: [category] } },
		requestedSelectedFeature: { value: feature },
		requestedSelectedGender: gender,
		requestedSelectedAbscissa: { label: 'Axis' },
		requestedAbscissaKey: xKey,
		inputArray: { groups: [] }
	});
	diagnosisCallback.runInContext(c.ctx);
	c.ctx.invoke(null, [{ index: 0, datasetIndex: 0 }]);
	return { ...h, ...c };
}

test('diagnosis categorical x-axis refines fixed C30-C39 to C34 immediately', () => {
	const h = clickDiagnosis();
	assert.deepEqual(
		h.query()[0].map(({ key }) => key),
		['ICD_ICD10_3']
	);
	assert.deepEqual(
		h.query()[0][0].values.map(({ value }) => value),
		['C34']
	);
	assert.equal(h.state.reloads, 1);
	h.removeValue('ICD_ICD10_3', 'C34');
	assert.deepEqual(h.query(), [[]]);
});

test('diagnosis categorical x-axis works with a different stratification and populated catalogue', () => {
	const h = clickDiagnosis({
		restricted: false,
		feature: 'grading_first',
		label: 'G2',
		currentFilter: null,
		gender: true
	});
	assert.deepEqual(
		h
			.query()[0]
			.map(({ key }) => key)
			.sort(),
		['ICD_ICD10_3', 'gender', 'grading_first']
	);
	const expected = h.query()[0].filter(({ key }) => key !== 'gender');
	h.removeRow('gender');
	assert.deepEqual(h.query()[0], expected);
});

for (const [category, lower, upper] of [
	['2026', '2026-01-01', '2026-12-31'],
	['2026-Q2', '2026-04-01', '2026-06-30'],
	['2026-02', '2026-02-01', '2026-02-28'],
	['2024-02', '2024-02-01', '2024-02-29'],
	['2026-W00', '2026-01-01', '2026-01-03'],
	['2026-W01', '2026-01-04', '2026-01-10'],
	['2026-W02', '2026-01-11', '2026-01-17'],
	['2026-W52', '2026-12-27', '2026-12-31'],
	['2023-W01', '2023-01-01', '2023-01-07'],
	['2023-W53', '2023-12-31', '2023-12-31'],
	['2024-W52', '2024-12-29', '2024-12-31']
]) {
	test(`diagnosis ${category} click selects the complete UTC bucket with hidden criteria`, () => {
		const h = clickDiagnosis({ xKey: 'diagnosisDate', category, gender: true });
		assert.deepEqual(
			h
				.query()[0]
				.map(({ key }) => key)
				.sort(),
			['diagnosisDate', 'gender']
		);
		const date = h.query()[0].find(({ key }) => key === 'diagnosisDate');
		assert.equal(date.type, 'BETWEEN');
		assert.deepEqual(date.values[0].value, {
			min: Date.parse(`${lower}T00:00:00.000Z`),
			max: Date.parse(`${upper}T00:00:00.000Z`)
		});
		const mongo = localQuery(
			{ key: 'diagnosisDate', system: 'diagnosis', type: 'BETWEEN', value: date.values[0].value },
			'diagnosis'
		);
		assert.equal(mongo.diagnosisDate.$gte.toISOString(), `${lower}T00:00:00.000Z`);
		assert.equal(
			mongo.diagnosisDate.$lte.toISOString(),
			`${upper}T00:00:00.000Z`,
			'backend must not round into the following day'
		);
		assert.equal(h.state.reloads, 1);
	});
}

test('invalid or absent calendar buckets do not create date filters', () => {
	for (const category of ['2023-W00', '2026-W53', '2026-W99', '2026-13', '2026-Q5', 'unknown']) {
		assert.equal(getDiagnosisChartDateRange(category), null, category);
		const h = clickDiagnosis({ xKey: 'diagnosisDate', category });
		assert.deepEqual(h.query(), [[]], category);
	}
});

for (const restricted of [false, true]) {
	test(`study bar uses complete shortname and supports individual removal (${
		restricted ? 'restricted' : 'unrestricted'
	})`, () => {
		const h = createLensHarness(fields(restricted));
		const shortname = 'Trial with a long complete synthetic shortname';
		const c = context(h, restricted ? assigned : null, {
			createStudyShortnameQueryItem,
			zoomedRows: [
				{ shortname, displayShortname: 'Trial with a lon[...]', studyPatients: 5 },
				{ shortname: 'Trial B', displayShortname: 'Trial B', studyPatients: 2 }
			]
		});
		studyCallback.runInContext(c.ctx);
		c.ctx.invoke(null, [{ index: 0 }]);
		c.ctx.invoke(null, [{ index: 1 }]);
		assert.equal(h.query()[0].length, 1);
		assert.equal(h.query()[0][0].system, 'study');
		assert.deepEqual(
			h.query()[0][0].values.map(({ value }) => value),
			[shortname, 'Trial B']
		);
		h.removeValue('shortname', shortname);
		assert.deepEqual(
			h.query()[0][0].values.map(({ value }) => value),
			['Trial B']
		);
		assert.equal(c.state.reloads, 2);
	});
}

test('study bar does not expose a mandatory shortname as editable filter', () => {
	const h = createLensHarness(fields(true));
	const c = context(h, leaf('shortname', 'Trial A', 'study'), {
		createStudyShortnameQueryItem,
		zoomedRows: [{ shortname: 'Trial A' }]
	});
	studyCallback.runInContext(c.ctx);
	c.ctx.invoke(null, [{ index: 0 }]);
	assert.deepEqual(h.query(), [[]]);
	assert.equal(h.nativeCalls(), 0);
});

function clickTNM({
	mode = 'group',
	tnm = 'T2 N1 M0',
	hidden = [],
	currentFilter = assigned
} = {}) {
	const h = createLensHarness(fields(true));
	const settings = Object.fromEntries(
		['T', 'N', 'M'].map((axis) => [
			`TNM3DChartSelected${axis}Type`,
			{ value: hidden.includes(axis) ? 'hide' : mode }
		])
	);
	const c = context(h, currentFilter, {
		configStore: {
			subscribe: (callback) => {
				callback(settings);
				return () => {};
			}
		}
	});
	tnmCallback.runInContext(c.ctx);
	c.ctx.invoke(null, h.dataPasser, { tnm });
	return { ...h, ...c };
}
test('TNM cube inserts grouped T/N/M values with independent Lens rows', () => {
	const h = clickTNM();
	assert.deepEqual(
		h.query()[0].map(({ key, system, values }) => ({ key, system, value: values[0].value })),
		[
			{ key: 'TGroup', system: 'tnm', value: '2' },
			{ key: 'NGroup', system: 'tnm', value: '1' },
			{ key: 'MGroup', system: 'tnm', value: '0' }
		]
	);
	h.removeRow('NGroup');
	assert.deepEqual(
		h.query()[0].map(({ key }) => key),
		['TGroup', 'MGroup']
	);
	assert.equal(h.state.reloads, 1);
});
test('TNM cube inserts detailed suffixes and skips a mandatory T value', () => {
	const h = clickTNM({ mode: 'detail', tnm: 'T2a N1b M0', currentFilter: leaf('T', '2a', 'tnm') });
	assert.deepEqual(
		h.query()[0].map(({ key, values }) => [key, values[0].value]),
		[
			['N', '1b'],
			['M', '0']
		]
	);
});
test('TNM cube does not constrain axes hidden from its aggregation', () => {
	const h = clickTNM({ hidden: ['T', 'N'], tnm: 'M0' });
	assert.deepEqual(
		h.query()[0].map(({ key, values }) => [key, values[0].value]),
		[['MGroup', '0']]
	);
});
