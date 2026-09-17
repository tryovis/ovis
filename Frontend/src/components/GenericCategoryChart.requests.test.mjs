import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { prepareCategoryChart } from './categoryChartModel.js';
import { createLatestRequest } from '../lib/latestRequest.js';

const component = fs.readFileSync(
	new URL('./GenericCategoryChart.svelte', import.meta.url),
	'utf8'
);
const script = component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
const parsed = ts.createSourceFile('GenericCategoryChart.ts', script, ts.ScriptTarget.Latest, true);
const edits = [];
const reactiveFunctions = [];

// Exercise the component's real loader and reactive statements without a DOM.
// Stub rendering, stores and transport; retain the real chart model and request guard.
for (const statement of parsed.statements) {
	if (ts.isImportDeclaration(statement)) {
		edits.push({ start: statement.getStart(parsed), end: statement.end, text: '' });
		continue;
	}
	if (ts.isLabeledStatement(statement) && statement.label.text === '$') {
		const name = `reactiveUpdate${reactiveFunctions.length}`;
		reactiveFunctions.push(name);
		edits.push({
			start: statement.getStart(parsed),
			end: statement.end,
			text: `function ${name}() { ${statement.statement.getText(parsed)} }`
		});
	}
	for (const modifier of statement.modifiers ?? []) {
		if (modifier.kind === ts.SyntaxKind.ExportKeyword) {
			edits.push({ start: modifier.getStart(parsed), end: modifier.end, text: '' });
		}
	}
}

let testScript = script;
for (const edit of edits.sort((left, right) => right.start - left.start)) {
	testScript = testScript.slice(0, edit.start) + edit.text + testScript.slice(edit.end);
}
const executable = ts.transpileModule(testScript, {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;

function createHarness(fetchCategory, options = {}) {
	const calls = [];
	const errors = [];
	const charts = [];
	const tables = [];
	const filters = [];
	const store = (value) => ({
		value,
		subscribe(callback) {
			callback(value);
			return () => {};
		}
	});
	const context = vm.createContext({
		Chart: class {
			static register() {}
			constructor(_context, config) {
				this.config = config;
				this.destroyed = false;
				charts.push(this);
			}
			destroy() {
				this.destroyed = true;
			}
			resize() {}
		},
		registerables: [],
		createEventDispatcher: () => () => {},
		onMount: () => {},
		onDestroy: () => {},
		tick: options.tick ?? (async () => {}),
		get: (value) => value.value,
		createTable: (...args) => {
			const table = {
				args,
				destroyed: false,
				destroy() {
					this.destroyed = true;
				}
			};
			tables.push(table);
			return table;
		},
		changeRowCount: () => {},
		addUserFilter: async (filter) => filter,
		prepareCategoryChart,
		getCategoryChart: (...args) => {
			calls.push(args);
			return fetchCategory(...args);
		},
		createLatestRequest,
		iconPath: (path) => path,
		filterActiveStore: store({ filterActive: true }),
		userStore: store({ colorPalette: ['#008000'] }),
		t: store((key) => (key === 'other' ? 'Other' : key)),
		reloadOnly: () => {},
		addChartQueryItem: (_dataPasser, filter) => {
			filters.push(filter);
			return {};
		},
		requestAnimationFrame: () => 1,
		cancelAnimationFrame: () => {},
		setTimeout,
		clearTimeout,
		console: { error: (...args) => errors.push(args) }
	});
	vm.runInContext(
		`${executable}
		collection = 'study';
		initialDropdownValue = 'phase';
		showChartStoreValue = ${options.showChart !== false};
		dropdownObject = [{label: 'Phase', value: 'phase'}, {label: 'Status', value: 'status'}];
		isMounted = true;
		dataPasser = {
			getAstAPI: () => ({operand: 'OR', children: []}),
			getQueryAPI: () => ({}),
			setQueryStoreAPI: () => {}
		};
		pieChart = { getContext: () => ({}) };
		globalThis.harness = {
			update() { ${reactiveFunctions.map((name) => `${name}();`).join(' ')} },
			select(value) { initialDropdownValue = value; },
			retry() { retryCategoryData(); },
			toggleChart(value) { return handleChartToggled({detail: {headlineShowChart: value}}); },
			toggleTop5(value) { handleTop5Toggled({detail: {headlineInitialTop5: value}}); },
			state() { return { requestedDataKey, statusReady, showEmptyIcon, loading, loadError, exportRows: reversedTableData }; }
		};`,
		context
	);
	return { ...context.harness, calls, errors, charts, tables, filters };
}

async function flushUpdates(harness, cycles = 4) {
	for (let cycle = 0; cycle < cycles; cycle += 1) {
		harness.update();
		await new Promise((resolve) => setImmediate(resolve));
	}
}

test('a rejected category request stays settled across reactive updates', async () => {
	const harness = createHarness(async () => {
		throw new Error('Category query failed');
	});

	await flushUpdates(harness);

	assert.equal(harness.calls.length, 1, 'a failed request must not trigger automatic retries');
	assert.equal(harness.errors.length, 1);
	assert.equal(harness.state().requestedDataKey, 'study:phase');
});

test('changing the feature after a failure makes exactly one fresh request', async () => {
	const harness = createHarness(async () => {
		throw new Error('Category query failed');
	});
	await flushUpdates(harness);

	harness.select('status');
	await flushUpdates(harness);

	assert.deepEqual(
		harness.calls.map(([feature]) => feature),
		['phase', 'status']
	);
	assert.equal(harness.state().requestedDataKey, 'study:status');
});

test('explicit retry can recover the same feature without duplicate requests', async () => {
	let attempts = 0;
	const harness = createHarness(async () => {
		if (++attempts === 1) throw new Error('Temporary failure');
		return { label: ['I'], count: [3] };
	});
	await flushUpdates(harness);

	harness.retry();
	await flushUpdates(harness);

	assert.equal(harness.calls.length, 2);
	assert.equal(harness.state().requestedDataKey, 'study:phase');
	assert.equal(harness.state().statusReady, true);
	assert.equal(harness.state().showEmptyIcon, false);
});

test('the optional table is created once when opened and reuses loaded chart data', async () => {
	const harness = createHarness(async () => ({ label: ['I'], count: [3] }));
	await flushUpdates(harness);
	assert.equal(harness.tables.length, 0);

	await harness.toggleChart(false);
	assert.equal(harness.tables.length, 1);
	assert.equal(harness.tables[0].args[3][0].phase, 'I');
	await harness.toggleChart(true);
	await harness.toggleChart(false);
	assert.equal(harness.tables.length, 1);
	assert.equal(harness.calls.length, 1);
});

test('persisted table mode waits for the DOM update before creating DataTables', async () => {
	let finishDomUpdate;
	const domUpdate = new Promise((resolve) => {
		finishDomUpdate = resolve;
	});
	const harness = createHarness(async () => ({ label: ['I'], count: [3] }), {
		showChart: false,
		tick: () => domUpdate
	});
	await flushUpdates(harness);
	assert.equal(harness.calls.length, 1);
	assert.equal(harness.tables.length, 0);

	finishDomUpdate();
	await flushUpdates(harness);
	assert.equal(harness.tables.length, 1);
});

test('visual options do not redraw previous data while another feature is loading', async () => {
	let resolveStatus;
	const harness = createHarness(async (feature) =>
		feature === 'phase'
			? { label: ['I'], count: [3] }
			: new Promise((resolve) => {
					resolveStatus = resolve;
			  })
	);
	await flushUpdates(harness);
	harness.select('status');
	await flushUpdates(harness);
	assert.equal(harness.state().loading, true);

	harness.toggleTop5(true);
	await harness.toggleChart(false);
	assert.equal(harness.charts.length, 1);
	assert.equal(harness.tables.length, 0);

	resolveStatus({ label: ['Active'], count: [5] });
	await flushUpdates(harness);
	assert.equal(harness.charts.length, 2);
	assert.equal(harness.tables[0].args[3][0].status, 'Active');
});

test('a failed replacement clears stale export rows and destroys previous renderers', async () => {
	const harness = createHarness(async (feature) => {
		if (feature === 'status') throw new Error('Status unavailable');
		return { label: ['I'], count: [3] };
	});
	await flushUpdates(harness);
	await harness.toggleChart(false);
	assert.equal(harness.state().exportRows.length, 1);

	harness.select('status');
	await flushUpdates(harness);
	assert.equal(harness.state().loadError, true);
	assert.equal(harness.state().loading, false);
	assert.equal(harness.state().exportRows.length, 0);
	assert.equal(harness.charts[0].destroyed, true);
	assert.equal(harness.tables[0].destroyed, true);
});

test('a stale request failure cannot clear the latest successful feature', async () => {
	let rejectPhase;
	const harness = createHarness(async (feature) =>
		feature === 'phase'
			? new Promise((_resolve, reject) => {
					rejectPhase = reject;
			  })
			: { label: ['Active'], count: [5] }
	);
	await flushUpdates(harness);
	harness.select('status');
	await flushUpdates(harness);

	rejectPhase(new Error('Stale request failed'));
	await flushUpdates(harness);
	assert.equal(harness.state().loadError, false);
	assert.equal(harness.state().loading, false);
	assert.equal(harness.state().exportRows[0].status, 'Active');
	assert.equal(harness.charts.length, 1);
	assert.equal(harness.charts[0].destroyed, false);
});

test('Other excludes exactly the displayed top five when category counts are tied', async () => {
	const harness = createHarness(async () => ({
		label: ['F', 'E', 'D', 'C', 'B', 'A'],
		count: [1, 1, 1, 1, 1, 1]
	}));
	harness.toggleTop5(true);
	await flushUpdates(harness);
	const config = harness.charts.at(-1).config;
	assert.deepEqual(Array.from(config.data.labels), ['A', 'B', 'C', 'D', 'E', 'Other']);

	config.options.onClick(null, [{ index: 5 }]);
	assert.deepEqual(
		harness.filters.map((filter) => filter.values[0].value),
		['A', 'B', 'C', 'D', 'E']
	);
	assert.ok(harness.filters.every((filter) => filter.type === 'NEQUALS'));
});

test('a real category named Sonstige keeps its value and is not treated as Other', async () => {
	const harness = createHarness(async () => ({
		label: ['Sonstige', 'A', 'B', 'C', 'D', 'E'],
		count: [9, 8, 7, 6, 5, 4]
	}));
	harness.toggleTop5(true);
	await flushUpdates(harness);
	const config = harness.charts.at(-1).config;
	assert.equal(config.data.labels[0], 'Sonstige');
	assert.equal(config.data.labels[5], 'Other');

	config.options.onClick(null, [{ index: 0 }]);
	assert.equal(harness.filters.length, 1);
	assert.equal(harness.filters[0].type, 'EQUALS');
	assert.equal(harness.filters[0].values[0].value, 'Sonstige');
});
