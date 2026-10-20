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
	if (
		ts.isFunctionDeclaration(node) &&
		['handleClick', 'setCatalog', 'handleMapTableRowClick', 'processSVGColoring', 'processMetastasis'].includes(node.name?.text)
	) {
		statements.push(node.getText(parsed));
	}
}
assert.equal(statements.length, 6, 'exercise the real map/table insertion, click and field mapping');
const tableSource = ts.createSourceFile(
	'tableBuilder.ts',
	fs.readFileSync(new URL('../tableBuilder.ts', import.meta.url), 'utf8'),
	ts.ScriptTarget.Latest,
	true
);
statements.push(tableSource.statements.find(
	(node) => ts.isFunctionDeclaration(node) && node.name?.text === 'bindCellClickHandler'
).getText(tableSource));
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
			childCategories: [
				'ICD_ICD10Group', 'ICD_ICD10_3', 'ICD_ICD10',
				'countryCode', 'state', 'county', 'postalCode',
				'radiation_supArea', 'radiation_subArea', 'radiation_areaGrouped', 'metastasisLocation'
			].map(
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
		filter: JSON.stringify({ operand: 'AND', children: [] }),
		currentColor: '#123456',
		currentSVG: `/svg/${type}/level${level}.svg`,
		tableName: `${type}MapTable`,
		tableShownRows: 20,
		sortingIndex: 1,
		svgRoot: null,
		tick: async () => {},
		document: { getElementById: () => ({}) },
		t: (key) => key,
		createTable: (...args) => ({ args }),
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
	return {
		context, events, reloads, query: () => plain(query),
		async tableCell(column, rows) {
			if (type === 'metastasis') {
				context.getTNMBodyMap = async () => rows;
				await context.processMetastasis();
			} else {
				await context.processSVGColoring(rows);
			}
			const args = context.mapTable.args;
			const row = args[3][0];
			const cell = { closest: () => ({}) };
			context.bindCellClickHandler(
				() => ({
					settings: () => [{ aoColumns: [{ data: column }] }],
					row: () => ({ data: () => row })
				}),
				cell, row[column], 0, args[0], args[8], undefined, args[9].cellClickHandlers
			);
			return cell;
		}
	};
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

for (const [level, key, label] of [
	[1, 'ICD_ICD10Group', 'C81-C96'],
	[2, 'ICD_ICD10_3', 'C81'],
	[3, 'ICD_ICD10', 'C81.1']
]) {
	for (const column of ['label', 'longText']) {
		test(`bodymap ${column} click at level ${level} selects ${key} and its code`, async () => {
			const map = createMap({ assignedFilter: null, level });
			const cell = await map.tableCell(column, [{ label, description: 'Long diagnosis description', count: 6 }]);
			await cell.onclick();
			const selected = map.query()[0][0];
			assert.equal(selected.key, key);
			assert.equal(selected.system, 'diagnosis');
			assert.equal(selected.values[0].value, label);
			assert.equal(map.reloads.length, 1);
			assert.deepEqual(map.query(), map.reloads[0]);
		});
	}
}

test('bodymap counts and rows without a code never create display-column filters', async () => {
	for (const [column, label] of [['count', 'C81'], ['label', ''], ['longText', null]]) {
		const map = createMap({ assignedFilter: null });
		const cell = await map.tableCell(column, [{ label, description: 'Description only', count: 6 }]);
		await cell.onclick();
		assert.deepEqual(map.query(), []);
		assert.equal(map.reloads.length, 0);
	}
});

test('bodymap table selection respects assigned filters and deduplicates label/description clicks', async () => {
	const fixed = createMap({ level: 1 });
	const fixedCell = await fixed.tableCell('longText', [{ label: 'C30-C39', description: 'Atmungsorgane', count: 6 }]);
	await fixedCell.onclick();
	assert.deepEqual(fixed.query(), []);
	const prior = [[personalItem('diagnosisDate', '2026')], [personalItem('ICD_ICD10_3', 'C32')]];
	const map = createMap({ assignedFilter: null, initialQuery: prior, maxLevel: 2 });
	for (const column of ['label', 'longText']) {
		const cell = await map.tableCell(column, [{ label: 'C81', description: 'Hodgkin', count: 6 }]);
		await cell.onclick();
	}
	assert.deepEqual(map.query()[0][0], prior[0][0]);
	assert.deepEqual(map.query()[1], prior[1]);
	assert.equal(map.query()[0].length, 2);
	assert.deepEqual(map.query()[0][1].values.map(({ value }) => value), ['C81']);
});

for (const [type, level, key, label, description, columns] of [
	['patient', 1, 'countryCode', 'DE', 'Deutschland', ['label', 'longText']],
	['patient', 2, 'state', 'Bayern', '', ['label']],
	['patient', 3, 'county', 'Würzburg', '', ['label']],
	['patient', 4, 'postalCode', '01067', 'Dresden', ['label', 'longText']],
	['therapy', 1, 'radiation_supArea', '1', 'ZNS', ['label', 'longText']],
	['therapy', 2, 'radiation_subArea', '1.1.', 'Ganzhirn', ['label', 'longText']],
	['metastasis', 1, 'metastasisLocation', 'OSS', '', ['label']]
]) {
	for (const column of columns) {
		test(`${type} map ${column} click at level ${level} selects ${key} and its original value`, async () => {
			const map = createMap({ type, level, maxLevel: level, assignedFilter: null });
			const cell = await map.tableCell(column, [{ label, description, count: 6 }]);
			assert.ok(map.context.mapTable.args[4].some(({ data }) => data === column));
			await cell.onclick();
			const selected = map.query()[0][0];
			assert.equal(selected.key, key);
			assert.equal(selected.system, type);
			assert.equal(selected.values[0].value, label);
			assert.equal(map.reloads.length, 1);
			assert.deepEqual(map.query(), map.reloads[0]);
		});
	}
	test(`${type} map count at level ${level} does not create a filter`, async () => {
		const map = createMap({ type, level, maxLevel: level, assignedFilter: null });
		const cell = await map.tableCell('count', [{ label, description, count: 6 }]);
		await cell.onclick();
		assert.deepEqual(map.query(), []);
		assert.equal(map.reloads.length, 0);
	});
}

test('radiation table preserves the grouped-description selection used by the map', async () => {
	const map = createMap({ type: 'therapy', level: 1, maxLevel: 1, assignedFilter: null });
	map.context.currentCatalog = 'radiation_areaGrouped';
	const cell = await map.tableCell('longText', [{ label: 'thorax', description: 'Thorax', count: 6 }]);
	await cell.onclick();
	assert.equal(map.query()[0][0].key, 'radiation_areaGrouped');
	assert.equal(map.query()[0][0].system, 'therapy');
	assert.equal(map.query()[0][0].values[0].value, 'Thorax');
});
