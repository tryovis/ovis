import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { get, writable } from 'svelte/store';
import {
	addChartQueryItem,
	copy,
	createLensHarness
} from '../../routes/patient-cohort/patientCohortFilterHarness.mjs';

const escapeSource = fs.readFileSync(new URL('../../lib/escape-html.ts', import.meta.url), 'utf8');
const escapeCode = ts.transpileModule(escapeSource, {
	compilerOptions: { module: ts.ModuleKind.ESNext }
}).outputText;
const { escapeHtml } = await import(
	`data:text/javascript;base64,${Buffer.from(escapeCode).toString('base64')}`
);
const component = fs.readFileSync(
	new URL('./QuicktoolsActiveFilters.svelte', import.meta.url),
	'utf8'
);
const source = component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
const parsed = ts.createSourceFile(
	'QuicktoolsActiveFilters.ts',
	source,
	ts.ScriptTarget.Latest,
	true
);
const statements = parsed.statements.flatMap((node) => {
	if (ts.isImportDeclaration(node)) return [];
	if (
		ts.isVariableStatement(node) &&
		node.declarationList.declarations.some(
			(declaration) => declaration.name.getText(parsed) === 'dataPasser'
		)
	)
		return [];
	if (ts.isLabeledStatement(node) && node.label.text === '$')
		return [`function updateHistoryButtons() ${node.statement.getText(parsed)}`];
	return [node.getText(parsed)];
});
const executable = ts
	.transpileModule(
		`${statements.join('\n')}
globalThis.api = { removeValue: handleRemoveInnerOr, removeRow: handleRemoveChildrenByKey,
 prev: handlePrev, next: handleNext, clear: deleteAst, upload: uploadAst, parseNode, save: addNewAst,
 ast: () => currentAst, buttons: () => ({ prev: isPrevDisabled, next: isNextDisabled }) };`,
		{
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
		}
	)
	.outputText.replace("import('@samply/lens')", 'Promise.resolve()');

function historyStore() {
	const store = writable({
		currentIndex: 0,
		filterSaveArray: [JSON.stringify({ operand: 'OR', children: [] })]
	});
	let inUpdate = false;
	return {
		subscribe: store.subscribe,
		set: store.set,
		update(update) {
			assert.equal(inUpdate, false, 'history updates must not re-enter');
			inUpdate = true;
			try {
				store.update(update);
			} finally {
				inUpdate = false;
			}
		},
		inUpdate: () => inUpdate
	};
}
const flush = async () => {
	for (let i = 0; i < 5; i++) await Promise.resolve();
};

async function mount(harness, history = historyStore(), { deferredUpgrade = false } = {}) {
	const mounts = [];
	const destroys = [];
	const listeners = new Set();
	const window = {
		addEventListener(name, callback) {
			assert.equal(name, 'lens-query-updated');
			listeners.add(callback);
		},
		removeEventListener(_name, callback) {
			listeners.delete(callback);
		},
		emit() {
			for (const callback of listeners) callback();
		}
	};
	const dataPasser = { ...harness.dataPasser };
	let finishUpgrade;
	const elementDefined = deferredUpgrade
		? new Promise((resolve) => {
				finishUpgrade = resolve;
		  })
		: Promise.resolve();
	for (const method of ['setQueryStoreAPI', 'setQueryStoreFromAstAPI', 'addStratifierToQueryAPI']) {
		dataPasser[method] = (...args) => {
			assert.equal(history.inUpdate(), false, 'Lens must not be written inside a history updater');
			window.emit(); // Match Lens' event-before-data-passer-update ordering.
			return harness.dataPasser[method](...args);
		};
	}
	const context = vm.createContext({
		dataPasser: deferredUpgrade ? {} : dataPasser,
		filterSaveStore: history,
		$filterSaveStore: get(history),
		get,
		userStore: writable({ primaryColor: '#000' }),
		filterActiveStore: writable({ filterActive: true }),
		onMount: (callback) => mounts.push(callback),
		onDestroy: (callback) => destroys.push(callback),
		tick: async () => {},
		queueMicrotask,
		window,
		reloadOnly: harness.reloadOnly,
		customElements: {
			whenDefined: (name) => {
				assert.equal(name, 'lens-data-passer');
				return elementDefined;
			}
		},
		FileReader: class {
			readAsText(file) {
				this.onload({ target: { result: file.text } });
			}
		},
		iconPath: (value) => value,
		appPath: (value) => value,
		escapeHtml,
		console
	});
	vm.runInContext(executable, context);
	const unsubscribeHistory = history.subscribe((value) => {
		context.$filterSaveStore = value;
		context.updateHistoryButtons();
	});
	const cleanups = mounts.map((callback) => callback());
	await flush();
	return {
		api: context.api,
		dataPasser,
		history,
		listeners,
		window,
		upgrade() {
			context.dataPasser = dataPasser;
			finishUpgrade?.();
		},
		dispose() {
			for (const cleanup of cleanups) cleanup?.();
			for (const destroy of destroys) destroy();
			unsubscribeHistory();
		}
	};
}

const selectedRow = (key, system, values, id, type = 'EQUALS') => ({
	id,
	key,
	name: `${system} ${key}`,
	system,
	type,
	values: values.map((value, index) => ({
		name: String(value),
		value,
		queryBindId: `${id}-${index}`
	}))
});
const node = (h, groupIndex, rowIndex, valueIndex = 0) =>
	copy(h.ast().children[groupIndex].children[rowIndex].children[valueIndex]);

test('removing a value affects only its clicked group, system and field', async () => {
	const query = [
		[
			selectedRow('gender', 'patient', ['m', 'w'], 'patient-gender'),
			selectedRow('gender', 'diagnosis', ['m'], 'diagnosis-gender'),
			selectedRow('ICD_ICD10_3', 'diagnosis', ['C34'], 'diagnosis-code')
		],
		[selectedRow('gender', 'patient', ['m'], 'other-group')]
	];
	const h = createLensHarness({ initialQuery: query });
	const ui = await mount(h);
	const originalAst = h.ast();
	ui.api.removeValue(0, 0, 0, copy(originalAst.children[0].children[0].children[0]));
	assert.deepEqual(
		h.query()[0][0].values.map(({ value }) => value),
		['w']
	);
	assert.deepEqual(h.query()[0][1], query[0][1]);
	assert.deepEqual(h.query()[0][2], query[0][2]);
	assert.deepEqual(h.query()[1], query[1]);
	assert.equal(originalAst.children[0].children[0].children.length, 2);
	ui.dispose();
});

test('removing a field leaves same-key fields in other systems and OR groups intact', async () => {
	const query = [
		[selectedRow('gender', 'patient', ['m'], 'a'), selectedRow('gender', 'diagnosis', ['m'], 'b')],
		[selectedRow('gender', 'patient', ['w'], 'c')]
	];
	const h = createLensHarness({ initialQuery: query });
	const ui = await mount(h);
	ui.api.removeRow(0, 0, node(h, 0, 0));
	assert.deepEqual(h.query(), [[query[0][1]], query[1]]);
	ui.dispose();
});

test('numeric/date ranges compare by content and remove one clicked range', async () => {
	const ranges = [
		{ min: 50, max: 59 },
		{ min: 60, max: 69 }
	];
	const h = createLensHarness({
		initialQuery: [
			[
				selectedRow('ageAtDiagnosis', 'diagnosis', ranges, 'age', 'BETWEEN'),
				selectedRow(
					'diagnosisDate',
					'diagnosis',
					[{ min: 1767225600000, max: 1798675200000 }],
					'date',
					'BETWEEN'
				)
			]
		]
	});
	const ui = await mount(h);
	const rangeNode = node(h, 0, 0);
	rangeNode.value = { max: 59, min: 50 }; // Equal contents, independent object and key order.
	ui.api.removeValue(0, 0, 0, rangeNode);
	assert.deepEqual(
		h.query()[0][0].values.map(({ value }) => value),
		[ranges[1]]
	);
	assert.equal(h.query()[0][1].key, 'diagnosisDate');
	ui.dispose();
});

test('stale or mismatched selection identities do not remove a different criterion', async () => {
	const h = createLensHarness({
		initialQuery: [[selectedRow('gender', 'patient', ['m'], 'gender')]]
	});
	const ui = await mount(h);
	const before = h.query();
	ui.api.removeValue(0, 0, 0, { ...node(h, 0, 0), value: 'w' });
	ui.api.removeRow(0, 0, { ...node(h, 0, 0), system: 'diagnosis' });
	ui.api.removeRow(9, 0, node(h, 0, 0));
	assert.deepEqual(h.query(), before);
	assert.equal(h.reloads.length, 0);
	ui.dispose();
});

test('history observes the completed Lens update once and undo/redo restore exact snapshots', async () => {
	const h = createLensHarness();
	const ui = await mount(h);
	const first = selectedRow('ICD_ICD10_3', 'diagnosis', ['C34'], 'lung');
	addChartQueryItem(ui.dataPasser, first);
	await flush();
	const lungOnly = h.query();
	assert.equal(
		get(ui.history).filterSaveArray.length,
		2,
		'native empty lookup and fallback form one completed state'
	);
	assert.equal(get(ui.history).currentIndex, 1);
	const age = selectedRow('ageAtDiagnosis', 'diagnosis', [{ min: 65, max: 65 }], 'age', 'BETWEEN');
	ui.dataPasser.setQueryStoreAPI([[...lungOnly[0], age]]);
	await flush();
	const combined = h.query();
	assert.deepEqual(copy(ui.api.buttons()), { prev: false, next: true });
	ui.api.prev();
	await flush();
	assert.deepEqual(h.query(), lungOnly);
	ui.api.prev();
	await flush();
	assert.deepEqual(h.ast(), { operand: 'OR', children: [] }, 'index zero must not inject isTumor');
	assert.deepEqual(copy(ui.api.buttons()), { prev: true, next: false });
	ui.api.next();
	await flush();
	ui.api.next();
	await flush();
	assert.deepEqual(h.query(), combined, 'IDs, values, names and groups survive history traversal');
	assert.equal(get(ui.history).filterSaveArray.length, 3);
	assert.equal(get(ui.history).currentIndex, 2);
	ui.api.next();
	assert.equal(get(ui.history).currentIndex, 2);
	ui.dispose();
});

test('editing after undo truncates redo states and keeps snapshot arrays aligned', async () => {
	const h = createLensHarness();
	const ui = await mount(h);
	for (const value of ['m', 'w']) {
		ui.dataPasser.setQueryStoreAPI([[selectedRow('gender', 'patient', [value], value)]]);
		await flush();
	}
	ui.api.prev();
	await flush();
	ui.dataPasser.setQueryStoreAPI([[selectedRow('gender', 'patient', ['d'], 'd')]]);
	await flush();
	const history = get(ui.history);
	assert.equal(history.currentIndex, 2);
	assert.equal(history.filterSaveArray.length, 3);
	assert.equal(history.querySaveArray.length, 3);
	assert.equal(JSON.parse(history.querySaveArray[2])[0][0].values[0].value, 'd');
	assert.equal(
		history.filterSaveArray.some((ast) => ast.includes('"value":"w"')),
		false
	);
	ui.dispose();
});

test('remounting preserves history and removes listeners including queued old callbacks', async () => {
	const h = createLensHarness();
	const ui = await mount(h);
	ui.window.emit();
	ui.dispose();
	const before = copy(get(ui.history));
	h.dataPasser.setQueryStoreAPI([[selectedRow('gender', 'patient', ['m'], 'new')]]);
	await flush();
	assert.equal(ui.listeners.size, 0);
	assert.deepEqual(copy(get(ui.history)), before, 'disposed callback must not write stale history');
	const remounted = await mount(h, ui.history);
	assert.equal(remounted.listeners.size, 1);
	assert.equal(get(ui.history).currentIndex, 1);
	remounted.api.prev();
	await flush();
	assert.deepEqual(h.ast(), { operand: 'OR', children: [] });
	remounted.dispose();
});

test('clear retains the established tumor default and remains undoable', async () => {
	const initial = [[selectedRow('gender', 'patient', ['m'], 'gender')]];
	const h = createLensHarness({ initialQuery: initial });
	const ui = await mount(h);
	ui.api.clear();
	await flush();
	assert.equal(h.query()[0][0].key, 'isTumor');
	assert.equal(h.query()[0][0].values[0].value, 'true');
	ui.api.prev();
	await flush();
	assert.deepEqual(h.query(), initial);
	ui.dispose();
});

test('labels safely render numeric, boolean, null, string and range values as HTML', async () => {
	const ui = await mount(createLensHarness());
	for (const [value, expected] of [
		[42, '42'],
		[false, 'false'],
		[null, '-'],
		['<img>', '&lt;img&gt;']
	]) {
		assert.equal(ui.api.parseNode({ type: 'EQUALS', key: 'value', value }), expected);
	}
	assert.equal(
		ui.api.parseNode({ type: 'BETWEEN', key: 'value', value: { min: '<b>', max: '&' } }),
		'&lt;b&gt;<br>&amp;'
	);
	assert.equal(ui.api.parseNode({ type: 'BETWEEN', key: 'value', value: { min: 0, max: 0 } }), '0');
	ui.dispose();
});

test('events before the Lens element upgrades are ignored and the first ready query initializes history', async () => {
	const h = createLensHarness({
		initialQuery: [[selectedRow('gender', 'patient', ['m'], 'initial')]]
	});
	const ui = await mount(h, historyStore(), { deferredUpgrade: true });
	ui.window.emit();
	ui.api.prev();
	ui.api.clear();
	await flush();
	assert.equal(get(ui.history).filterSaveArray.length, 1);
	assert.equal(h.reloads.length, 0);
	ui.upgrade();
	await flush();
	assert.deepEqual(copy(ui.api.ast()), h.ast());
	assert.equal(get(ui.history).filterSaveArray.length, 2);
	assert.equal(get(ui.history).currentIndex, 1);
	ui.dispose();
});

test('uploading an exported empty AST uses a valid empty Lens query and remains undoable', async () => {
	const initial = [[selectedRow('gender', 'patient', ['m'], 'gender')]];
	const h = createLensHarness({ initialQuery: initial });
	const ui = await mount(h);
	ui.api.upload({ target: { files: [{ text: JSON.stringify({ operand: 'OR', children: [] }) }] } });
	await flush();
	assert.deepEqual(h.query(), [[]]);
	assert.deepEqual(h.ast(), { operand: 'OR', children: [] });
	assert.equal(h.reloads.length, 1);
	ui.api.prev();
	await flush();
	assert.deepEqual(h.query(), initial);
	ui.dispose();
});
