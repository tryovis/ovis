import assert from 'node:assert/strict';
import { createCachedRequest } from './request-cache.js';

const calls = [];
const cachedRequest = createCachedRequest((key, value) => {
	calls.push({ key, value });
	return Promise.resolve({ key, value });
});

const first = await cachedRequest('diagnosis:years', 1);
const second = await cachedRequest('diagnosis:years', 2);
const third = await cachedRequest('diagnosis:months', 3);

assert.deepEqual(first, { key: 'diagnosis:years', value: 1 });
assert.equal(second, first);
assert.deepEqual(third, { key: 'diagnosis:months', value: 3 });
assert.deepEqual(calls, [
	{ key: 'diagnosis:years', value: 1 },
	{ key: 'diagnosis:months', value: 3 }
]);
