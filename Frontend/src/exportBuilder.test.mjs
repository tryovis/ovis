import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(
	fileURLToPath(new URL('../.export-builder-test-', import.meta.url))
);
await build({
	entryPoints: {
		model: fileURLToPath(new URL('./lib/export-builder/model.ts', import.meta.url)),
		fixture: fileURLToPath(new URL('../e2e/fixtures/export-builder-rows.ts', import.meta.url))
	},
	outdir: directory,
	outExtension: { '.js': '.mjs' },
	bundle: true,
	format: 'esm',
	platform: 'node',
	logLevel: 'silent'
});
const {
	datasets,
	relations,
	buildTablePlan,
	buildPreview: buildPreviewFromData,
	columnKey,
	getRowSelectionAvailability,
	MAX_JOIN_ROWS
} = await import(pathToFileURL(join(directory, 'model.mjs')).href);
const { exportBuilderRows } = await import(pathToFileURL(join(directory, 'fixture.mjs')).href);
await rm(directory, { recursive: true, force: true });
const dictionarySource = await readFile(
	new URL('./store/translations.js', import.meta.url),
	'utf8'
);
const { default: translations } = await import(
	`data:text/javascript;base64,${Buffer.from(dictionarySource).toString('base64')}`
);
const columns = (...keys) => keys.map(([dataset, field]) => ({ dataset, field, alias: '' }));
const buildPreview = (plan, fields) => buildPreviewFromData(plan, fields, exportBuilderRows);

test('dataset, field and relation metadata resolve in both languages, including shared dictionary keys', () => {
	const entries = [
		...datasets.flatMap((dataset) => [
			[`${dataset.id} label`, dataset.label],
			[`${dataset.id} description`, dataset.description],
			...dataset.fields.map((field) => [`${dataset.id}.${field.id}`, field.label])
		]),
		...relations.map((relation) => [`${relation.id} relation`, relation.label])
	];
	for (const language of ['en', 'de']) {
		for (const [source, key] of entries) {
			assert.ok(
				Object.hasOwn(translations[language], key),
				`${source}: missing ${language}.${key}`
			);
			assert.equal(typeof translations[language][key], 'string', `${language}.${key}`);
			assert.ok(translations[language][key].trim(), `${language}.${key} must not be empty`);
		}
	}
	const patient = datasets.find((dataset) => dataset.id === 'patient');
	assert.equal(patient.fields.find((field) => field.id === 'gender').label, 'gender');
	assert.equal(datasets.find((dataset) => dataset.id === 'diagnosis').label, 'tumors');
});

test('results use only the supplied data and do not retain rows between calls', () => {
	const plan = buildTablePlan('diagnosis', ['patient']);
	const fields = columns(['diagnosis', 'tumorID'], ['patient', 'patID']);
	const first = {
		diagnosis: [{ tumorID: 'API-T1', patID: 'API-P1' }],
		patient: [{ patID: 'API-P1' }]
	};
	const second = {
		diagnosis: [{ tumorID: 'API-T2', patID: 'API-P2' }],
		patient: [{ patID: 'API-P2' }]
	};
	const before = JSON.stringify(first);
	assert.deepEqual(buildPreviewFromData(plan, fields, first).rows, [
		{ 'diagnosis.tumorID': 'API-T1', 'patient.patID': 'API-P1' }
	]);
	assert.deepEqual(buildPreviewFromData(plan, fields, second).rows, [
		{ 'diagnosis.tumorID': 'API-T2', 'patient.patID': 'API-P2' }
	]);
	assert.equal(JSON.stringify(first), before);
});

test('empty and not-yet-loaded collections do not fall back to invented data', () => {
	const plan = buildTablePlan('diagnosis', ['patient']);
	const fields = columns(['diagnosis', 'tumorID'], ['patient', 'patID']);
	for (const data of [{}, { diagnosis: [], patient: [] }]) {
		assert.deepEqual(buildPreviewFromData(plan, fields, data), {
			rows: [],
			baseCount: 0,
			matchedBaseCount: 0,
			expanded: false
		});
	}
	const diagnosisOnly = { diagnosis: [{ tumorID: 'API-T1', patID: 'API-P1' }] };
	assert.deepEqual(buildPreviewFromData(plan, fields, diagnosisOnly).rows, [
		{ 'diagnosis.tumorID': 'API-T1', 'patient.patID': null }
	]);
	plan[1].join = 'inner';
	assert.deepEqual(buildPreviewFromData(plan, fields, diagnosisOnly).rows, []);
});

test('indexed joins preserve strict numeric/string key equality and never match NaN', () => {
	const result = buildPreviewFromData(
		buildTablePlan('diagnosis', ['patient']),
		columns(['patient', 'gender']),
		{
			diagnosis: [{ patID: 1 }, { patID: '1' }, { patID: NaN }],
			patient: [
				{ patID: '1', gender: 'string-key' },
				{ patID: 1, gender: 'number-key' },
				{ patID: NaN, gender: 'invalid-key' }
			]
		}
	);
	assert.deepEqual(result.rows, [
		{ 'patient.gender': 'number-key' },
		{ 'patient.gender': 'string-key' },
		{ 'patient.gender': null }
	]);
});

test('oversized join products fail explicitly instead of returning a partial export', () => {
	const childCount = Math.floor(Math.sqrt(MAX_JOIN_ROWS)) + 1;
	const data = {
		diagnosis: [{ tumorID: 'API-T1' }],
		therapy: Array.from({ length: childCount }, (_, id) => ({ tumorID: 'API-T1', therapyID: id })),
		histology: Array.from({ length: childCount }, (_, id) => ({ tumorID: 'API-T1', _id: id }))
	};
	assert.throws(
		() => buildPreviewFromData(buildTablePlan('diagnosis', ['therapy', 'histology']), [], data),
		{ name: 'ExportError', key: 'exportErrorRowLimit', vars: { limit: MAX_JOIN_ROWS } }
	);
	assert.throws(
		() =>
			buildPreviewFromData(buildTablePlan('diagnosis', []), [], {
				diagnosis: Array.from({ length: MAX_JOIN_ROWS + 1 }, () => ({ tumorID: 'API-T1' }))
			}),
		{ name: 'ExportError', key: 'exportErrorRowLimit', vars: { limit: MAX_JOIN_ROWS } }
	);
});

test('canonical paths insert bridge tables and remain acyclic from every base', () => {
	const plan = buildTablePlan('radiation', ['patient', 'studyPatient', 'histology']);
	assert.deepEqual(
		plan.map((entry) => entry.dataset),
		['radiation', 'therapy', 'diagnosis', 'patient', 'histology', 'studyPatient']
	);
	assert.equal(plan.find((entry) => entry.dataset === 'therapy').relation, 'therapy-radiation');
	for (const base of datasets) {
		const all = buildTablePlan(
			base.id,
			datasets.map((dataset) => dataset.id)
		);
		assert.equal(all.length, datasets.length);
		const previous = new Set();
		for (const entry of all) {
			assert.ok(entry.parent === null ? previous.size === 0 : previous.has(entry.parent));
			assert.ok(!previous.has(entry.dataset));
			previous.add(entry.dataset);
		}
	}
});

test('adding patients to tumor rows does not introduce the other tumor of the same patient', () => {
	const result = buildPreview(
		buildTablePlan('diagnosis', ['patient']),
		columns(['diagnosis', 'tumorID'], ['patient', 'patID'])
	);
	assert.equal(result.rows.length, 6);
	assert.equal(result.baseCount, 6);
	assert.equal(result.matchedBaseCount, 6);
	assert.equal(result.expanded, false);
	assert.deepEqual(
		result.rows.filter((row) => row['diagnosis.tumorID'] === 'DEMO-T01'),
		[{ 'diagnosis.tumorID': 'DEMO-T01', 'patient.patID': 'DEMO-P01' }]
	);
	assert.equal(
		result.rows.find((row) => row['diagnosis.tumorID'] === 'DEMO-T06')['patient.patID'],
		null
	);
});

test('radiation belongs to its exact therapy even when another therapy shares the same tumor', () => {
	const result = buildPreview(
		buildTablePlan('therapy', ['radiation']),
		columns(['therapy', 'therapyID'], ['radiation', 'areaDetailed'])
	);
	assert.equal(result.rows.filter((row) => row['therapy.therapyID'] === 'DEMO-TH01').length, 3);
	assert.deepEqual(
		result.rows.filter((row) => row['therapy.therapyID'] === 'DEMO-TH02'),
		[{ 'therapy.therapyID': 'DEMO-TH02', 'radiation.areaDetailed': null }]
	);
	assert.equal(result.rows.length, 10);
	assert.equal(result.expanded, true);
});

test('radiation parent identity does not confuse reused therapy IDs', () => {
	const data = {
		therapy: [
			{ _id: 'RT-source', therapyID: 'shared', generalType: 'radiation' },
			{ _id: 'OP-source', therapyID: 'shared', generalType: 'operation' }
		],
		radiation: [{ _id: 'RT-source', therapyID: 'shared', areaDetailed: 'Exact parent only' }]
	};
	assert.deepEqual(
		buildPreviewFromData(
			buildTablePlan('therapy', ['radiation']),
			columns(['therapy', 'generalType'], ['radiation', 'areaDetailed']),
			data
		).rows,
		[
			{ 'therapy.generalType': 'radiation', 'radiation.areaDetailed': 'Exact parent only' },
			{ 'therapy.generalType': 'operation', 'radiation.areaDetailed': null }
		]
	);
	assert.deepEqual(
		buildPreviewFromData(
			buildTablePlan('radiation', ['therapy']),
			columns(['therapy', 'generalType']),
			data
		).rows,
		[{ 'therapy.generalType': 'radiation' }]
	);
});

test('null and absent radiation source IDs never connect to a therapy in either direction', () => {
	for (const base of ['therapy', 'radiation']) {
		const child = base === 'therapy' ? 'radiation' : 'therapy';
		const plan = buildTablePlan(base, [child]);
		const result = buildPreview(
			plan,
			columns(
				[base, 'tumorID'],
				[child, 'therapyID'],
				[child, base === 'therapy' ? 'areaDetailed' : 'generalType']
			)
		);
		for (const tumor of ['DEMO-T05', 'DEMO-T06']) {
			const row = result.rows.find((candidate) => candidate[`${base}.tumorID`] === tumor);
			assert.ok(row);
			assert.equal(row[`${child}.therapyID`], null);
			assert.equal(row[`${child}.${base === 'therapy' ? 'areaDetailed' : 'generalType'}`], null);
		}
		plan[1].join = 'inner';
		const required = buildPreview(plan, columns([base, 'tumorID']));
		assert.ok(
			required.rows.every((row) => !['DEMO-T05', 'DEMO-T06'].includes(row[`${base}.tumorID`]))
		);
	}
});

test('independent one-to-many children preserve every combination without deduplication', () => {
	const result = buildPreview(
		buildTablePlan('diagnosis', ['therapy', 'histology']),
		columns(['diagnosis', 'tumorID'], ['therapy', 'therapyID'], ['histology', '_id'])
	);
	const firstTumor = result.rows.filter((row) => row['diagnosis.tumorID'] === 'DEMO-T01');
	assert.equal(firstTumor.length, 4);
	assert.deepEqual(
		new Set(firstTumor.map((row) => `${row['therapy.therapyID']}/${row['histology._id']}`)),
		new Set([
			'DEMO-TH01/DEMO-H01',
			'DEMO-TH01/DEMO-H02',
			'DEMO-TH02/DEMO-H01',
			'DEMO-TH02/DEMO-H02'
		])
	);
	assert.equal(result.rows.length, 9);
	assert.equal(result.matchedBaseCount, 6);
});

test('inner child joins remove unmatched base rows while left joins preserve them', () => {
	const plan = buildTablePlan('diagnosis', ['therapy', 'histology']);
	plan.find((entry) => entry.dataset === 'histology').join = 'inner';
	const result = buildPreview(plan, columns(['diagnosis', 'tumorID']));
	assert.equal(result.rows.length, 6);
	assert.equal(result.baseCount, 6);
	assert.equal(result.matchedBaseCount, 3);
	assert.equal(result.expanded, true);
});

test('later inner edge requires a match even when its parent came from a left join', () => {
	const plan = buildTablePlan('patient', ['radiation']);
	plan.find((entry) => entry.dataset === 'radiation').join = 'inner';
	const result = buildPreview(plan, columns(['patient', 'patID'], ['radiation', 'therapyID']));
	assert.equal(result.rows.length, 5);
	assert.equal(result.baseCount, 5);
	assert.equal(result.matchedBaseCount, 2);
	assert.deepEqual(
		new Set(result.rows.map((row) => row['patient.patID'])),
		new Set(['DEMO-P01', 'DEMO-P02'])
	);
});

test('all-left bridge path retains patients with no tumor and no treatment', () => {
	const result = buildPreview(
		buildTablePlan('patient', ['radiation']),
		columns(['patient', 'patID'], ['radiation', 'totalDose'])
	);
	assert.equal(result.matchedBaseCount, 5);
	assert.deepEqual(
		result.rows.filter((row) => row['patient.patID'] === 'DEMO-P05'),
		[{ 'patient.patID': 'DEMO-P05', 'radiation.totalDose': null }]
	);
});

test('projection preserves technical keys, nulls and aliases without mutating the plan', () => {
	const plan = buildTablePlan('diagnosis', []);
	const before = JSON.stringify(plan);
	const fields = [{ dataset: 'diagnosis', field: 'ICD.ICD10', alias: 'Mein Diagnosecode / α' }];
	const beforeFields = JSON.stringify(fields);
	const result = buildPreview(plan, fields);
	assert.equal(columnKey('diagnosis', 'ICD.ICD10'), 'diagnosis.ICD.ICD10');
	assert.equal(result.rows[0]['diagnosis.ICD.ICD10'], 'C50.9');
	assert.equal(Object.hasOwn(result.rows[0], fields[0].alias), false);
	assert.equal(JSON.stringify(plan), before);
	assert.equal(JSON.stringify(fields), beforeFields);
	assert.deepEqual(buildPreview([], []), {
		rows: [],
		baseCount: 0,
		matchedBaseCount: 0,
		expanded: false
	});
});

test('unapproved edges and fields cannot create arbitrary joins', () => {
	assert.throws(() => buildTablePlan('unknown', []), {
		key: 'exportErrorUnknownTable',
		vars: { table: 'unknown' }
	});
	assert.throws(() => buildTablePlan('diagnosis', ['unknown']), {
		key: 'exportErrorUnknownTable',
		vars: { table: 'unknown' }
	});
	const plan = buildTablePlan('diagnosis', ['patient']);
	plan[1].relation = relations.find((relation) => relation.from === 'therapy').id;
	assert.throws(() => buildPreview(plan, []), { key: 'exportErrorUnapprovedJoin' });
	assert.throws(
		() => buildPreview(buildTablePlan('diagnosis', []), columns(['patient', 'patID'])),
		{ key: 'exportErrorUnconnectedField', vars: { field: 'patient.patID' } }
	);
	assert.throws(
		() => buildPreview(buildTablePlan('diagnosis', []), columns(['diagnosis', 'unknown'])),
		{ key: 'exportErrorUnconnectedField', vars: { field: 'diagnosis.unknown' } }
	);
});

test('chronology metadata uses each dataset own date and excludes undated patient/radiation records', () => {
	const expected = {
		diagnosis: 'diagnosisDate',
		diagnostic: 'diagnosticOccurrenceDate',
		therapy: 'therapyOccurrenceDate',
		histology: 'ICDO_histologyDate',
		tnm: 'tnmOccurrenceDate',
		progress: 'progressOccurrenceDate',
		metastasis: 'metastasisDate',
		tumorBoard: 'tumorBoardOccurrenceDate',
		consultation: 'consultationOccurrenceDate',
		status: 'statusOccurrenceDate',
		molecularMarker: 'molecularMarkerOccurrenceDate',
		bioMaterial: 'bioMaterialOccurrenceDate',
		studyPatient: 'recruitmentDate',
		supplementary: 'supplementaryOccurrenceDate'
	};
	assert.deepEqual(
		Object.fromEntries(
			datasets
				.filter((dataset) => dataset.dateField)
				.map((dataset) => [dataset.id, dataset.dateField])
		),
		expected
	);
	for (const dataset of datasets.filter((dataset) => dataset.dateField)) {
		assert.equal(dataset.fields.find((field) => field.id === dataset.dateField)?.type, 'date');
	}
});

test('first and last select complete records within each parent and preserve input and join semantics', () => {
	const data = {
		diagnosis: [{ tumorID: 'T1' }, { tumorID: 'T2' }, { tumorID: 'T3' }],
		therapy: [
			{ _id: 'late-1', tumorID: 'T1', therapyOccurrenceDate: '2024-03-01', intention: 'late-1' },
			{ _id: 'early-2', tumorID: 'T2', therapyOccurrenceDate: '2025-01-01', intention: 'early-2' },
			{ _id: 'undated', tumorID: 'T1', therapyOccurrenceDate: null, intention: 'undated' },
			{
				_id: 'early-1',
				tumorID: 'T1',
				therapyOccurrenceDate: Date.UTC(2024, 0, 1),
				intention: 'early-1'
			},
			{
				_id: 'late-2',
				tumorID: 'T2',
				therapyOccurrenceDate: '2025-06-01T09:30:00Z',
				intention: 'late-2'
			},
			{ _id: 'invalid', tumorID: 'T2', therapyOccurrenceDate: '2025-02-30', intention: 'invalid' }
		]
	};
	const before = structuredClone(data);
	const fields = columns(
		['diagnosis', 'tumorID'],
		['therapy', '_id'],
		['therapy', 'therapyOccurrenceDate'],
		['therapy', 'intention']
	);
	for (const selection of ['first', 'last']) {
		const plan = buildTablePlan('diagnosis', ['therapy']);
		plan[1].selection = selection;
		const snapshot = structuredClone(plan);
		const result = buildPreviewFromData(plan, fields, data);
		const prefix = selection === 'first' ? 'early' : 'late';
		assert.deepEqual(
			result.rows.map((row) => row['therapy._id']),
			[`${prefix}-1`, `${prefix}-2`, null]
		);
		for (const row of result.rows.slice(0, 2)) {
			const original = data.therapy.find((entry) => entry._id === row['therapy._id']);
			assert.equal(row['therapy.therapyOccurrenceDate'], original.therapyOccurrenceDate);
			assert.equal(row['therapy.intention'], original.intention);
		}
		assert.equal(result.baseCount, 3);
		assert.equal(result.matchedBaseCount, 3);
		assert.equal(result.expanded, false);
		assert.deepEqual(plan, snapshot);
		plan[1].join = 'inner';
		assert.equal(buildPreviewFromData(plan, fields, data).matchedBaseCount, 2);
	}
	assert.deepEqual(data, before);
	const plan = buildTablePlan('diagnosis', ['therapy']);
	const original = buildPreviewFromData(plan, fields, data);
	plan[0].selection = 'first'; // The base represents source rows, not a join edge.
	plan[1].selection = 'all';
	assert.deepEqual(buildPreviewFromData(plan, fields, data), original);
});

test('chronology accepts ISO instants and numeric epochs, rejecting ambiguous and impossible dates', () => {
	const plan = buildTablePlan('diagnosis', ['therapy']);
	const edge = plan[1];
	for (const date of [
		0,
		Date.UTC(2024, 1, 29),
		'2024-02-29',
		'2024-01-01T12:30:00',
		'2024-01-01T12:30:00.123Z',
		'2024-01-01T12:30:00+02:00'
	]) {
		assert.deepEqual(
			getRowSelectionAvailability(edge, {
				diagnosis: [{ tumorID: 'T1' }],
				therapy: [{ tumorID: 'T1', therapyOccurrenceDate: date }]
			}),
			{ available: true, reason: null }
		);
	}
	for (const date of [
		null,
		undefined,
		'',
		NaN,
		Infinity,
		9e15,
		'01.02.2024',
		'2024',
		'2023-02-29',
		'2024-02-30',
		'2024-13-01',
		'2024-01-00',
		'2024-01-01T24:01:00Z',
		'2024-01-01T12:60:00Z',
		'2024-01-01T12:00:00+24:00'
	]) {
		assert.deepEqual(
			getRowSelectionAvailability(edge, {
				diagnosis: [{ tumorID: 'T1' }],
				therapy: [{ tumorID: 'T1', therapyOccurrenceDate: date }]
			}),
			{ available: false, reason: 'missingDates' }
		);
	}
	edge.selection = 'first';
	const rows = buildPreviewFromData(plan, columns(['therapy', '_id']), {
		diagnosis: [{ tumorID: 'T1' }],
		therapy: [
			{ tumorID: 'T1', _id: 'utc-later', therapyOccurrenceDate: '2024-01-01T10:00:00Z' },
			{ tumorID: 'T1', _id: 'offset-earlier', therapyOccurrenceDate: '2024-01-01T11:00:00+02:00' }
		]
	}).rows;
	assert.equal(rows[0]['therapy._id'], 'offset-earlier');
});

test('date ties use ascending stable ID then canonical full rows for either extreme regardless of API order', () => {
	const rows = [
		{ _id: 'b', tumorID: 'T1', therapyOccurrenceDate: '2024-01-01', intention: 'first-in-api' },
		{ _id: 'a', tumorID: 'T1', therapyOccurrenceDate: '2024-01-01', intention: 'Z' },
		{ intention: 'A', therapyOccurrenceDate: '2024-01-01', tumorID: 'T1', _id: 'a' }
	];
	for (const selection of ['first', 'last']) {
		const plan = buildTablePlan('diagnosis', ['therapy']);
		plan[1].selection = selection;
		for (const ordered of [rows, [...rows].reverse(), [rows[1], rows[2], rows[0]]]) {
			assert.deepEqual(
				buildPreviewFromData(plan, columns(['therapy', '_id'], ['therapy', 'intention']), {
					diagnosis: [{ tumorID: 'T1' }],
					therapy: ordered
				}).rows,
				[{ 'therapy._id': 'a', 'therapy.intention': 'A' }]
			);
		}
	}
});

test('eligibility ignores orphan children but rejects an entirely undated matching group', () => {
	const plan = buildTablePlan('diagnosis', ['therapy']);
	const edge = plan[1];
	const data = {
		diagnosis: [{ tumorID: 'T1' }, { tumorID: 'T2' }, { tumorID: null }],
		therapy: [
			{ tumorID: 'T1', therapyOccurrenceDate: '2024-01-01' },
			{ tumorID: 'orphan', therapyOccurrenceDate: null },
			{ tumorID: null, therapyOccurrenceDate: null }
		]
	};
	assert.deepEqual(getRowSelectionAvailability(edge, data), { available: true, reason: null });
	for (const selection of ['first', 'last']) {
		edge.selection = selection;
		assert.equal(buildPreviewFromData(plan, [], data).rows.length, 3);
	}
	data.therapy.push({ tumorID: 'T2', therapyOccurrenceDate: null });
	assert.deepEqual(getRowSelectionAvailability(edge, data), {
		available: false,
		reason: 'missingDates'
	});
	for (const selection of ['first', 'last']) {
		edge.selection = selection;
		assert.throws(() => buildPreviewFromData(plan, [], data), {
			key: 'exportErrorSelectionDate',
			vars: { table: 'therapy' }
		});
	}
	edge.selection = 'all';
	assert.equal(buildPreviewFromData(plan, [], data).rows.length, 3);
	assert.deepEqual(getRowSelectionAvailability(edge, { diagnosis: data.diagnosis, therapy: [] }), {
		available: false,
		reason: 'noMatches'
	});
	assert.deepEqual(getRowSelectionAvailability(edge, { diagnosis: [], therapy: data.therapy }), {
		available: false,
		reason: 'noMatches'
	});
});

test('selection happens before downstream radiation and independently reduces sibling joins', () => {
	const plan = buildTablePlan('diagnosis', ['radiation', 'histology']);
	plan.find((edge) => edge.dataset === 'therapy').selection = 'last';
	plan.find((edge) => edge.dataset === 'histology').selection = 'first';
	const data = {
		diagnosis: [{ tumorID: 'T1' }],
		therapy: [
			{ _id: 'early', tumorID: 'T1', therapyID: 'same-id', therapyOccurrenceDate: '2020-01-01' },
			{ _id: 'late', tumorID: 'T1', therapyID: 'same-id', therapyOccurrenceDate: '2021-01-01' }
		],
		histology: [
			{ _id: 'h-late', tumorID: 'T1', ICDO_histologyDate: '2023-01-01' },
			{ _id: 'h-early', tumorID: 'T1', ICDO_histologyDate: '2022-01-01' }
		],
		radiation: [
			{ _id: 'early', areaDetailed: 'wrong parent' },
			{ _id: 'late', areaDetailed: 'one' },
			{ _id: 'late', areaDetailed: 'two' }
		]
	};
	assert.deepEqual(
		buildPreviewFromData(
			plan,
			columns(['therapy', '_id'], ['histology', '_id'], ['radiation', 'areaDetailed']),
			data
		).rows,
		[
			{ 'therapy._id': 'late', 'histology._id': 'h-early', 'radiation.areaDetailed': 'one' },
			{ 'therapy._id': 'late', 'histology._id': 'h-early', 'radiation.areaDetailed': 'two' }
		]
	);
});

test('patient scopes select separately and never aggregate repeated base rows', () => {
	const plan = buildTablePlan('patient', ['diagnosis']);
	plan[1].selection = 'first';
	const data = {
		patient: [{ patID: 'P1' }, { patID: 'P1' }, { patID: 'P2' }],
		diagnosis: [
			{ patID: 'P1', tumorID: 'T-late', diagnosisDate: '2022-01-01' },
			{ patID: 'P2', tumorID: 'T2', diagnosisDate: '2020-01-01' },
			{ patID: 'P1', tumorID: 'T-early', diagnosisDate: '2021-01-01' }
		]
	};
	assert.equal(getRowSelectionAvailability(plan[1], data).available, true);
	assert.deepEqual(buildPreviewFromData(plan, columns(['diagnosis', 'tumorID']), data).rows, [
		{ 'diagnosis.tumorID': 'T-early' },
		{ 'diagnosis.tumorID': 'T-early' },
		{ 'diagnosis.tumorID': 'T2' }
	]);
});

test('reversed relation keys select within the reached parent scope', () => {
	const plan = buildTablePlan('histology', ['diagnosis']);
	plan[1].selection = 'last';
	const data = {
		histology: [{ tumorID: 'T1' }, { tumorID: 'T2' }],
		diagnosis: [
			{ _id: 'early', tumorID: 'T1', diagnosisDate: '2020-01-01' },
			{ _id: 'only', tumorID: 'T2', diagnosisDate: '2019-01-01' },
			{ _id: 'late', tumorID: 'T1', diagnosisDate: '2021-01-01' }
		]
	};
	assert.equal(getRowSelectionAvailability(plan[1], data).available, true);
	assert.deepEqual(buildPreviewFromData(plan, columns(['diagnosis', '_id']), data).rows, [
		{ 'diagnosis._id': 'late' },
		{ 'diagnosis._id': 'only' }
	]);
});

test('unsupported selection modes and datasets fail explicitly even before matching data loads', () => {
	for (const child of ['patient', 'radiation']) {
		const plan = buildTablePlan(child === 'patient' ? 'diagnosis' : 'therapy', [child]);
		plan[1].selection = 'first';
		assert.deepEqual(getRowSelectionAvailability(plan[1], {}), {
			available: false,
			reason: 'noDateField'
		});
		assert.throws(() => buildPreviewFromData(plan, [], {}), {
			key: 'exportErrorSelectionDate',
			vars: { table: child }
		});
	}
	const plan = buildTablePlan('diagnosis', ['therapy']);
	for (const mode of ['arbitrary', null]) {
		plan[1].selection = mode;
		assert.throws(() => buildPreviewFromData(plan, [], {}), { key: 'exportErrorSelectionMode' });
	}
	plan[1].selection = 'first';
	assert.deepEqual(buildPreviewFromData(plan, [], { diagnosis: [{ tumorID: 'none' }] }).rows, [{}]);
	plan[1].join = 'inner';
	assert.deepEqual(buildPreviewFromData(plan, [], { diagnosis: [{ tumorID: 'none' }] }).rows, []);
});
