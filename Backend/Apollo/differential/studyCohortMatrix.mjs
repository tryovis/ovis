import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { createAccessControl } = require('../accessControl');
const { filter2match } = require('../astTranslator');
const resolvers = require('../resolver/resolver').Query;
const group = (operand, ...children) => ({ operand, children });
const leaf = (system, key, value, type = 'EQUALS') => ({ system, key, value, type });
const field = (...args) => group('OR', leaf(...args));
const sorted = (values) => [...values].sort();

/** Hand-calculated participation identities; no AST oracle or production IDs
 * are used to calculate expectations. Every call uses the real access wrapper. */
export async function runStudyCohortMatrix({ db }) {
	assert.ok(db.databaseName.startsWith('synthetic_study_cohort_'));
	assert.equal((await db.listCollections().toArray()).length, 0, 'Fresh test DB required');
	const patients = [
		['p1', 'm', '2025-06-01', ['p1-lung', 'p1-other']],
		['p2', 'm', '2025-06-01', ['p2-lung']],
		['split', 'm', '2025-06-01', ['split-lung', 'split-other']],
		['date-excluded', 'm', '2024-06-01', ['date-lung']],
		['female', 'w', '2025-06-01', ['female-lung']],
		['no-tumor', 'm', '2025-06-01', []]
	].map(([patID, gender, vitalDate, tumorID]) => ({
		patID,
		gender,
		vitalDate: new Date(vitalDate),
		tumorID
	}));
	const diagnosis = patients.flatMap(({ patID, tumorID }) =>
		tumorID.map((id) => ({
			patID,
			tumorID: id,
			ICD: {
				ICD10_3: id.endsWith('other') ? 'C50' : 'C34',
				ICD10Group: id.endsWith('other') ? 'C50-C50' : 'C30-C39'
			}
		}))
	);
	const therapy = [
		['p1-lung', 'operation'],
		['p1-other', 'systemic'],
		['p2-lung', 'systemic'],
		['split-lung', 'radiation'],
		['split-other', 'operation']
	].map(([tumorID, generalType]) => ({ tumorID, generalType }));
	const study = ['S1', 'S2', 'EMPTY'].map((shortname) => ({
		studyKey: shortname,
		studyID: shortname,
		shortname,
		phase: shortname
	}));
	const studyPatient = patients.flatMap(({ patID }) =>
		(['p1', 'p2'].includes(patID) ? ['S1', 'S2'] : ['S1']).map((studyKey) => ({
			studyKey,
			studyID: studyKey,
			shortname: studyKey,
			patID,
			recruitmentDate: new Date(studyKey === 'S1' ? '2023-06-01' : '2024-06-01')
		}))
	);
	for (const [name, documents] of Object.entries({
		patient: patients,
		diagnosis,
		therapy,
		study,
		studyPatient
	}))
		await db.collection(name).insertMany(documents);
	const collections = Object.fromEntries(
		['patient', 'diagnosis', 'therapy', 'progress', 'study', 'studyPatient'].map((name) => [
			name,
			name
		])
	);
	const control = createAccessControl({ env: { OVIS_IMPORT_MODE: 'credos' } });
	const queries = control.protectResolvers([
		{
			Query: {
				getStudyPatientTable: resolvers.getStudyPatientTable,
				getStudyPatientChart: resolvers.getStudyPatientChart,
				getAllStudies: resolvers.getAllStudies,
				getTableCount: resolvers.getTableCount,
				getQuicktoolsCountOverview: resolvers.getQuicktoolsCountOverview,
				getSyntheticStudyRows: async (_parent, { collection, filter }) =>
					db
						.collection(collection)
						.aggregate(filter ? await filter2match({ value: filter, column: collection, db }) : [])
						.toArray()
			}
		}
	])[0].Query;
	const contextFor = (mandatory) => ({
		db,
		collections,
		security: {
			anonymous: false,
			userId: 'synthetic-study',
			role: mandatory ? 'user' : 'admin',
			user: {
				_id: 'synthetic-study',
				role: mandatory ? 'user' : 'admin',
				status: 'active',
				userFilter: mandatory ? [JSON.stringify(mandatory)] : []
			}
		}
	});
	const call = (name, mandatory, requested, extra = {}) =>
		queries[name](
			null,
			{ ...extra, ...(requested ? { filter: JSON.stringify(requested) } : {}) },
			contextFor(mandatory),
			{ parentType: { getFields: () => ({ [name]: { args: [{ name: 'filter' }] } }) } }
		);
	const cases = [],
		failures = [];
	const record = async (name, check) => {
		try {
			await check();
			cases.push({ name, passed: true });
		} catch (error) {
			cases.push({ name, passed: false });
			failures.push({ name, error: error.stack });
		}
	};
	const participationIds = (rows) =>
		sorted(rows.map((row) => `${row.patID}/${row.studyKey ?? row.studyID}`));
	const expectedChart = (ids) => {
		const counts = new Map();
		for (const id of ids) {
			const studyKey = id.split('/')[1];
			counts.set(studyKey, (counts.get(studyKey) ?? 0) + 1);
		}
		return [...counts]
			.map(([shortname, studyPatients]) => ({ shortname, studyPatients }))
			.sort((a, b) => a.shortname.localeCompare(b.shortname));
	};
	const checkParticipation = async (name, mandatory, requested, expected) => {
		await record(`${name}/rows`, async () =>
			assert.deepEqual(
				participationIds(
					await call('getStudyPatientTable', mandatory, requested, { limit: 100, offset: 0 })
				),
				sorted(expected)
			)
		);
		await record(`${name}/table-count`, async () =>
			assert.equal(
				await call('getTableCount', mandatory, requested, { collection: 'studyPatient' }),
				expected.length
			)
		);
		await record(`${name}/chart`, async () =>
			assert.deepEqual(
				(
					await call('getStudyPatientChart', mandatory, requested)
				).sort((a, b) => a.shortname.localeCompare(b.shortname)),
				expectedChart(expected)
			)
		);
		await record(`${name}/overview`, async () => {
			const rows = await call('getAllStudies', mandatory, requested, { limit: 100, offset: 0 });
			assert.deepEqual(
				sorted(
					rows.flatMap((studyRow) =>
						studyRow.studyPatients.map((row) => `${row.patID}/${studyRow.studyKey}`)
					)
				),
				sorted(expected)
			);
		});
	};
	const originalLog = console.log,
		originalDir = console.dir;
	console.log = () => {};
	console.dir = () => {};
	try {
		const respiratory = group('OR', group('AND', field('diagnosis', 'ICD_ICD10Group', 'C30-C39')));
		const personal = group(
			'OR',
			group(
				'AND',
				field('patient', 'gender', 'm'),
				field(
					'patient',
					'!vitalDate',
					{ min: Date.parse('2024-01-01'), max: Date.parse('2024-12-31') },
					'NBETWEEN'
				),
				field('therapy', '!generalType', 'radiation', 'NEQUALS'),
				field('study', 'shortname', 'S1')
			)
		);
		await checkParticipation('reported-lock-and-personal-filters', respiratory, personal, [
			'p1/S1',
			'p2/S1'
		]);
		await record('reported-case/patient-and-tumor-identities', async () => {
			assert.deepEqual(
				sorted(
					(
						await call('getSyntheticStudyRows', respiratory, personal, { collection: 'patient' })
					).map((row) => row.patID)
				),
				['p1', 'p2']
			);
			assert.deepEqual(
				sorted(
					(
						await call('getSyntheticStudyRows', respiratory, personal, { collection: 'diagnosis' })
					).map((row) => row.tumorID)
				),
				['p1-lung', 'p2-lung']
			);
			const counts = await call('getQuicktoolsCountOverview', respiratory, personal, {
				collection: ['patient', 'diagnosis']
			});
			assert.deepEqual(
				counts.map((row) => row.count),
				[2, 2]
			);
		});
		const pair = group('OR', leaf('patient', 'patID', 'p1'), leaf('patient', 'patID', 'p2'));
		const c = field('diagnosis', 'ICD_ICD10_3', 'C34');
		const t = field('therapy', 'generalType', 'systemic');
		const rowConditions = [
			['study', field('study', 'shortname', 'S1')],
			[
				'participation-date',
				field(
					'studyPatient',
					'recruitmentDate',
					{ min: Date.parse('2023-01-01'), max: Date.parse('2023-12-31') },
					'BETWEEN'
				)
			]
		];
		for (const [source, s] of rowConditions) {
			const examples = [
				['AND-OR', group('AND', c, group('OR', t, s)), ['p1/S1', 'p2/S1', 'p2/S2']],
				['AND-XOR', group('AND', c, group('XOR', t, s)), ['p1/S1', 'p2/S2']],
				['AND-NOR', group('AND', c, group('NOR', t, s)), ['p1/S2']],
				[
					'OR-correlated-AND',
					group('OR', group('NOR', s), group('AND', c, t)),
					['p1/S2', 'p2/S1', 'p2/S2']
				],
				[
					'nested-AND-OR',
					group('AND', c, group('OR', group('AND', t, s), group('NOR', s))),
					['p1/S2', 'p2/S1', 'p2/S2']
				]
			];
			for (const [name, ast, expected] of examples) {
				await checkParticipation(`${source}/${name}`, pair, ast, expected);
				await checkParticipation(
					`${source}/${name}/neutral-wrappers`,
					group('OR', group('AND', pair)),
					group('OR', group('AND', ast)),
					expected
				);
			}
		}
		await checkParticipation(
			'mandatory-study-does-not-join-other-study',
			group('AND', pair, c, field('study', 'shortname', 'S1')),
			t,
			['p2/S1']
		);
		await checkParticipation('literal-empty-study-name', pair, field('study', 'shortname', ''), []);
		await checkParticipation('missing-study-name', pair, field('study', 'shortname', null), []);
		await checkParticipation(
			'negative-study-name',
			pair,
			field('study', '!shortname', 'S1', 'NEQUALS'),
			['p1/S2', 'p2/S2']
		);
		await record('unfiltered-known-patient-without-tumor-remains-visible', async () => {
			const rows = await call('getStudyPatientTable', null, null, { limit: 100 });
			assert.equal(rows.length, 8);
			assert.ok(rows.some((row) => row.patID === 'no-tumor'));
		});
		// A repeated row predicate must not turn a false branch into an unfiltered query.
		await db.collection('study').insertOne({ studyKey: 'S3', studyID: 'S3', shortname: 'S3' });
		await db.collection('studyPatient').insertOne({
			studyKey: 'S3',
			studyID: 'S3',
			shortname: 'S3',
			patID: 'p1',
			recruitmentDate: new Date('2025-06-01')
		});
		const duplicateRowPredicate = group(
			'OR',
			group('AND', c, field('study', 'shortname', 'S1')),
			field('study', 'shortname', 'S2'),
			field('study', 'shortname', 'S2')
		);
		for (const [name, requested] of [
			['repeated-study-predicate', duplicateRowPredicate],
			[
				'repeated-study-predicate/neutral-wrappers',
				group('OR', group('AND', duplicateRowPredicate))
			]
		]) {
			await checkParticipation(name, field('patient', 'patID', 'p1'), requested, [
				'p1/S1',
				'p1/S2'
			]);
		}
	} finally {
		console.log = originalLog;
		console.dir = originalDir;
	}
	return {
		cases: cases.length,
		passed: cases.filter((test) => test.passed).length,
		failures,
		details: cases
	};
}

async function main() {
	const address = process.env.OVIS_SIMULATION_MONGO;
	assert.ok(
		['ovis-filter-simulation-mongo-20260916', 'ovis-study-check-mongo-20260916'].includes(
			new URL(address).hostname
		)
	);
	const database = process.env.OVIS_STUDY_DB;
	assert.ok(database?.startsWith('synthetic_study_cohort_'));
	assert.ok(process.env.OVIS_STUDY_REPORT);
	const { MongoClient } = require('mongodb');
	const client = await new MongoClient(address, { serverSelectionTimeoutMS: 15000 }).connect();
	try {
		const report = await runStudyCohortMatrix({ db: client.db(database) });
		await writeFile(process.env.OVIS_STUDY_REPORT, `${JSON.stringify(report, null, 2)}\n`);
		console.log(
			JSON.stringify({
				cases: report.cases,
				passed: report.passed,
				failures: report.failures.length
			})
		);
		if (report.failures.length) process.exitCode = 1;
	} finally {
		await client.close();
	}
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
	await main();
