import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Explicitly opt in: exercises the real importer against isolated MongoDB databases.
// OVIS_IMPORT_INTEGRATION_TEST=1 node --test Preprocessing/preprocessor.startup.integration.test.mjs
const enabled = process.env.OVIS_IMPORT_INTEGRATION_TEST === '1';
const here = path.dirname(fileURLToPath(import.meta.url));
const mongoRoot = path.resolve(here, '..');
const repoRoot = path.resolve(mongoRoot, '../..');
const execute = promisify(execFile);
const affected = ['diagnosis', 'histology', 'tnm', 'kaplanMeier', 'status'];
const collections = {
	usageEvent: 'usageEvent',
	diagnosis: 'diagnosis',
	kaplanmeier: 'kaplanMeier',
	tnm: 'tnm',
	histology: 'histology',
	status: 'status'
};

function digest(documents, includeIds = false) {
	const serialized = documents
		.map(({ _id, ...document }) => JSON.stringify(includeIds ? { _id, ...document } : document))
		.sort();
	return createHash('sha256').update(JSON.stringify(serialized)).digest('hex');
}

test(
	'real import handles API-first startup, empty indexed collections and repeated runs',
	{
		skip: !enabled,
		timeout: 240_000
	},
	async (t) => {
		const require = createRequire(import.meta.url);
		const { MongoClient } = require('mongodb');
		const { createRuntimeIndexes } = require(path.join(
			repoRoot,
			'Backend/Apollo/runtimeIndexes.js'
		));
		const client = await MongoClient.connect(process.env.ADDRESS || 'mongodb://localhost:27017');
		const prefix = `ovis_import_test_${randomUUID().replaceAll('-', '')}`;
		const databases = [client.db(`${prefix}_fresh`), client.db(`${prefix}_recovery`)];
		const directory = await mkdtemp(path.join(tmpdir(), 'ovis-import-regression-'));
		await mkdir(path.join(directory, 'Preprocessing'));
		await copyFile(
			path.join(repoRoot, 'Backend/Data-Import/demo/omock.json'),
			path.join(directory, 'Preprocessing/omock.json')
		);
		const runImporter = async (database, source = path.join(here, 'preprocessor.mjs')) => {
			try {
				await execute(process.execPath, [source], {
					cwd: directory,
					env: { ...process.env, DB: database.databaseName, oncName: database.databaseName },
					timeout: 90_000,
					maxBuffer: 4 * 1024 * 1024
				});
			} catch (error) {
				throw new Error(`Importer failed: ${error.message}\n${error.stderr || ''}`);
			}
		};
		try {
			for (const db of databases) assert.equal(await db.listCollections().hasNext(), false);
			const [fresh, recovery] = databases;
			await createRuntimeIndexes(fresh, collections);
			for (const name of affected) {
				assert.equal(await fresh.listCollections({ name }).hasNext(), false, name);
			}
			await runImporter(fresh);
			const names = (await fresh.listCollections({}, { nameOnly: true }).toArray())
				.map(({ name }) => name)
				.filter((name) => !['metaData', 'usageEvent'].includes(name));
			const baseline = new Map();
			for (const name of names) baseline.set(name, await fresh.collection(name).find({}).toArray());
			for (const name of affected) {
				assert.ok(baseline.get(name)?.length > 0, `${name} imported`);
				const indexes = await fresh.collection(name).indexes();
				assert.ok(
					indexes.some(({ key }) => key.tumorID === 1),
					`${name} indexed`
				);
			}
			t.diagnostic(
				`Fresh import counts: ${JSON.stringify(
					Object.fromEntries(affected.map((name) => [name, baseline.get(name).length]))
				)}`
			);

			// Reproduce the old API's empty placeholders before an import.
			for (const name of affected) await recovery.collection(name).createIndex({ tumorID: 1 });
			if (process.env.OVIS_IMPORT_LEGACY_PREPROCESSOR) {
				await runImporter(recovery, process.env.OVIS_IMPORT_LEGACY_PREPROCESSOR);
				for (const name of affected)
					assert.equal(await recovery.collection(name).countDocuments({}), 0);
				t.diagnostic('Previous importer reproduced all five empty collections');
			} else {
				for (const [name, documents] of baseline) {
					if (!affected.includes(name) && documents.length) {
						await recovery.collection(name).insertMany(documents);
					}
				}
			}
			await recovery.collection('user').insertOne({ _id: 'regression-user', untouched: true });
			const retained = new Map();
			for (const name of [...names.filter((name) => !affected.includes(name)), 'user']) {
				retained.set(name, digest(await recovery.collection(name).find({}).toArray(), true));
			}
			await createRuntimeIndexes(recovery, collections);
			await runImporter(recovery);
			for (const name of affected) {
				const documents = await recovery.collection(name).find({}).toArray();
				assert.equal(documents.length, baseline.get(name).length, `${name} recovered count`);
				assert.equal(digest(documents), digest(baseline.get(name)), `${name} recovered contents`);
			}
			for (const [name, hash] of retained) {
				assert.equal(
					digest(await recovery.collection(name).find({}).toArray(), true),
					hash,
					`${name} preserved`
				);
			}
			t.diagnostic(
				'Recovered collections match a clean import; previously populated collections and user are unchanged'
			);
			const { Query: sharedQueries } = require(path.join(
				repoRoot,
				'Backend/Apollo/resolver/resolver.js'
			));
			const { Query: diagnosisQueries } = require(path.join(
				repoRoot,
				'Backend/Apollo/resolver/diagnosis.js'
			));
			const context = {
				db: recovery,
				collections: { ...Object.fromEntries(names.map((name) => [name, name])), ...collections }
			};
			const overview = await sharedQueries.getQuicktoolsCountOverview(
				null,
				{
					collection: ['patient', 'diagnosis', 'therapy', 'progress']
				},
				context
			);
			for (const { collection, count } of overview)
				assert.equal(count, baseline.get(collection).length);
			const ages = await diagnosisQueries.getPatientCohortAgeChart(null, {}, context);
			assert.ok(ages.length > 0, 'diagnosis age chart has data');
			const histologies = await diagnosisQueries.getDiagnosisHistologyTable(
				null,
				{ limit: 10 },
				context
			);
			const tnm = await sharedQueries.getTnmMetastases(null, { limit: 10 }, context);
			assert.equal(histologies.length, 10, 'histology table has data');
			assert.equal(tnm.length, 10, 'TNM table has data');
			t.diagnostic(
				'Real sidebar count, diagnosis-age, histology and TNM resolvers return recovered data'
			);
			const beforeRepeat = new Map();
			for (const name of [...names, 'user'])
				beforeRepeat.set(name, digest(await recovery.collection(name).find({}).toArray(), true));
			await runImporter(recovery);
			for (const [name, hash] of beforeRepeat) {
				assert.equal(
					digest(await recovery.collection(name).find({}).toArray(), true),
					hash,
					`${name} no duplicates or replacements`
				);
			}
			t.diagnostic('Repeated import preserves document contents, IDs and counts');
		} finally {
			try {
				for (const db of databases) {
					assert.ok(new RegExp(`^${prefix}_(fresh|recovery)$`).test(db.databaseName));
					await db.dropDatabase();
				}
			} finally {
				await client.close();
				assert.equal(path.dirname(directory), tmpdir());
				assert.ok(path.basename(directory).startsWith('ovis-import-regression-'));
				await rm(directory, { recursive: true, force: true });
			}
		}
	}
);
