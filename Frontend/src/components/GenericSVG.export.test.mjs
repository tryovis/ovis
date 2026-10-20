import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const component = fs.readFileSync(new URL('./GenericSVG.svelte', import.meta.url), 'utf8');
const script = component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
const parsed = ts.createSourceFile('GenericSVG.ts', script, ts.ScriptTarget.Latest, true);
const loader = parsed.statements.find(
	(node) => ts.isFunctionDeclaration(node) && node.name?.text === 'loadInlineSvg'
);
assert.ok(loader, 'exercise the actual SVG load and export-context commit');
const executable = ts.transpileModule(loader.getText(parsed), {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;
const plain = (value) => JSON.parse(JSON.stringify(value));

function createHarness() {
	const completions = [];
	const context = vm.createContext({
		console: { error() {}, warn() {} },
		loadToken: 0,
		currentLevel: 2,
		currentSVG: 'level2.svg',
		currentCatalog: 'state',
		SVGType: 'patient',
		showLegend: true,
		filter: 'loaded-filter',
		exportLoading: false,
		exportContext: { selection: { currentSVG: 'level1.svg' } },
		svgHost: { shadowRoot: { replaceChildren() {} } },
		svgRoot: null,
		mapAvailable: true,
		showChartStoreValue: true,
		normalizeSvgViewport() {},
		fetch: async () => ({ ok: true, text: async () => '<svg />' }),
		DOMParser: class {
			parseFromString() {
				return {
					querySelector: () => null,
					querySelectorAll: () => [],
					documentElement: { tagName: 'svg' }
				};
			}
		},
		document: { importNode: () => ({}) },
		handleSvgLoad: () => new Promise((resolve) => completions.push(resolve)),
		loadDataForTableOnly: () => new Promise((resolve) => completions.push(resolve))
	});
	vm.runInContext(executable, context);
	return { context, completions };
}

async function reachRender(completions, expected = 1) {
	for (let attempt = 0; completions.length < expected && attempt < 10; attempt++) {
		await Promise.resolve();
	}
	assert.equal(completions.length, expected);
}

test('map export stays disabled until the requested SVG and data finish rendering', async () => {
	const { context, completions } = createHarness();
	const pending = context.loadInlineSvg('level2.svg');
	assert.equal(context.exportLoading, true);
	await reachRender(completions);
	assert.equal(context.exportContext.selection.currentSVG, 'level1.svg');
	completions[0]();
	await pending;
	assert.equal(context.exportLoading, false);
	assert.deepEqual(plain(context.exportContext), {
		filterActive: true,
		filter: 'loaded-filter',
		selection: {
			collection: 'patient',
			currentSVG: 'level2.svg',
			currentLevel: 2,
			currentCatalog: 'state',
			showLegend: true
		}
	});
});

test('an older SVG completion cannot reenable export or overwrite the new map context', async () => {
	const { context, completions } = createHarness();
	const older = context.loadInlineSvg('level2.svg');
	await reachRender(completions);
	context.currentLevel = 3;
	context.currentCatalog = 'county';
	context.currentSVG = 'level3.svg';
	const newer = context.loadInlineSvg('level3.svg');
	await reachRender(completions, 2);
	completions[0]();
	await older;
	assert.equal(context.exportLoading, true);
	assert.equal(context.exportContext.selection.currentSVG, 'level1.svg');
	completions[1]();
	await newer;
	assert.equal(context.exportLoading, false);
	assert.equal(context.exportContext.selection.currentSVG, 'level3.svg');
	assert.equal(context.exportContext.selection.currentCatalog, 'county');
});

test('pending navigation and failed rendering cannot publish a mismatched map scope', async () => {
	const { context, completions } = createHarness();
	const pending = context.loadInlineSvg('level2.svg');
	await reachRender(completions);
	context.currentLevel = 3;
	completions[0]();
	await pending;
	assert.equal(context.exportLoading, true);
	assert.equal(context.exportContext.selection.currentSVG, 'level1.svg');
	context.currentSVG = 'level3.svg';
	context.handleSvgLoad = async () => {
		throw new Error('failed data request');
	};
	await context.loadInlineSvg('level3.svg');
	assert.equal(context.exportLoading, true);
	assert.equal(context.exportContext.selection.currentSVG, 'level1.svg');
});

test('a missing SVG shows its table and enables export only after the matching data finishes', async () => {
	const { context, completions } = createHarness();
	context.currentSVG = 'level3_D09.svg';
	context.currentLevel = 3;
	context.currentCatalog = 'ICD_ICD10';
	context.fetch = async () => ({ ok: false, status: 404 });
	const pending = context.loadInlineSvg('level3_D09.svg');
	await reachRender(completions);
	assert.equal(context.mapAvailable, false);
	assert.equal(context.svgRoot, null);
	assert.equal(context.exportLoading, true);
	assert.equal(context.showChartStoreValue, true, 'automatic table fallback preserves the user preference');
	completions[0]();
	await pending;
	assert.equal(context.exportLoading, false);
	assert.equal(context.exportContext.selection.currentCatalog, 'ICD_ICD10');
	assert.equal(context.exportContext.selection.currentLevel, 3);
	assert.equal(context.exportContext.selection.currentSVG, 'level3_D09.svg');
});

test('an available map restores chart availability after a table-only category', async () => {
	const { context, completions } = createHarness();
	context.mapAvailable = false;
	const pending = context.loadInlineSvg('level2.svg');
	await reachRender(completions);
	completions[0]();
	await pending;
	assert.equal(context.mapAvailable, true);
	assert.ok(context.svgRoot);
	assert.equal(context.exportLoading, false);
});

test('a late missing-map response cannot hide a newer map or overwrite its data scope', async () => {
	const { context, completions } = createHarness();
	let finishOldRequest;
	const normalFetch = context.fetch;
	context.fetch = (source) => source === 'level2.svg'
		? new Promise((resolve) => { finishOldRequest = resolve; })
		: normalFetch(source);
	const older = context.loadInlineSvg('level2.svg');
	context.currentSVG = 'level3.svg';
	context.currentLevel = 3;
	const newer = context.loadInlineSvg('level3.svg');
	await reachRender(completions);
	completions[0]();
	await newer;
	finishOldRequest({ ok: false, status: 404 });
	await older;
	assert.equal(context.mapAvailable, true);
	assert.equal(context.exportContext.selection.currentSVG, 'level3.svg');
	assert.equal(completions.length, 1, 'the stale request must not start a table refresh');
});
