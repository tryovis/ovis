import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { extendLensQueryIdentity } from '../../../lensCatalogueSchemaPlugin.js';

const helperSource = fs.readFileSync(new URL('../../tableFilterItems.ts', import.meta.url), 'utf8');
const helperCode = ts.transpileModule(helperSource, {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText;
export const { addChartQueryItem } = await import(
	`data:text/javascript;base64,${Buffer.from(helperCode).toString('base64')}`
);

// Use the locked Lens bundle's actual insertion, deletion and AST conversion code.
// A renamed symbol after a dependency update requires reviewing this test adapter.
const lensSource = extendLensQueryIdentity(
	fs.readFileSync(
		new URL('../../../node_modules/@samply/lens/dist/lens.js', import.meta.url),
		'utf8'
	)
);
const lensAst = ts.createSourceFile('lens.js', lensSource, ts.ScriptTarget.Latest, true);
const symbols = [
	'Vn',
	'Lf',
	'gu',
	'mu',
	'zf',
	'Bi',
	'Hn',
	'io',
	'Dr',
	'sh',
	'oh',
	'rh',
	'ah',
	'lh',
	'wu',
	'ch',
	'uh',
	'dh',
	'bo',
	'Pf'
];
const declarations = new Map();
for (const statement of lensAst.statements) {
	if (ts.isFunctionDeclaration(statement) && symbols.includes(statement.name?.text)) {
		declarations.set(statement.name.text, statement.getText(lensAst));
	}
	if (ts.isVariableStatement(statement)) {
		for (const declaration of statement.declarationList.declarations) {
			if (ts.isIdentifier(declaration.name) && symbols.includes(declaration.name.text)) {
				declarations.set(declaration.name.text, `const ${declaration.getText(lensAst)};`);
			}
		}
	}
}
for (const symbol of symbols) assert.ok(declarations.has(symbol), `review Lens adapter: ${symbol}`);
const executable = new vm.Script(
	[
		...symbols.map((symbol) => declarations.get(symbol)),
		'globalThis.lens = { add: zf, removeValue: gu, removeRow: mu, toAst: Hn, fromAst: sh };'
	].join('\n')
);

export const copy = (value) => JSON.parse(JSON.stringify(value));
export const leaf = (key, value, system = 'patient', type = 'EQUALS') => ({
	key,
	value,
	system,
	type
});
export const assignment = {
	operand: 'AND',
	children: [leaf('ICD_ICD10Group', 'C30-C39', 'diagnosis')]
};
const rawValues = {
	gender: ['m', 'w', 'f', 'd', 'x', '-', 'male', 'female'],
	vitalState: [
		'am Leben',
		'Verstorben (Tumorbedingt: Ja)',
		'Verstorben (Tumorbedingt: Nein)',
		'Verstorben (Tumorbedingt: Unbekannt)',
		'-'
	],
	countryCode: ['DE', 'AT'],
	state: ['Bayern', 'Berlin'],
	county: ['München'],
	postalCode: ['80331'],
	ICD_ICD10_3: ['C34', 'C32'],
	ICD_ICD10Group: ['C30-C39'],
	isTumor: ['true', 'false']
};
function field(key, system, restricted) {
	return {
		key,
		system,
		name: `${system} ${key}`,
		type: 'EQUALS',
		fieldType: 'single-select',
		criteria: restricted
			? []
			: rawValues[key].map((value) => ({ key: value, name: `Display ${value}` }))
	};
}
function makeCatalogue(restricted) {
	return [
		{
			key: 'patient',
			childCategories: ['gender', 'vitalState', 'countryCode', 'state', 'county', 'postalCode'].map(
				(key) => field(key, 'patient', restricted)
			)
		},
		{
			key: 'diagnosis',
			childCategories: [
				field('ICD_ICD10_3', 'diagnosis', restricted),
				field('ICD_ICD10Group', 'diagnosis', restricted),
				field('isTumor', 'diagnosis', restricted),
				{
					key: 'ageAtDiagnosis',
					name: 'Age at diagnosis',
					system: 'diagnosis',
					type: 'BETWEEN',
					fieldType: 'number',
					criteria: []
				},
				{
					key: 'diagnosisDate',
					name: 'Diagnosis date',
					system: 'diagnosis',
					type: 'BETWEEN',
					fieldType: 'date',
					criteria: []
				}
			]
		}
	];
}

export function createLensHarness({
	restricted = true,
	initialQuery = [[]],
	assignedFilter = assignment
} = {}) {
	let query = structuredClone(initialQuery);
	const catalogue = makeCatalogue(restricted);
	const events = [];
	const reloads = [];
	const context = vm.createContext({
		Dt: randomUUID,
		Pr: () => catalogue,
		Ce: {},
		as: { set() {} },
		le: {
			update: (update) => {
				query = update(query);
			}
		}
	});
	executable.runInContext(context);
	const { lens } = context;
	const dataPasser = {
		getQueryAPI: () => query,
		getAstAPI: () => lens.toAst(query),
		setQueryStoreAPI: (next) => {
			events.push('write');
			query = next;
		},
		setQueryStoreFromAstAPI: (ast) => {
			events.push('ast-write');
			query = lens.fromAst(ast);
		},
		addStratifierToQueryAPI: (selection) => {
			events.push('lookup');
			lens.add({ ...selection, catalogue });
		}
	};
	return {
		dataPasser,
		events,
		reloads,
		assignedFilter,
		query: () => copy(query),
		ast: () => copy(lens.toAst(query)),
		reloadOnly: () => {
			events.push('reload');
			reloads.push(copy(query));
		},
		removeValue(key, value, system = 'patient', groupIndex = 0) {
			const row = query[groupIndex].find((item) => item.key === key && item.system === system);
			const selected = row.values.find(
				(candidate) => JSON.stringify(candidate.value) === JSON.stringify(value)
			);
			assert.ok(selected, `missing selected value ${key}`);
			lens.removeValue({ ...row, values: [selected] }, groupIndex);
		},
		removeRow(key, system = 'patient', groupIndex = 0) {
			const row = query[groupIndex].find((item) => item.key === key && item.system === system);
			assert.ok(row, `missing selected row ${key}`);
			lens.removeRow(row, groupIndex);
		}
	};
}

export function chartHandler(fileName, harness, values = []) {
	const component = fs.readFileSync(new URL(fileName, import.meta.url), 'utf8');
	const script = component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
	const parsed = ts.createSourceFile(fileName, script, ts.ScriptTarget.Latest, true);
	let insertion;
	let handler;
	function visit(node) {
		if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'addItem')
			insertion = `const ${node.getText(parsed)};`;
		if (ts.isPropertyAssignment(node) && node.name.getText(parsed) === 'onClick')
			handler = node.initializer.getText(parsed);
		ts.forEachChild(node, visit);
	}
	visit(parsed);
	assert.ok(insertion && handler, `missing real click handler in ${fileName}`);
	const context = vm.createContext({
		addChartQueryItem,
		dataPasser: harness.dataPasser,
		get: (store) => store,
		userStore: { currentFilter: harness.assignedFilter },
		reloadOnly: harness.reloadOnly,
		inputArray: { label: values },
		chartConfig: { data: { labels: values.map((value) => `Translated ${value}`) } },
		console: { log() {} }
	});
	vm.runInContext(
		ts.transpileModule(`${insertion}\nglobalThis.click = ${handler};`, {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
		}).outputText,
		context
	);
	return context.click;
}

export function mapHandler(harness, level) {
	const wrapper = fs.readFileSync(
		new URL('./PatientCohortMapChart.svelte', import.meta.url),
		'utf8'
	);
	assert.match(wrapper, /<GenericSVG[\s\S]*SVGType=\{"patient"\}/);
	const component = fs.readFileSync(
		new URL('../../components/GenericSVG.svelte', import.meta.url),
		'utf8'
	);
	const script = component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
	const parsed = ts.createSourceFile('GenericSVG.ts', script, ts.ScriptTarget.Latest, true);
	const statements = [];
	for (const node of parsed.statements) {
		if (
			ts.isVariableStatement(node) &&
			node.declarationList.declarations.some(
				(declaration) => declaration.name.getText(parsed) === 'addItem'
			)
		)
			statements.push(node.getText(parsed));
		if (ts.isFunctionDeclaration(node) && ['setCatalog', 'handleClick'].includes(node.name?.text))
			statements.push(node.getText(parsed));
	}
	assert.equal(statements.length, 3);
	const context = vm.createContext({
		addChartQueryItem,
		dataPasser: harness.dataPasser,
		get: (store) => store,
		userStore: { currentFilter: harness.assignedFilter },
		reloadOnly: harness.reloadOnly,
		SVGType: 'patient',
		currentLevel: level,
		maxLevel: 4,
		currentCatalog: '',
		currentColor: '',
		currentSVG: '/svg/patientWorldMaps/level1.svg',
		trackUsageEvent() {},
		updateSVG() {},
		publicAssetPath: (path) => path,
		replaceUmlauts: (label) => label,
		fileExists: async () => false,
		backToPreviousLevel: async () => {}
	});
	vm.runInContext(
		ts.transpileModule(statements.join('\n'), {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
		}).outputText,
		context
	);
	context.setCatalog();
	return context.handleClick;
}
