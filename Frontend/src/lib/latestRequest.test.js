import assert from 'node:assert/strict';
import test from 'node:test';

import { createLatestRequest } from './latestRequest.js';

test('only the most recently started request may update component state', () => {
	const requests = createLatestRequest();
	const first = requests.start();
	const second = requests.start();

	assert.equal(requests.isCurrent(first), false);
	assert.equal(requests.isCurrent(second), true);
});

test('invalidating a request guard rejects pending responses after unmount', () => {
	const requests = createLatestRequest();
	const pending = requests.start();

	requests.invalidate();

	assert.equal(requests.isCurrent(pending), false);
});
