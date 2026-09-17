import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
	calculateRawOmockMetrics,
	normalizeLabelCountMetric,
	normalizeTumorYearGenderMetric
} from './omockMetricReference.mjs';
import { appendRawEdgeFixtures, rawFilterCases, selectRawIds } from './rawOmockCases.mjs';

const require = createRequire(import.meta.url);
const { createAccessControl } = require('../accessControl.js');
const { filter2match } = require('../astTranslator.js');
const patientResolvers = require('../resolver/patient.js');
const diagnosisResolvers = require('../resolver/diagnosis.js');
const tumorResolvers = require('../resolver/tumor.js');
const generalResolvers = require('../resolver/resolver.js');

export async function runRawOmockVerification({ db, raw, onProgress = () => {} }) {
	assert.ok(
		db.databaseName.startsWith('ovis_ast_diff_raw_'),
		'Dedicated raw verification DB required'
	);
	const control = createAccessControl({ env: { OVIS_IMPORT_MODE: 'credos' } });
	const queries = {
		getRawVerificationRows: async (_parent, { collection, filter }) => {
			const pipeline = filter ? await filter2match({ value: filter, column: collection, db }) : [];
			return db
				.collection(collection)
				.aggregate([...pipeline, { $project: { _id: 0, patID: 1, tumorID: 1 } }])
				.toArray();
		},
		getQuicktoolsCountOverview: generalResolvers.Query.getQuicktoolsCountOverview,
		getPatientCohortGenderChart: patientResolvers.Query.getPatientCohortGenderChart,
		getPatientCohortDeathChart: patientResolvers.Query.getPatientCohortDeathChart,
		getPatientCohortAgeChart: diagnosisResolvers.Query.getPatientCohortAgeChart,
		getTumors: tumorResolvers.Query.getTumors
	};
	const guarded = control.protectResolvers([{ Query: queries }])[0].Query;
	const collections = Object.fromEntries(
		['patient', 'diagnosis', 'therapy', 'progress', 'histology'].map((key) => [key, key])
	);
	const cases = rawFilterCases();
	const results = [],
		failures = [];
	let comparisons = 0;
	const originalLog = console.log,
		originalDir = console.dir;
	console.log = () => {};
	console.dir = () => {};
	try {
		for (const [index, testCase] of cases.entries()) {
			const ids = selectRawIds(raw, testCase.effective);
			const unscoped = !testCase.lock.ast && !testCase.request.ast;
			const expected = calculateRawOmockMetrics(raw, unscoped ? {} : ids);
			const context = {
				db,
				collections,
				security: {
					anonymous: false,
					userId: 'synthetic-raw-verifier',
					role: testCase.lock.ast ? 'user' : 'admin',
					user: {
						_id: 'synthetic-raw-verifier',
						role: testCase.lock.ast ? 'user' : 'admin',
						status: 'active',
						userFilter: testCase.lock.ast ? [JSON.stringify(testCase.lock.ast)] : []
					}
				}
			};
			const call = (name, extra = {}) =>
				guarded[name](
					null,
					{
						...extra,
						...(testCase.request.ast ? { filter: JSON.stringify(testCase.request.ast) } : {})
					},
					context,
					{ parentType: { getFields: () => ({ [name]: { args: [{ name: 'filter' }] } }) } }
				);
			let caseFailures = 0;
			const compare = (metric, actual, wanted) => {
				comparisons++;
				try {
					assert.deepEqual(actual, wanted);
				} catch {
					caseFailures++;
					failures.push({
						case: testCase.name,
						metric,
						lock: testCase.lock.ast,
						request: testCase.request.ast,
						expected: Array.isArray(wanted) ? wanted.slice(0, 18) : wanted,
						actual: Array.isArray(actual) ? actual.slice(0, 18) : actual,
						expectedLength: Array.isArray(wanted) ? wanted.length : undefined,
						actualLength: Array.isArray(actual) ? actual.length : undefined
					});
				}
			};
			try {
				const actualTumors = await call('getRawVerificationRows', { collection: 'diagnosis' });
				compare('exact-tumor-ids', actualTumors.map((row) => row.tumorID).sort(), ids.tumorIds);
				const actualPatients = await call('getRawVerificationRows', { collection: 'patient' });
				compare('exact-patient-ids', actualPatients.map((row) => row.patID).sort(), ids.patientIds);
				const countNames = ['patient', 'diagnosis', 'therapy', 'progress'];
				const counts = await call('getQuicktoolsCountOverview', { collection: countNames });
				compare(
					'collection-counts',
					Object.fromEntries(countNames.map((name, i) => [name, counts[i]?.count ?? 0])),
					Object.fromEntries(countNames.map((name) => [name, expected.counts[name]]))
				);
				compare(
					'patient-gender',
					normalizeLabelCountMetric(await call('getPatientCohortGenderChart')),
					expected.patientGender
				);
				compare(
					'patient-vital-state',
					normalizeLabelCountMetric(await call('getPatientCohortDeathChart')),
					expected.patientVitalState
				);
				const ages = (await call('getPatientCohortAgeChart'))
					.map(({ ageAtDiagnosis, count }) => ({ value: ageAtDiagnosis, count }))
					.sort((a, b) => JSON.stringify(a.value).localeCompare(JSON.stringify(b.value), 'en'));
				compare('diagnosis-age', ages, expected.diagnosisAge);
				compare(
					'icd3-year-gender',
					normalizeTumorYearGenderMetric(
						await call('getTumors', {
							groupedBy: { group: 'ICD_ICD10_3', abscissa: 'years', genderWise: true }
						})
					),
					expected.diagnosisIcd3YearGender
				);
			} catch (error) {
				caseFailures++;
				failures.push({ case: testCase.name, error: error.stack });
			}
			results.push({
				name: testCase.name,
				passed: caseFailures === 0,
				failures: caseFailures,
				expectedCounts: { patient: expected.counts.patient, diagnosis: expected.counts.diagnosis }
			});
			if ((index + 1) % 25 === 0)
				onProgress(`${index + 1}/${cases.length} cases; ${failures.length} failed comparisons`);
		}
	} finally {
		console.log = originalLog;
		console.dir = originalDir;
	}
	return {
		generatedAt: new Date().toISOString(),
		summary: {
			cases: results.length,
			passed: results.filter((c) => c.passed).length,
			failed: results.filter((c) => !c.passed).length,
			comparisons,
			failedComparisons: failures.length
		},
		inputCounts: Object.fromEntries(
			Object.entries(raw)
				.filter(([, value]) => Array.isArray(value))
				.map(([key, value]) => [key, value.length])
		),
		baseline: calculateRawOmockMetrics(raw),
		results,
		failures,
		notes: [
			'Expectations read only the original OMock JSON and direct predicate functions.',
			'Actual results use server-enforced filter assignments, production resolvers and MongoDB.',
			'Exact IDs and distributions are checked; total-count agreement alone is insufficient.',
			'This suite does not verify survival estimators, Cox regression or every derived clinical indicator.'
		]
	};
}

async function main() {
	if (process.argv[2] === '--prepare') {
		const [sourcePath, outputPath] = process.argv.slice(3);
		assert.ok(sourcePath && outputPath, 'Provide source and output paths');
		const source = JSON.parse(await readFile(sourcePath, 'utf8'));
		const raw = appendRawEdgeFixtures(source);
		await writeFile(outputPath, `${JSON.stringify(raw)}\n`);
		console.log(
			`Prepared ${raw.patient.length} synthetic demo patients, ${raw.diagnosis.length} diagnoses`
		);
		return;
	}
	const address = process.env.OVIS_SIMULATION_MONGO;
	assert.equal(
		new URL(address).hostname,
		'ovis-filter-simulation-mongo-20260916',
		'Only dedicated internal test Mongo allowed'
	);
	const database = process.env.OVIS_RAW_DB;
	assert.ok(database?.startsWith('ovis_ast_diff_raw_'));
	const sourceText = await readFile(process.env.OVIS_RAW_FILE, 'utf8');
	const { MongoClient } = require('mongodb');
	const client = new MongoClient(address, { serverSelectionTimeoutMS: 15000 });
	await client.connect();
	try {
		const log = console.log;
		const report = await runRawOmockVerification({
			db: client.db(database),
			raw: JSON.parse(sourceText),
			onProgress: log
		});
		report.sourceSha256 = createHash('sha256').update(sourceText).digest('hex');
		await writeFile(process.env.OVIS_RAW_REPORT, `${JSON.stringify(report, null, 2)}\n`);
		console.log(JSON.stringify(report.summary));
		if (report.summary.failed) process.exitCode = 1;
	} finally {
		await client.close();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
	await main();
