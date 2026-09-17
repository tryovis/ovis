import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { runFilterLockMatrix } from './filterLockMatrix.mjs';

const require = createRequire(import.meta.url);
const { MongoClient } = require('mongodb');
const address = process.env.OVIS_SIMULATION_MONGO;
assert.equal(new URL(address).hostname, 'ovis-filter-simulation-mongo-20260916');
const database = process.env.OVIS_LOCK_DB;
assert.ok(database?.startsWith('synthetic_filterlock_matrix_'));
assert.ok(process.env.OVIS_LOCK_REPORT);
const client = new MongoClient(address, { serverSelectionTimeoutMS: 15000 });
await client.connect();
const log = console.log,
	dir = console.dir;
try {
	console.log = () => {};
	console.dir = () => {};
	const result = await runFilterLockMatrix({
		db: client.db(database),
		onProgress: (progress) => log(JSON.stringify(progress))
	});
	await writeFile(process.env.OVIS_LOCK_REPORT, `${JSON.stringify(result, null, 2)}\n`);
	log(
		JSON.stringify({ cases: result.cases, passed: result.passed, failures: result.failures.length })
	);
	if (result.failures.length) process.exitCode = 1;
} finally {
	console.log = log;
	console.dir = dir;
	await client.close();
}
