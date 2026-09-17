import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const helperSource = fs.readFileSync(new URL('../tableFilterItems.ts', import.meta.url), 'utf8');
const helperCode = ts.transpileModule(helperSource, {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText;
const { addChartQueryItem } = await import(
	`data:text/javascript;base64,${Buffer.from(helperCode).toString('base64')}`
);

// Execute the actual map handler and level-to-field mapping. Rendering and navigation
// are stubs; the Lens fixture retains field definitions but has no global criteria.
const component = fs.readFileSync(new URL('./GenericSVG.svelte', import.meta.url), 'utf8');
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
	if (ts.isFunctionDeclaration(node) && ['handleClick', 'setCatalog'].includes(node.name?.text)) {
		statements.push(node.getText(parsed));
	}
}
assert.equal(statements.length, 3, 'exercise the real map insertion, click and field mapping');
const executable = ts.transpileModule(statements.join('\n'), {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;

const assignment = {
	operand: 'OR',
	children: [
		{
			operand: 'AND',
			children: [
				{
					key: 'ICD_ICD10Group',
					system: 'diagnosis',
					type: 'EQUALS',
					value: 'C30-C39'
				}
			]
		}
	]
};
const personalItem = (key, value, system = 'diagnosis') => ({
	id: `existing-${key}`,
	key,
	name: key,
	system,
	type: 'EQUALS',
	values: [{ name: value, value, queryBindId: `existing-value-${key}` }]
});
const plain = (value) => JSON.parse(JSON.stringify(value));

function createMap({
	assignedFilter = assignment,
	initialQuery = [],
	type = 'diagnosis',
	level = 2,
	maxLevel = 3
} = {}) {
	let query = structuredClone(initialQuery);
	const events = [];
	const reloads = [];
	let nextId = 0;
	const catalogue = [
		{
			key: type,
			childCategories: ['ICD_ICD10Group', 'ICD_ICD10_3', 'state', 'radiation_areaGrouped'].map(
				(key) => ({
					key,
					name: `Catalogue label for ${key}`,
					system: type,
					type: 'EQUALS',
					criteria: []
				})
			)
		}
	];
	const context = vm.createContext({
		addChartQueryItem,
		get: (store) => store,
		userStore: { currentFilter: assignedFilter },
		SVGType: type,
		currentLevel: level,
		maxLevel,
		currentCatalog: '',
		currentColor: '#123456',
		currentSVG: `/svg/${type}/level${level}.svg`,
		dataPasser: {
			getQueryAPI: () => query,
			setQueryStoreAPI: (next) => {
				events.push('write');
				query = next;
			},
			addStratifierToQueryAPI: ({ label, catalogueGroupCode, parentGroupCode }) => {
				// Lens' categorical lookup cannot resolve values omitted by protectCatalogue.
				events.push('catalogue-lookup');
				const field = catalogue
					.find((category) => category.key === parentGroupCode)
					?.childCategories.find((candidate) => candidate.key === catalogueGroupCode);
				if (!field) return;
				const firstGroup = query[0] ?? [];
				const previous = firstGroup.find((item) => item.name === field.name);
				const item = {
					id: `native-row-${++nextId}`,
					key: field.key,
					name: field.name,
					system: field.system,
					type: field.type,
					values: previous?.values ?? field.criteria.filter((criterion) => criterion.key === label)
				};
				query = [
					[...firstGroup.filter((existing) => existing.name !== field.name), item],
					...query.slice(1)
				];
			}
		},
		reloadOnly: () => {
			events.push('reload');
			reloads.push(plain(query));
		},
		trackUsageEvent() {},
		updateSVG() {},
		publicAssetPath: (path) => path,
		replaceUmlauts: (label) => label,
		fileExists: async () => false,
		backToPreviousLevel: async () => {},
		console
	});
	vm.runInContext(executable, context);
	context.setCatalog();
	return { context, events, reloads, query: () => plain(query) };
}

test('first C34 bodymap click writes the scoped diagnosis before immediate reload with an empty catalogue', async () => {
	const map = createMap();
	const clicked = map.context.handleClick('C34', 'Lunge');
	const immediateEvents = [...map.events];
	await clicked;
	assert.deepEqual(immediateEvents, ['catalogue-lookup', 'write', 'reload']);
	assert.equal(map.reloads.length, 1);
	assert.equal(map.reloads[0].length, 1);
	assert.equal(map.reloads[0][0].length, 1);
	const selected = map.reloads[0][0][0];
	assert.equal(selected.system, 'diagnosis');
	assert.equal(selected.key, 'ICD_ICD10_3');
	assert.equal(selected.type, 'EQUALS');
	assert.equal(selected.values[0].value, 'C34');
	assert.equal(selected.name, 'Catalogue label for ICD_ICD10_3');
	assert.equal(selected.id, 'native-row-1');
	assert.notEqual(selected.values[0].queryBindId, 'Auch eine random UUID');
	assert.deepEqual(map.query(), map.reloads[0]);
});

test('clicking the already assigned diagnosis group never adds a removable personal criterion', async () => {
	for (const assignedFilter of [assignment, JSON.stringify(assignment)]) {
		const map = createMap({ assignedFilter, level: 1 });
		await map.context.handleClick('C30-C39', 'Atmungsorgane');
		assert.deepEqual(map.query(), []);
		assert.deepEqual(map.reloads, [[]]);
	}
});

test('bodymap click preserves existing personal filters and OR branches and deduplicates repeated values', async () => {
	const prior = [[personalItem('diagnosisDate', '2026')], [personalItem('ICD_ICD10_3', 'C32')]];
	const before = JSON.stringify(prior);
	const map = createMap({ initialQuery: prior, maxLevel: 2 });
	await map.context.handleClick('C34', 'Lunge');
	await map.context.handleClick('C34', 'Lunge');
	assert.equal(map.query()[0].length, 2);
	assert.deepEqual(map.query()[0][0], prior[0][0]);
	assert.deepEqual(map.query()[1], prior[1]);
	assert.deepEqual(
		map.query()[0][1].values.map(({ value }) => value),
		['C34']
	);
	assert.equal(JSON.stringify(prior), before);
});

test('unrestricted diagnosis and geographic map selections retain their field and system', async () => {
	const diagnosis = createMap({ assignedFilter: null, level: 1, maxLevel: 1 });
	await diagnosis.context.handleClick('C30-C39', 'Atmungsorgane');
	assert.equal(diagnosis.query()[0][0].key, 'ICD_ICD10Group');
	assert.equal(diagnosis.query()[0][0].values[0].value, 'C30-C39');
	const patient = createMap({ type: 'patient', maxLevel: 2 });
	await patient.context.handleClick('Bayern', 'Bayern');
	assert.equal(patient.query()[0][0].system, 'patient');
	assert.equal(patient.query()[0][0].key, 'state');
	assert.equal(patient.query()[0][0].values[0].value, 'Bayern');
});

test('grouped radiation selections preserve the description used as the filter value', async () => {
	const map = createMap({ type: 'therapy', maxLevel: 2 });
	map.context.currentCatalog = 'radiation_areaGrouped';
	await map.context.handleClick('thorax', 'Thorax');
	assert.equal(map.query()[0][0].system, 'therapy');
	assert.equal(map.query()[0][0].key, 'radiation_areaGrouped');
	assert.equal(map.query()[0][0].values[0].value, 'Thorax');
});
