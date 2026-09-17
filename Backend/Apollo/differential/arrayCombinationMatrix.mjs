import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { createAccessControl } = require('../accessControl');
const { filter2match } = require('../astTranslator');
const resolvers = require('../resolver/resolver').Query;
const therapyResolvers = require('../resolver/therapy').Query;
const group = (operand, ...children) => ({ operand, children });
const leaf = (system, key, value, type = 'EQUALS') => ({ system, key, value, type });
const field = (...args) => group('OR', leaf(...args));
const sorted = (values) => [...values].sort();
const date = (value) => new Date(value);
const between = (system, key, min, max, negative = false) =>
	field(system, `${negative ? '!' : ''}${key}`, { min, max }, negative ? 'NBETWEEN' : 'BETWEEN');

/** Explicit, hand-calculated identities and displayed array values. This module
 * deliberately does not import the reference evaluator or derive expected IDs
 * by evaluating the production AST. All data is synthetic. */
export async function runArrayCombinationMatrix({ db }) {
	assert.ok(db.databaseName.startsWith('synthetic_array_combination_'));
	assert.equal((await db.listCollections().toArray()).length, 0, 'Fresh test DB required');
	const patient = [],
		diagnosis = [],
		therapy = [],
		followUp = [],
		studyPatient = [];
	const add = (id, diagnosisFields = {}, therapyFields = {}, followUpFields = {}) => {
		patient.push({ patID: id, tumorID: [`${id}-t`] });
		diagnosis.push({ patID: id, tumorID: `${id}-t`, ICD: { ICD10_3: 'C34' }, ...diagnosisFields });
		therapy.push({
			patID: id,
			tumorID: `${id}-t`,
			therapyID: `${id}-e`,
			generalType: 'operation',
			...therapyFields
		});
		followUp.push({ patID: id, tumorID: `${id}-t`, followUpID: `${id}-f`, ...followUpFields });
		studyPatient.push({ patID: id, studyKey: 'S1', studyID: 'S1', shortname: 'S1' });
	};
	const primitive = [
		['p-a', ['0']],
		['p-b', ['1']],
		['p-ab', ['0', '1']],
		['p-ba', ['1', '0']],
		['p-dup', ['0', '1', '0']],
		['p-empty', []],
		['p-missing', undefined],
		['p-null', null],
		['p-blank', ['']],
		['p-dash', ['-']],
		['p-space', [' ']],
		['p-mix', [null, '0']]
	];
	for (const [id, values] of primitive)
		add(
			id,
			values === undefined ? {} : { ECOG: values },
			values === undefined ? {} : { surgeon: values, metastasisResection: values }
		);
	add('numeric-outside', { ECOG: ['0', '4'] });
	add('numeric-inside', { ECOG: ['2'] });
	const objectFamilies = [
		['ops', 'code', 'text'],
		['complication', 'complication', 'grade'],
		['substance', 'substance', 'ATCCode'],
		['radiation', 'areaGrouped', 'subArea']
	];
	const objectShapes = [
		[
			'o-both',
			[
				['A', 'one'],
				['B', 'two']
			]
		],
		['o-one', [['A', 'two']]],
		['o-a', [['A', 'one']]],
		['o-b', [['B', 'two']]],
		['o-none', [['C', 'three']]],
		[
			'o-dup',
			[
				['A', 'two'],
				['A', 'two']
			]
		],
		[
			'o-rev',
			[
				['B', 'two'],
				['A', 'one']
			]
		],
		['o-empty', []],
		['o-missing', undefined],
		['o-null', null],
		['o-blank', [['', '']]],
		['o-nullentry', [[null, null]]],
		['o-entrymissing', [[undefined, undefined]]],
		[
			'o-mixedmissing',
			[
				['A', 'one'],
				[undefined, undefined]
			]
		]
	];
	const objects = (shape, first, second) =>
		shape?.map(([a, b]) => ({
			...(a === undefined ? {} : { [first]: a }),
			...(b === undefined ? {} : { [second]: b })
		}));
	for (const [id, shape] of objectShapes) {
		const fields = {};
		for (const [prefix, first, second] of objectFamilies)
			if (shape !== undefined)
				fields[prefix] = shape === null ? null : objects(shape, first, second);
		add(id, {}, fields);
	}
	const dateShapes = [
		['d-before', ['2023-12-31']],
		['d-min', ['2024-01-01']],
		['d-mid', ['2024-06-15']],
		['d-max', ['2024-12-31']],
		['d-after', ['2025-01-01']],
		['d-split', ['2023-12-31', '2025-01-01']],
		['d-mixed', ['2023-12-31', '2024-06-15', '2025-01-01']],
		['d-dup', ['2024-12-31', '2024-01-01', '2024-12-31']],
		['d-empty', []],
		['d-missing', undefined],
		['d-null', null]
	];
	for (const [id, values] of dateShapes) {
		const fields = {};
		for (const key of ['progressDate', 'therapyStartDate', 'therapyEndDate'])
			if (values !== undefined) fields[key] = values === null ? null : values.map(date);
		add(id, {}, {}, fields);
	}
	add('ev-same', {}, { ops: [{ code: 'A', text: 'two' }] });
	add('ev-split', {}, { ops: [{ code: 'A', text: 'one' }] });
	therapy.push({
		patID: 'ev-split',
		tumorID: 'ev-split-t',
		therapyID: 'ev-split-e2',
		ops: [{ code: 'B', text: 'two' }]
	});
	add('ev-other', {}, { ops: [{ code: 'C', text: 'three' }] });
	add('mt-same', {}, { ops: [{ code: 'A', text: 'two' }] });
	add('mt-split', {}, { ops: [{ code: 'A', text: 'one' }] });
	add('mt-cross', {}, { ops: [] });
	for (const id of ['mt-split', 'mt-cross']) {
		patient.find((row) => row.patID === id).tumorID.push(`${id}-other`);
		diagnosis.push({ patID: id, tumorID: `${id}-other`, ICD: { ICD10_3: 'C50' } });
		therapy.push({
			patID: id,
			tumorID: `${id}-other`,
			therapyID: `${id}-other-e`,
			ops: [{ code: 'A', text: 'two' }]
		});
	}
	for (const id of ['mt-same', 'mt-split', 'mt-cross'])
		studyPatient.push({ patID: id, studyKey: 'S2', studyID: 'S2', shortname: 'S2' });
	const study = ['S1', 'S2'].map((studyKey) => ({
		studyKey,
		studyID: studyKey,
		shortname: studyKey
	}));
	for (const [name, rows] of Object.entries({
		patient,
		diagnosis,
		therapy,
		followUp,
		study,
		studyPatient
	}))
		await db.collection(name).insertMany(rows);
	const collections = Object.fromEntries(
		['patient', 'diagnosis', 'therapy', 'followUp', 'progress', 'study', 'studyPatient'].map(
			(name) => [name, name]
		)
	);
	const control = createAccessControl({ env: { OVIS_IMPORT_MODE: 'credos' } });
	const queries = control.protectResolvers([
		{
			Query: {
				getStudyPatientTable: resolvers.getStudyPatientTable,
				getTableCount: resolvers.getTableCount,
				getTherapySystemicSubstanceTable: therapyResolvers.getTherapySystemicSubstanceTable,
				getSyntheticArrayRows: async (_parent, { collection, filter }) =>
					db
						.collection(collection)
						.aggregate(filter ? await filter2match({ value: filter, column: collection, db }) : [])
						.toArray()
			}
		}
	])[0].Query;
	const call = (name, mandatory, requested, extra = {}) =>
		queries[name](
			null,
			{ ...extra, ...(requested ? { filter: JSON.stringify(requested) } : {}) },
			{
				db,
				collections,
				security: {
					anonymous: false,
					userId: 'synthetic-array',
					role: 'user',
					user: {
						_id: 'synthetic-array',
						role: 'user',
						status: 'active',
						userFilter: [JSON.stringify(mandatory)]
					}
				}
			},
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
	let scenarios = 0;
	const cohort = (ids) => group('OR', ...ids.map((id) => leaf('patient', 'patID', id)));
	const check = async (name, ids, requested, expected, options = {}) => {
		scenarios++;
		const mandatory = options.lock ? group('AND', cohort(ids), options.lock) : cohort(ids);
		for (const collection of options.targets ?? ['patient', 'diagnosis', 'therapy']) {
			const idKey = {
				patient: 'patID',
				diagnosis: 'tumorID',
				therapy: 'therapyID',
				followUp: 'followUpID'
			}[collection];
			const suffix = { patient: '', diagnosis: '-t', therapy: '-e', followUp: '-f' }[collection];
			await record(`${name}/${collection}`, async () => {
				const rows = await call('getSyntheticArrayRows', mandatory, requested, { collection });
				assert.deepEqual(
					sorted(rows.map((row) => row[idKey])),
					sorted(options.expectedByTarget?.[collection] ?? expected.map((id) => `${id}${suffix}`))
				);
				if (options.preserve && collection === options.preserve.system) {
					for (const row of rows) {
						const source = { diagnosis, therapy, followUp }[collection].find(
							(item) => item[idKey] === row[idKey]
						);
						assert.deepEqual(
							row[options.preserve.key],
							source[options.preserve.key],
							'Primitive array must retain order, duplicates and nonmatching values'
						);
					}
				}
				if (options.display && collection === 'therapy') {
					const { prefix, first, second, entries } = options.display;
					for (const row of rows) {
						const shape = entries[row.patID];
						assert.ok(
							Object.hasOwn(entries, row.patID),
							`Missing hand-calculated displayed array for ${row.patID}`
						);
						assert.deepEqual(
							row[prefix],
							shape === undefined
								? undefined
								: shape === null
								? null
								: objects(shape, first, second)
						);
					}
				}
			});
		}
		if (options.study !== false) {
			const expectedStudy = options.expectedStudy ?? expected.map((id) => `${id}/S1`);
			await record(`${name}/study-participations`, async () =>
				assert.deepEqual(
					sorted(
						(
							await call('getStudyPatientTable', mandatory, requested, { limit: 100, offset: 0 })
						).map((row) => `${row.patID}/${row.studyKey ?? row.studyID}`)
					),
					sorted(expectedStudy)
				)
			);
			await record(`${name}/study-count`, async () =>
				assert.equal(
					await call('getTableCount', mandatory, requested, { collection: 'studyPatient' }),
					expectedStudy.length
				)
			);
		}
	};
	const originalLog = console.log,
		originalDir = console.dir;
	console.log = () => {};
	console.dir = () => {};
	try {
		const pids = primitive.map(([id]) => id);
		const emptyPrimitive = [
			'p-empty',
			'p-missing',
			'p-null',
			'p-blank',
			'p-dash',
			'p-space',
			'p-mix'
		];
		for (const [system, key] of [
			['diagnosis', 'ECOG'],
			['therapy', 'surgeon'],
			['therapy', 'metastasisResection']
		]) {
			const a = field(system, key, '0'),
				b = field(system, key, '1');
			const na = field(system, `!${key}`, '0', 'NEQUALS'),
				nb = field(system, `!${key}`, '1', 'NEQUALS');
			for (const [name, ast, expected] of [
				['equals', a, ['p-a', 'p-ab', 'p-ba', 'p-dup', 'p-mix']],
				['AND', group('AND', a, b), ['p-ab', 'p-ba', 'p-dup']],
				['OR', group('OR', a, b), ['p-a', 'p-b', 'p-ab', 'p-ba', 'p-dup', 'p-mix']],
				['XOR', group('XOR', a, b), ['p-a', 'p-b', 'p-mix']],
				[
					'NOR',
					group('NOR', a, b),
					['p-empty', 'p-missing', 'p-null', 'p-blank', 'p-dash', 'p-space']
				],
				['literal-empty', field(system, key, ''), ['p-blank']],
				['literal-null', field(system, key, null), ['p-missing', 'p-null', 'p-mix']],
				['empty-marker', field(system, key, '-'), emptyPrimitive],
				[
					'not-empty-marker',
					field(system, `!${key}`, '-', 'NEQUALS'),
					['p-a', 'p-b', 'p-ab', 'p-ba', 'p-dup']
				],
				[
					'canonical-negative-multiselect',
					group('OR', na.children[0], nb.children[0]),
					['p-empty', 'p-missing', 'p-null', 'p-blank', 'p-dash', 'p-space']
				],
				['nested-negative', group('AND', a, group('NOR', b)), ['p-a', 'p-mix']],
				[
					'duplicate-and-order',
					group('OR', b, a, a),
					['p-a', 'p-b', 'p-ab', 'p-ba', 'p-dup', 'p-mix']
				]
			])
				await check(`primitive/${system}/${key}/${name}`, pids, ast, expected, {
					preserve: { system, key }
				});
		}
		const oids = objectShapes.map(([id]) => id);
		for (const [name, ast, expected] of [
			['single-range-witness', between('diagnosis', 'ECOG', '1', '3'), ['numeric-inside']],
			['range-complement', between('diagnosis', 'ECOG', '1', '3', true), ['numeric-outside']],
			[
				'independent-range-witnesses',
				group(
					'AND',
					between('diagnosis', 'ECOG', '0', '1'),
					between('diagnosis', 'ECOG', '3', '4')
				),
				['numeric-outside']
			]
		])
			await check(
				`primitive/string-numeric/${name}`,
				['numeric-outside', 'numeric-inside'],
				ast,
				expected,
				{ preserve: { system: 'diagnosis', key: 'ECOG' } }
			);
		const orIds = ['o-both', 'o-one', 'o-a', 'o-b', 'o-dup', 'o-rev', 'o-mixedmissing'];
		const norIds = [
			'o-none',
			'o-empty',
			'o-missing',
			'o-null',
			'o-blank',
			'o-nullentry',
			'o-entrymissing'
		];
		for (const [prefix, first, second] of objectFamilies) {
			const a = field('therapy', `${prefix}_${first}`, 'A'),
				b = field('therapy', `${prefix}_${second}`, 'two');
			const one = field('therapy', `${prefix}_${second}`, 'one');
			const na = field('therapy', `!${prefix}_${first}`, 'A', 'NEQUALS');
			const nb = field('therapy', `!${prefix}_${second}`, 'two', 'NEQUALS');
			const norEntries = {
				'o-none': [['C', 'three']],
				'o-empty': [],
				'o-missing': undefined,
				'o-null': null,
				'o-blank': [['', '']],
				'o-nullentry': [[null, null]],
				'o-entrymissing': [[undefined, undefined]]
			};
			const orEntries = {
				'o-both': [
					['A', 'one'],
					['B', 'two']
				],
				'o-one': [['A', 'two']],
				'o-a': [['A', 'one']],
				'o-b': [['B', 'two']],
				'o-dup': [
					['A', 'two'],
					['A', 'two']
				],
				'o-rev': [
					['B', 'two'],
					['A', 'one']
				],
				'o-mixedmissing': [['A', 'one']]
			};
			const andEntries = {
				'o-one': [['A', 'two']],
				'o-dup': [
					['A', 'two'],
					['A', 'two']
				]
			};
			for (const [name, ast, expected, entries] of [
				['same-entry-AND', group('AND', a, b), ['o-one', 'o-dup'], andEntries],
				['union-OR', group('OR', a, b), orIds, orEntries],
				['complement-NOR', group('NOR', a, b), norIds, norEntries],
				[
					'exactly-one-XOR',
					group('XOR', a, b),
					['o-a', 'o-b', 'o-mixedmissing'],
					{ 'o-a': [['A', 'one']], 'o-b': [['B', 'two']], 'o-mixedmissing': [['A', 'one']] }
				],
				[
					'nested-AND-OR',
					group('AND', a, group('OR', one, b)),
					['o-both', 'o-one', 'o-a', 'o-dup', 'o-rev', 'o-mixedmissing'],
					{
						'o-both': [['A', 'one']],
						'o-one': [['A', 'two']],
						'o-a': [['A', 'one']],
						'o-dup': [
							['A', 'two'],
							['A', 'two']
						],
						'o-rev': [['A', 'one']],
						'o-mixedmissing': [['A', 'one']]
					}
				],
				[
					'negative-whole-document',
					group('AND', a, nb),
					['o-a', 'o-mixedmissing'],
					{ 'o-a': [['A', 'one']], 'o-mixedmissing': [['A', 'one']] }
				],
				['two-negative-fields', group('AND', na, nb), norIds, norEntries],
				[
					'neutral-wrappers',
					group('OR', group('AND', a, group('OR', b))),
					['o-one', 'o-dup'],
					andEntries
				]
			])
				await check(`objects/${prefix}/${name}`, oids, ast, expected, {
					display: { prefix, first, second, entries }
				});
			await check(
				`objects/${prefix}/mandatory-array-with-scalar-OR`,
				oids,
				group('OR', b, field('therapy', 'generalType', 'operation')),
				['o-both', 'o-one', 'o-a', 'o-dup', 'o-rev', 'o-mixedmissing'],
				{
					lock: a,
					display: {
						prefix,
						first,
						second,
						entries: {
							'o-both': [['A', 'one']],
							'o-one': [['A', 'two']],
							'o-a': [['A', 'one']],
							'o-dup': [
								['A', 'two'],
								['A', 'two']
							],
							'o-rev': [['A', 'one']],
							'o-mixedmissing': [['A', 'one']]
						}
					}
				}
			);
		}
		for (const [name, ast, expected] of [
			['literal-empty', field('therapy', 'ops_code', ''), ['o-blank']],
			[
				'literal-null',
				field('therapy', 'ops_code', null),
				['o-missing', 'o-null', 'o-nullentry', 'o-entrymissing', 'o-mixedmissing']
			],
			[
				'empty-marker',
				field('therapy', 'ops_code', '-'),
				[
					'o-empty',
					'o-missing',
					'o-null',
					'o-blank',
					'o-nullentry',
					'o-entrymissing',
					'o-mixedmissing'
				]
			],
			[
				'not-empty-marker',
				field('therapy', '!ops_code', '-', 'NEQUALS'),
				['o-both', 'o-one', 'o-a', 'o-b', 'o-none', 'o-dup', 'o-rev']
			]
		])
			await check(`objects/empty/${name}`, oids, ast, expected);
		for (const [name, value, expected, entries] of [
			[
				'literal-null',
				null,
				['o-missing', 'o-null', 'o-nullentry', 'o-entrymissing', 'o-mixedmissing'],
				{
					'o-missing': undefined,
					'o-null': null,
					'o-nullentry': [[null, null]],
					'o-entrymissing': [[undefined, undefined]],
					'o-mixedmissing': [[undefined, undefined]]
				}
			],
			['literal-empty', '', ['o-blank'], { 'o-blank': [['', '']] }],
			[
				'empty-marker',
				'-',
				[
					'o-empty',
					'o-missing',
					'o-null',
					'o-blank',
					'o-nullentry',
					'o-entrymissing',
					'o-mixedmissing'
				],
				{
					'o-empty': [],
					'o-missing': undefined,
					'o-null': null,
					'o-blank': [['', '']],
					'o-nullentry': [[null, null]],
					'o-entrymissing': [[undefined, undefined]],
					'o-mixedmissing': [[undefined, undefined]]
				}
			]
		])
			await check(
				`objects/display-empty/${name}`,
				oids,
				field('therapy', 'ops_code', value),
				expected,
				{
					display: { prefix: 'ops', first: 'code', second: 'text', entries }
				}
			);
		for (const [name, operand, expected] of [
			[
				'OR',
				'OR',
				[
					['A', 7],
					['B', 3]
				]
			],
			['AND', 'AND', [['A', 3]]],
			[
				'XOR',
				'XOR',
				[
					['A', 2],
					['B', 1]
				]
			]
		]) {
			scenarios++;
			await record(`actual-substance-table/${name}`, async () => {
				const rows = await call(
					'getTherapySystemicSubstanceTable',
					cohort(oids),
					group(
						operand,
						field('therapy', 'substance_substance', 'A'),
						field('therapy', 'substance_ATCCode', 'two')
					)
				);
				assert.deepEqual(
					rows.map(({ label, count }) => [label, count]).sort((a, b) => a[0].localeCompare(b[0])),
					expected
				);
			});
		}
		for (const [name, ast, expected, entries] of [
			[
				'BETWEEN',
				between('therapy', 'ops_code', 'A', 'A'),
				['o-both', 'o-one', 'o-a', 'o-dup', 'o-rev', 'o-mixedmissing'],
				{
					'o-both': [['A', 'one']],
					'o-one': [['A', 'two']],
					'o-a': [['A', 'one']],
					'o-dup': [
						['A', 'two'],
						['A', 'two']
					],
					'o-rev': [['A', 'one']],
					'o-mixedmissing': [['A', 'one']]
				}
			],
			[
				'NBETWEEN',
				between('therapy', 'ops_code', 'A', 'A', true),
				[
					'o-b',
					'o-none',
					'o-empty',
					'o-missing',
					'o-null',
					'o-blank',
					'o-nullentry',
					'o-entrymissing'
				],
				{
					'o-b': [['B', 'two']],
					'o-none': [['C', 'three']],
					'o-empty': [],
					'o-missing': undefined,
					'o-null': null,
					'o-blank': [['', '']],
					'o-nullentry': [[null, null]],
					'o-entrymissing': [[undefined, undefined]]
				}
			]
		])
			await check(`objects/range/${name}`, oids, ast, expected, {
				display: { prefix: 'ops', first: 'code', second: 'text', entries }
			});
		const crossArrayNull = group(
			'OR',
			field('therapy', 'ops_code', null),
			field('therapy', 'substance_substance', 'A')
		);
		const crossArrayIds = [
			'o-both',
			'o-one',
			'o-a',
			'o-dup',
			'o-rev',
			'o-missing',
			'o-null',
			'o-nullentry',
			'o-entrymissing',
			'o-mixedmissing'
		];
		for (const [prefix, first, second, entries] of [
			[
				'ops',
				'code',
				'text',
				{
					'o-both': [
						['A', 'one'],
						['B', 'two']
					],
					'o-one': [['A', 'two']],
					'o-a': [['A', 'one']],
					'o-dup': [
						['A', 'two'],
						['A', 'two']
					],
					'o-rev': [
						['B', 'two'],
						['A', 'one']
					],
					'o-missing': undefined,
					'o-null': null,
					'o-nullentry': [[null, null]],
					'o-entrymissing': [[undefined, undefined]],
					'o-mixedmissing': [
						['A', 'one'],
						[undefined, undefined]
					]
				}
			],
			[
				'substance',
				'substance',
				'ATCCode',
				{
					'o-both': [['A', 'one']],
					'o-one': [['A', 'two']],
					'o-a': [['A', 'one']],
					'o-dup': [
						['A', 'two'],
						['A', 'two']
					],
					'o-rev': [['A', 'one']],
					'o-missing': undefined,
					'o-null': null,
					'o-nullentry': [[null, null]],
					'o-entrymissing': [[undefined, undefined]],
					'o-mixedmissing': [
						['A', 'one'],
						[undefined, undefined]
					]
				}
			]
		])
			await check(`objects/cross-array-null-gate/${prefix}`, oids, crossArrayNull, crossArrayIds, {
				display: { prefix, first, second, entries }
			});
		const dids = dateShapes.map(([id]) => id);
		for (const key of ['progressDate', 'therapyStartDate', 'therapyEndDate']) {
			const in2024 = between('followUp', key, Date.parse('2024-01-01'), Date.parse('2024-12-31'));
			const outside = between(
				'followUp',
				key,
				Date.parse('2024-01-01'),
				Date.parse('2024-12-31'),
				true
			);
			const min = field('followUp', key, '2024-01-01'),
				max = field('followUp', key, '2024-12-31');
			for (const [name, ast, expected] of [
				['BETWEEN-one-element', in2024, ['d-min', 'd-mid', 'd-max', 'd-mixed', 'd-dup']],
				[
					'NBETWEEN-complement',
					outside,
					['d-before', 'd-after', 'd-split', 'd-empty', 'd-missing', 'd-null']
				],
				['AND-both-boundaries', group('AND', min, max), ['d-dup']],
				['OR-boundaries', group('OR', min, max), ['d-min', 'd-max', 'd-dup']],
				['XOR-boundaries', group('XOR', min, max), ['d-min', 'd-max']],
				[
					'open-min',
					between('followUp', key, null, Date.parse('2024-01-01')),
					['d-before', 'd-min', 'd-split', 'd-mixed', 'd-dup']
				],
				['empty-bounds', between('followUp', key, null, null), ['d-empty', 'd-missing', 'd-null']],
				[
					'nested-date-exclusion',
					group('AND', in2024, group('NOR', max)),
					['d-min', 'd-mid', 'd-mixed']
				]
			])
				await check(`dates/${key}/${name}`, dids, ast, expected, {
					targets: ['patient', 'diagnosis', 'followUp'],
					preserve: { system: 'followUp', key }
				});
		}
		const a = field('therapy', 'ops_code', 'A'),
			b = field('therapy', 'ops_text', 'two');
		const eventIds = ['ev-same', 'ev-split', 'ev-other'];
		await check('events/same-event-AND', eventIds, group('AND', a, b), ['ev-same']);
		await check('events/lock-and-request-same-event', eventIds, b, ['ev-same'], { lock: a });
		await check('events/OR-across-events', eventIds, group('OR', a, b), ['ev-same', 'ev-split'], {
			expectedByTarget: { therapy: ['ev-same-e', 'ev-split-e', 'ev-split-e2'] }
		});
		await check('events/XOR-event-vs-tumor-scope', eventIds, group('XOR', a, b), [], {
			expectedByTarget: { therapy: ['ev-split-e', 'ev-split-e2'] }
		});
		const multiIds = ['mt-same', 'mt-split', 'mt-cross'];
		const c34 = field('diagnosis', 'ICD_ICD10_3', 'C34');
		const s1 = field('study', 'shortname', 'S1');
		await check('locks/same-tumor-and-array-entry', multiIds, b, ['mt-same'], {
			lock: group('AND', c34, a),
			expectedStudy: ['mt-same/S1', 'mt-same/S2']
		});
		await check('locks/array-plus-study', multiIds, group('AND', b, s1), ['mt-same'], {
			lock: group('AND', c34, a)
		});
		await check(
			'locks/array-plus-study-nested',
			multiIds,
			group('OR', group('AND', b, s1)),
			['mt-same'],
			{ lock: group('OR', group('AND', c34, a)) }
		);
		await check(
			'locks/primitive-multiselect',
			['p-a', 'p-b', 'p-ab', 'p-ba', 'p-dup'],
			field('diagnosis', 'ECOG', '1'),
			['p-ab', 'p-ba', 'p-dup'],
			{ lock: field('diagnosis', 'ECOG', '0') }
		);
	} finally {
		console.log = originalLog;
		console.dir = originalDir;
	}
	return {
		scenarios,
		cases: cases.length,
		passed: cases.filter((test) => test.passed).length,
		failures,
		details: cases
	};
}

async function main() {
	const address = process.env.OVIS_SIMULATION_MONGO;
	assert.equal(new URL(address).hostname, 'ovis-filter-simulation-mongo-20260916');
	const database = process.env.OVIS_ARRAY_DB;
	assert.ok(database?.startsWith('synthetic_array_combination_'));
	assert.ok(process.env.OVIS_ARRAY_REPORT);
	const { MongoClient } = require('mongodb');
	const client = await new MongoClient(address, { serverSelectionTimeoutMS: 15000 }).connect();
	try {
		const report = await runArrayCombinationMatrix({ db: client.db(database) });
		await writeFile(process.env.OVIS_ARRAY_REPORT, `${JSON.stringify(report, null, 2)}\n`);
		console.log(
			JSON.stringify({
				scenarios: report.scenarios,
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
