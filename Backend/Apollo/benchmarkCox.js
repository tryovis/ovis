// Local synthetic benchmark. Creates and removes only its own randomly named database.
// node --expose-gc benchmarkCox.js [patients] [path-to-previous-coxData.js]
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MongoClient } = require('mongodb');
const { loadCoxDataset } = require('./resolver/coxData');
const { createCoxDeadline } = require('./resolver/coxDeadline');
const { createRuntimeIndexes } = require('./runtimeIndexes');

const count = Number(process.argv[2] ?? 100_000);
assert.ok(Number.isSafeInteger(count) && count > 0);
const previous = process.argv[3] ? require(require('node:path').resolve(process.argv[3])) : null;
const collections = {
	diagnosis: 'diagnosis',
	kaplanmeier: 'kaplanMeier',
	tnm: 'tnm',
	histology: 'histology',
	status: 'status',
	usageEvent: 'usageEvent'
};
const databaseName = `ovis_cox_benchmark_${randomUUID().replaceAll('-', '')}`;
const client = new MongoClient(
	process.env.ADDRESS || 'mongodb://ovis-backend-database-mongodb:27017'
);

async function main() {
	await client.connect();
	const db = client.db(databaseName);
	assert.equal(await db.listCollections().hasNext(), false);
	try {
		const day = 86400000;
		for (let start = 0; start < count; start += 2000) {
			const docs = Object.fromEntries(Object.values(collections).map((name) => [name, []]));
			for (let i = start; i < Math.min(count, start + 2000); i++) {
				const tumorID = `tumour-${i}`;
				const diagnosisDate = new Date(Date.UTC(2000 + (i % 25), 0, 1));
				docs.diagnosis.push({
					patID: `patient-${i}`,
					tumorID,
					diagnosisDate,
					ageAtDiagnosis: 30 + (i % 60),
					gender: i % 2 ? 'm' : 'w',
					metastasis: i % 7 ? 'none' : 'synchron'
				});
				docs.kaplanMeier.push({
					tumorID,
					vitalDate: new Date(+diagnosisDate + (30 + (i % 4000)) * day),
					vitalState: i % 3 ? 1 : 0
				});
				for (let j = 0; j < 3; j++) {
					const date = new Date(+diagnosisDate + (j + 1) * day);
					docs.tnm.push({
						tumorID,
						type: j ? 'pathological' : 'clinical',
						T: `T${1 + (i % 4)}`,
						N: `N${i % 4}`,
						M: `M${i % 2}`,
						UICC: ['I', 'II', 'III', 'IV'][i % 4],
						tnmOccurrenceDate: date
					});
					docs.histology.push({
						tumorID,
						ICDO_grading: String(1 + (i % 3)),
						ICDO_histologyDate: date
					});
					docs.status.push({
						tumorID,
						type: 'ECOG',
						status: String(i % 4),
						statusOccurrenceDate: date
					});
				}
			}
			await Promise.all(
				Object.entries(docs)
					.filter(([, rows]) => rows.length)
					.map(([name, rows]) => db.collection(name).insertMany(rows))
			);
		}
		console.log(JSON.stringify({ patients: count, stage: 'synthetic-data-ready' }));
		const expected = new Map();
		const timings = [];
		if (previous) {
			for (const covariate of ['age', 'uicc', 'ecog']) {
				global.gc?.();
				const start = performance.now();
				const result = await previous.loadCoxDataset(db, collections);
				timings.push({
					mode: 'before',
					covariate,
					milliseconds: Math.round(performance.now() - start)
				});
				expected.set(covariate, {
					rows: result.rows.map((row) => ({
						time: row.time,
						event: row.event,
						[covariate]: row[covariate]
					})),
					exclusions: result.exclusions
				});
			}
		}
		await createRuntimeIndexes(db, collections);
		for (const covariate of ['age', 'uicc', 'ecog']) {
			global.gc?.();
			const start = performance.now();
			const result = await loadCoxDataset(
				db,
				collections,
				[],
				undefined,
				[covariate],
				createCoxDeadline()
			);
			timings.push({
				mode: 'after',
				covariate,
				milliseconds: Math.round(performance.now() - start)
			});
			assert.equal(result.rows.length, count);
			assert.equal(result.indexPatients, count);
			assert.equal(result.matchingDiagnoses, count);
			if (previous) {
				// MongoDB $group output order is unspecified, so compare the observation multiset.
				const sorted = (rows) => rows.map((row) => JSON.stringify(row)).sort();
				assert.deepEqual(sorted(result.rows), sorted(expected.get(covariate).rows));
				assert.deepEqual(result.exclusions, expected.get(covariate).exclusions);
			}
		}
		const explain = await db
			.collection('kaplanMeier')
			.find({ tumorID: { $in: ['tumour-1', 'tumour-2'] } })
			.explain('executionStats');
		assert.ok(explain.executionStats.totalDocsExamined <= 2);
		console.log(
			JSON.stringify(
				{
					patients: count,
					timings,
					identicalObservations: Boolean(previous),
					indexedLookupDocumentsExamined: explain.executionStats.totalDocsExamined
				},
				null,
				2
			)
		);
	} finally {
		assert.match(databaseName, /^ovis_cox_benchmark_[a-f0-9]{32}$/);
		await db.dropDatabase();
		await client.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
