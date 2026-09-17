import assert from 'node:assert/strict';
import test from 'node:test';
import { createFilterEditorOptions } from './filterEditorOptions.js';

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

test('requests are lazy and concurrent positive/negative fields share one request', async () => {
	const response = deferred();
	const calls = [];
	const changes = [];
	const options = createFilterEditorOptions(
		(...field) => {
			calls.push(field);
			return response.promise;
		},
		{ onChange: (...change) => changes.push(change) }
	);
	assert.deepEqual(calls, []);
	assert.equal(options.get('gender', 'patient'), undefined);
	assert.deepEqual(options.suggestions('gender', 'patient'), []);
	const first = options.load('gender', 'patient');
	const second = options.load('!gender', 'patient');
	assert.equal(first, second);
	await Promise.resolve();
	assert.deepEqual(calls, [['gender', 'patient']]);
	response.resolve(['m', 'w', '']);
	assert.deepEqual(await first, ['m', 'w', '']);
	assert.deepEqual(await second, ['m', 'w', '']);
	assert.deepEqual(await options.load('!gender', 'patient'), ['m', 'w', '']);
	assert.equal(calls.length, 1);
	assert.deepEqual(changes, [['gender', 'patient', ['m', 'w', '']]]);
});

test('same key in different collections and delimiter-like names stay separate', async () => {
	const options = createFilterEditorOptions(async (key, system) => [JSON.stringify([key, system])]);
	for (const [key, system] of [
		['gender', 'patient'],
		['gender', 'diagnosis'],
		['a(b', 'c'],
		['a', 'b(c']
	]) {
		await options.load(key, system);
		assert.deepEqual(options.get(key, system), [JSON.stringify([key, system])]);
	}
	assert.notDeepEqual(options.get('gender', 'patient'), options.get('gender', 'diagnosis'));
});

test('successful empty lists are cached without requesting them again', async () => {
	let calls = 0;
	const options = createFilterEditorOptions(async () => {
		calls++;
		return [];
	});
	assert.equal(options.get('missing', 'diagnosis'), undefined);
	assert.deepEqual(await options.load('missing', 'diagnosis'), []);
	assert.deepEqual(options.get('missing', 'diagnosis'), []);
	assert.deepEqual(await options.load('!missing', 'diagnosis'), []);
	assert.equal(calls, 1);
});

test('late responses after disposal cannot populate the cache or call onChange', async () => {
	const response = deferred();
	let calls = 0;
	let changes = 0;
	const options = createFilterEditorOptions(
		() => {
			calls++;
			return response.promise;
		},
		{
			onChange: () => {
				changes++;
			}
		}
	);
	const request = options.load('gender', 'patient');
	await Promise.resolve();
	options.dispose();
	response.resolve(['m', 'w']);
	assert.deepEqual(await request, []);
	assert.equal(options.get('gender', 'patient'), undefined);
	assert.deepEqual(await options.load('gender', 'patient'), []);
	assert.deepEqual(options.suggestions('gender', 'patient'), []);
	assert.equal(calls, 1);
	assert.equal(changes, 0);
	options.dispose();
});

test('disposal before a queued request starts prevents loading and clears cached values', async () => {
	let calls = 0;
	const options = createFilterEditorOptions(async () => {
		calls++;
		return ['m'];
	});
	await options.load('gender', 'patient');
	const request = options.load('status', 'therapy');
	options.dispose();
	assert.deepEqual(await request, []);
	assert.equal(options.get('gender', 'patient'), undefined);
	assert.equal(calls, 1);
});

test('failed requests are handled and retryable, including synchronous loader errors', async () => {
	let calls = 0;
	const options = createFilterEditorOptions(() => {
		calls++;
		if (calls === 1) return Promise.reject(new Error('temporarily unavailable'));
		if (calls === 2) throw new Error('sync failure');
		return Promise.resolve(['m', 'w']);
	});
	assert.deepEqual(await options.load('gender', 'patient'), []);
	assert.equal(options.get('gender', 'patient'), undefined);
	assert.deepEqual(await options.load('gender', 'patient'), []);
	assert.equal(options.get('gender', 'patient'), undefined);
	assert.deepEqual(await options.load('gender', 'patient'), ['m', 'w']);
	assert.equal(calls, 3);
});

test('malformed loader responses stay retryable and non-string entries are ignored', async () => {
	let calls = 0;
	const options = createFilterEditorOptions(async () =>
		++calls === 1 ? null : ['m', null, '', undefined]
	);
	assert.deepEqual(await options.load('gender', 'patient'), []);
	assert.equal(options.get('gender', 'patient'), undefined);
	assert.deepEqual(await options.load('gender', 'patient'), ['m', '']);
});

test('suggestions are bounded, case insensitive, and find values beyond the first page', async () => {
	const values = Array.from({ length: 50000 }, (_, i) => `Patient-${i}`);
	values.push('MixedCase-Target', 'SECOND target', 'third TARGET', 'fourth target');
	const options = createFilterEditorOptions(async () => values, { maxSuggestions: 3 });
	await options.load('patID', 'patient');
	assert.deepEqual(options.suggestions('patID', 'patient'), values.slice(0, 3));
	assert.deepEqual(options.suggestions('!patID', 'patient', 'tArGeT'), [
		'MixedCase-Target',
		'SECOND target',
		'third TARGET'
	]);
	assert.deepEqual(options.suggestions('patID', 'patient', 'absent'), []);
	assert.equal(options.get('patID', 'patient').length, 50004);
	assert.equal(values.length, 50004);
});

test('default suggestion limit is 200 and limits never truncate cached values', async () => {
	const values = Array.from({ length: 250 }, (_, i) => String(i));
	const options = createFilterEditorOptions(async () => values);
	await options.load('patID', 'patient');
	assert.equal(options.suggestions('patID', 'patient').length, 200);
	assert.deepEqual(options.get('patID', 'patient'), values);
	const noSuggestions = createFilterEditorOptions(async () => values, { maxSuggestions: 0 });
	await noSuggestions.load('patID', 'patient');
	assert.deepEqual(noSuggestions.suggestions('patID', 'patient'), []);
});

test('empty field identities do not issue requests', async () => {
	let calls = 0;
	const options = createFilterEditorOptions(async () => {
		calls++;
		return [];
	});
	await options.load('', 'patient');
	await options.load('!', 'patient');
	await options.load('gender', '');
	assert.equal(calls, 0);
});
