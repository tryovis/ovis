import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const component = fs.readFileSync(new URL('./+layout.svelte', import.meta.url), 'utf8');
const script = component.match(/<script lang="ts">([\s\S]*?)<\/script>/)[1];
const parsed = ts.createSourceFile('layout.ts', script, ts.ScriptTarget.Latest, true);
const edits = parsed.statements
	.filter((statement) => ts.isImportDeclaration(statement) ||
		(ts.isLabeledStatement(statement) && statement.label.text === '$'))
	.map((statement) => ({ start: statement.getStart(parsed), end: statement.end }));
let testScript = script;
for (const { start, end } of edits.reverse()) {
	testScript = testScript.slice(0, start) + testScript.slice(end);
}
const executable = ts.transpileModule(testScript, {
	compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;

function createStore(initialValue) {
	let value = initialValue;
	const subscribers = new Set();
	return {
		get value() { return value; },
		subscribe(callback) {
			subscribers.add(callback);
			callback(value);
			return () => subscribers.delete(callback);
		},
		set(nextValue) {
			value = nextValue;
			return Promise.all([...subscribers].map((callback) => callback(value)));
		}
	};
}

// Run the complete component script, keeping its mount, auth and polling logic.
// Only external stores, browser APIs and requests are stubbed.
function createHarness(fetchMetadata, { authenticated = false } = {}) {
	const authStore = createStore(authenticated);
	const intervals = new Map();
	const mounts = [];
	const errors = [];
	const calls = [];
	const noop = () => {};
	let timerId = 0;
	const context = vm.createContext({
		onMount: (callback) => mounts.push(callback),
		onDestroy: noop,
		authStore,
		// A demo session skips unrelated profile loading and session timers.
		userStore: createStore({ currentUser: null, currentRole: 'demo' }),
		get: (store) => store.value,
		datePickerStore: createStore({ show: false }),
		numberPickerStore: createStore({ show: false }),
		TNMPickerStore: createStore({ show: false }),
		filterActiveStore: createStore({ filterActive: true }),
		env: {},
		iconPath: (path) => path,
		apiPath: (path) => path,
		initChartThemeSync: () => noop,
		loadPlatformConfiguration: async () => {},
		tokenService: { initializeTokenValidation: async () => {} },
		getLastMetaData: () => {
			calls.push({ authenticated: authStore.value });
			return fetchMetadata();
		},
		authenticatedFetch: async () => ({
			ok: true,
			json: async () => ({ data: [], revision: 'test', source: 'test', size: 0 })
		}),
		window: {
			innerWidth: 1280,
			innerHeight: 800,
			screen: { width: 1280, height: 800 },
			matchMedia: () => ({ matches: false }),
			addEventListener: noop
		},
		document: {
			documentElement: { dataset: {}, style: { setProperty: noop } },
			body: { classList: { contains: () => false } },
			querySelector: () => null,
			addEventListener: noop
		},
		setInterval: (callback, milliseconds) => {
			const id = ++timerId;
			intervals.set(id, { callback, milliseconds });
			return id;
		},
		clearInterval: (id) => intervals.delete(id),
		console: { log: noop, warn: noop, error: (...args) => errors.push(args) }
	});
	vm.runInContext(`${executable}\n globalThis.readLastUpdate = () => lastUpdate;`, context);
	return {
		calls,
		errors,
		lastUpdate: () => context.readLastUpdate(),
		mount: () => Promise.all(mounts.map((callback) => callback())),
		authenticate: (value) => authStore.set(value),
		poll: () => Promise.all([...intervals.values()]
			.filter(({ milliseconds }) => milliseconds === 30000)
			.map(({ callback }) => callback()))
	};
}

const metadata = { executedAt: '2026-09-30T13:45:00' };
const formattedDate = '30.09.2026, 13:45';

test('logged-out mount and polling do not request metadata; login loads the formatted date', async () => {
	const harness = createHarness(async () => metadata);
	await harness.mount();
	await harness.poll();
	assert.equal(harness.calls.length, 0);
	assert.equal(harness.lastUpdate(), null);

	await harness.authenticate(true);
	assert.equal(harness.calls.length, 1);
	assert.equal(harness.calls[0].authenticated, true);
	assert.equal(harness.lastUpdate(), formattedDate);
});

test('a restored authenticated session loads the date on mount and clears it on logout', async () => {
	const harness = createHarness(async () => metadata, { authenticated: true });
	await harness.mount();
	assert.equal(harness.calls.length, 1);
	assert.equal(harness.lastUpdate(), formattedDate);

	await harness.authenticate(false);
	assert.equal(harness.lastUpdate(), null);
	await harness.poll();
	assert.equal(harness.calls.length, 1);
});

test('a metadata response arriving after logout cannot restore the date', async () => {
	let resolveMetadata;
	const harness = createHarness(() => new Promise((resolve) => { resolveMetadata = resolve; }));
	await harness.mount();
	const login = harness.authenticate(true);
	await harness.authenticate(false);
	resolveMetadata(metadata);
	await login;
	assert.equal(harness.lastUpdate(), null);
});

test('an old response cannot overwrite the date after logout and a new login', async () => {
	let resolveOldMetadata;
	let requests = 0;
	const harness = createHarness(() => ++requests === 1
		? new Promise((resolve) => { resolveOldMetadata = resolve; })
		: Promise.resolve(metadata));
	await harness.mount();
	const oldLogin = harness.authenticate(true);
	await harness.authenticate(false);
	await harness.authenticate(true);
	assert.equal(harness.lastUpdate(), formattedDate);

	resolveOldMetadata({ executedAt: '2025-01-01T09:00:00' });
	await oldLogin;
	assert.equal(harness.calls.length, 2);
	assert.equal(harness.lastUpdate(), formattedDate);
});

for (const firstResult of ['missing', 'failed', 'invalid']) {
	test(`polling recovers an initially ${firstResult} metadata response`, async () => {
		let attempts = 0;
		const harness = createHarness(async () => {
			if (++attempts > 1) return metadata;
			if (firstResult === 'failed') throw new Error('Temporary metadata failure');
			if (firstResult === 'invalid') return { executedAt: 'not-a-date' };
			return null;
		}, { authenticated: true });
		await harness.mount();
		assert.equal(harness.lastUpdate(), null);
		assert.equal(harness.errors.length, firstResult === 'failed' ? 1 : 0);

		await harness.poll();
		assert.equal(harness.calls.length, 2);
		assert.equal(harness.lastUpdate(), formattedDate);
	});
}
