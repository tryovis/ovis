const assert = require('node:assert/strict');
const test = require('node:test');
const { ApolloServer } = require('@apollo/server');
const { ObjectId, Decimal128, Long } = require('bson');
const { createAccessControl } = require('../accessControl');
const resolver = require('./clinicalExport');
const schema = require('../schema/clinicalExport.graphql');

const get = (row, path) => path.split('.').reduce((value, key) => value?.[key], row);
const equal = (a, b) => (Array.isArray(a) ? a.some((value) => equal(value, b)) : a === b);
const matches = (row, query = {}) =>
	Object.entries(query).every(([key, condition]) => {
		if (key === '$and') return condition.every((part) => matches(row, part));
		if (key === '$or') return condition.some((part) => matches(row, part));
		if (key === '$nor') return !condition.some((part) => matches(row, part));
		if (key === '$expr') return expression(row, condition);
		const value = get(row, key);
		if (condition == null || typeof condition !== 'object') return equal(value, condition);
		return Object.entries(condition).every(([operator, expected]) => {
			if (operator === '$eq') return equal(value, expected);
			if (operator === '$in') return expected.some((entry) => equal(value, entry));
			if (operator === '$nin') return !expected.some((entry) => equal(value, entry));
			if (operator === '$exists') return expected === (value !== undefined);
			if (operator === '$size') return value?.length === expected;
			assert.fail(`Unsupported synthetic query operator ${operator}`);
		});
	});
function expression(row, value) {
	if (value === '$$ROOT') return row;
	if (typeof value === 'string' && value.startsWith('$')) return get(row, value.slice(1));
	if (value?.$mergeObjects)
		return Object.assign({}, ...value.$mergeObjects.map((entry) => expression(row, entry)));
	if (value?.$eq) return equal(...value.$eq.map((entry) => expression(row, entry)));
	if (value && typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [key, expression(row, entry)])
		);
	return value;
}
function pipeline(documents, stages) {
	return stages.reduce((rows, stage) => {
		if (stage.$match) return rows.filter((row) => matches(row, stage.$match));
		if (stage.$sort)
			return [...rows].sort((a, b) => {
				for (const [key, order] of Object.entries(stage.$sort)) {
					const left = get(a, key),
						right = get(b, key);
					if (left !== right) return left > right ? order : -order;
				}
				return 0;
			});
		if (stage.$skip) return rows.slice(stage.$skip);
		if (stage.$limit) return rows.slice(0, stage.$limit);
		if (stage.$unwind)
			return rows.flatMap((row) => {
				const { path, includeArrayIndex } = stage.$unwind;
				const key = path.slice(1),
					value = row[key];
				if (Array.isArray(value) && value.length)
					return value.map((entry, index) => ({
						...row,
						[key]: entry,
						[includeArrayIndex]: index
					}));
				return [
					{ ...row, [key]: Array.isArray(value) ? undefined : value, [includeArrayIndex]: null }
				];
			});
		if (stage.$replaceRoot) return rows.map((row) => expression(row, stage.$replaceRoot.newRoot));
		if (stage.$set) return rows.map((row) => ({ ...row, ...expression(row, stage.$set) }));
		if (stage.$group) {
			const [key, accumulator] = Object.entries(stage.$group).find(([field]) => field !== '_id');
			assert.ok(accumulator.$addToSet);
			return [
				{
					_id: null,
					[key]: [...new Set(rows.flatMap((row) => get(row, accumulator.$addToSet.slice(1))))]
				}
			];
		}
		assert.fail(`Unsupported synthetic aggregation ${JSON.stringify(stage)}`);
	}, documents);
}

const datasets = [
	'patient',
	'diagnosis',
	'therapy',
	'histology',
	'tnm',
	'progress',
	'metastasis',
	'tumorBoard',
	'consultation',
	'status',
	'molecularMarker',
	'bioMaterial',
	'studyPatient',
	'supplementary',
	'diagnostic',
	'study',
	'kaplanMeier',
	'followUp'
];
const leaf = (system, key, value) => ({ system, key, value, type: 'EQUALS' });
const filter = (...children) => JSON.stringify({ operand: 'AND', children });

async function fixture(t, documents = {}, security = {}) {
	const calls = [],
		closed = [],
		visited = [];
	const collections = {
		...Object.fromEntries(datasets.map((id) => [id, id])),
		usr: 'user',
		exportAudit: 'exportAudit'
	};
	const context = {
		collections,
		security: {
			anonymous: false,
			userId: 'synthetic-user',
			sub: 'synthetic-subject',
			role: 'user',
			user: {},
			...security
		},
		db: {
			collection(name) {
				assert.ok(datasets.includes(name), `Private collection accessed: ${name}`);
				const data = documents[name] ?? [];
				return {
					distinct: async (field, query = {}) => [
						...new Set(data.filter((row) => matches(row, query)).flatMap((row) => get(row, field)))
					],
					aggregate(stages, options) {
						calls.push({ name, stages, options });
						const rows = pipeline(data, stages);
						return {
							async *[Symbol.asyncIterator]() {
								for (const row of rows) {
									visited.push(row);
									yield row;
								}
							},
							async close() {
								closed.push(name);
							},
							async next() {
								return rows[0] ?? null;
							},
							async toArray() {
								return rows;
							}
						};
					}
				};
			}
		}
	};
	const server = new ApolloServer({
		typeDefs: [
			'type Query { ping: Boolean } type Patientinformation { firstName: String lastName: String }',
			schema
		],
		resolvers: createAccessControl().protectResolvers([resolver]),
		includeStacktraceInErrorResponses: false
	});
	t.after(() => server.stop());
	const query = async (operation, variables = {}) =>
		(await server.executeOperation({ query: operation, variables }, { contextValue: context })).body
			.singleResult;
	return {
		context,
		calls,
		closed,
		visited,
		query,
		fields: (collection, ast = null) =>
			query(
				'query($collection:ExportCollection!,$filter:String) { getExportFields(collection:$collection,filter:$filter) {id type} }',
				{ collection, filter: ast }
			),
		rows: (collection, options = {}) =>
			query(
				'query($collection:ExportCollection!,$filter:String,$offset:Int!,$limit:Int!) { getExportRows(collection:$collection,filter:$filter,offset:$offset,limit:$limit) }',
				{ collection, offset: 0, limit: 1000, ...options }
			)
	};
}
const parseRows = (result) => {
	assert.equal(result.errors, undefined);
	return result.data.getExportRows.map(JSON.parse);
};
const parseFields = (result) => {
	assert.equal(result.errors, undefined);
	return Object.fromEntries(result.data.getExportFields.map(({ id, type }) => [id, type]));
};

test('full-cohort discovery includes sparse custom fields after the first thousand rows, without reading values into the response', async (t) => {
	const diagnosis = Array.from({ length: 1501 }, (_, index) => ({
		_id: index,
		tumorID: `t${index}`,
		ageAtDiagnosis: index
	}));
	diagnosis[0].sparse = { derived: false };
	const f = await fixture(t, { diagnosis });
	const result = await f.fields('diagnosis');
	assert.equal(parseFields(result)['sparse.derived'], 'TEXT');
	assert.equal(f.visited.length, 1501);
	assert.deepEqual(f.closed, ['diagnosis']);
	assert.ok(!JSON.stringify(result).includes('t1500'));
	assert.ok(!f.calls[0].stages.some((stage) => stage.$limit));
});

test('rows preserve derived fields, nulls, false, dates, BSON IDs, and aligned arrays without multiplying rows', async (t) => {
	const when = new Date('2024-01-01T00:00:00Z');
	const _id = new ObjectId('111111111111111111111111');
	const f = await fixture(t, {
		diagnosis: [
			{
				_id,
				metastasis: 'both',
				recurrence: false,
				previousTherapy: { surgery: true, radiation: false },
				diagnosisDate: when,
				emptyDate: null,
				ECOG: [0, null, '2'],
				ops: [{ code: 'A', nested: [{ flag: false }] }, null, { code: 'B' }],
				followDate: [when, null],
				empty: {},
				number: 0,
				decimal: Decimal128.fromString('1.000000000000000000000000000000001'),
				large: Long.fromString('9007199254740993')
			}
		]
	});
	const rows = parseRows(await f.rows('diagnosis'));
	assert.equal(rows.length, 1);
	assert.equal(rows[0]._id, _id.toHexString());
	assert.equal(rows[0].metastasis, 'both');
	assert.equal(rows[0].recurrence, 'false');
	assert.equal(rows[0]['previousTherapy.surgery'], 'true');
	assert.equal(rows[0].diagnosisDate, when.getTime());
	assert.equal(rows[0].emptyDate, null);
	assert.equal(rows[0].ECOG, '[0,null,"2"]');
	assert.deepEqual(JSON.parse(rows[0]['ops.code']), ['A', null, 'B']);
	assert.deepEqual(JSON.parse(rows[0]['ops.nested.flag']), [[false], null, null]);
	assert.equal(rows[0].empty, '{}');
	assert.equal(rows[0].number, 0);
	assert.deepEqual(JSON.parse(rows[0].large), { $numberLong: '9007199254740993' });
	assert.deepEqual(JSON.parse(rows[0].decimal), {
		$numberDecimal: '1.000000000000000000000000000000001'
	});
	const fields = parseFields(await f.fields('diagnosis'));
	assert.equal(fields.diagnosisDate, 'DATE');
	assert.equal(fields.emptyDate, 'DATE');
	assert.equal(fields.followDate, 'TEXT');
	assert.equal(fields.number, 'NUMBER');
});

test('pseudonymization removes names recursively from rows, parent JSON cells, arrays, and field descriptors', async (t) => {
	const patient = [
		{
			_id: 1,
			firstName: 'PRIVATE_FIRST',
			lastName: 'PRIVATE_LAST',
			identity: { firstName: 'PRIVATE_NESTED', age: 3 },
			list: [{ lastName: 'PRIVATE_ARRAY', ok: true }, null],
			'embedded.firstName': 'PRIVATE_DOTTED'
		}
	];
	const f = await fixture(t, { patient }, { user: { pseudonymization: true } });
	const rows = parseRows(await f.rows('patient'));
	const fields = parseFields(await f.fields('patient'));
	assert.ok(!JSON.stringify([rows, fields]).match(/PRIVATE|firstName|lastName/));
	assert.equal(rows[0]['identity.age'], 3);
	assert.deepEqual(JSON.parse(rows[0].list), [{ ok: true }, null]);
	const denied = await f.fields('patient', filter(leaf('patient', 'identity.firstName', 'guess')));
	assert.equal(denied.errors?.[0].extensions.code, 'FORBIDDEN');
	f.context.security.user.pseudonymization = false;
	delete patient[0]['embedded.firstName'];
	assert.equal(parseRows(await f.rows('patient'))[0].firstName, 'PRIVATE_FIRST');
});

test('server assigned cohort restricts discovery and rows; requested filters cannot widen it', async (t) => {
	const diagnosis = [
		{ _id: 2, tumorID: 'allowed', scope: 'allowed', feature: 1 },
		{ _id: 1, tumorID: 'outside', scope: 'outside', outsideOnly: 'PRIVATE' }
	];
	const f = await fixture(
		t,
		{ diagnosis },
		{
			user: {
				userFilter: [
					filter(leaf('diagnosis', 'scope', 'old')),
					filter(leaf('diagnosis', 'scope', 'allowed'))
				]
			}
		}
	);
	assert.equal(parseFields(await f.fields('diagnosis')).outsideOnly, undefined);
	assert.deepEqual(
		parseRows(await f.rows('diagnosis')).map((row) => row.tumorID),
		['allowed']
	);
	assert.deepEqual(
		parseRows(await f.rows('diagnosis', { filter: filter(leaf('diagnosis', 'scope', 'outside')) })),
		[]
	);
});

test('only clinical enum collections are exposed; ordinary authentication and private-filter checks apply', async (t) => {
	const f = await fixture(t);
	for (const collection of [
		'user',
		'exportAudit',
		'usageEvent',
		'platformDocument',
		'platformConfiguration',
		'metaData',
		'ops'
	]) {
		assert.ok((await f.rows(collection)).errors?.length);
	}
	assert.equal(f.calls.length, 0);
	assert.equal(
		(await f.fields('diagnosis', filter(leaf('exportAudit', 'userId', 'x')))).errors?.[0].extensions
			.code,
		'FORBIDDEN'
	);
	f.context.security = { anonymous: true, demo: false };
	assert.equal((await f.fields('diagnosis')).errors?.[0].extensions.code, 'UNAUTHENTICATED');
	f.context.security.demo = true;
	assert.deepEqual(parseFields(await f.fields('diagnosis')), {});
});

test('radiation retains custom detail fields, exact parent IDs and deterministic pages for duplicate therapy IDs', async (t) => {
	const therapy = [
		{
			_id: 'r2',
			therapyID: 'duplicate',
			generalType: 'radiation',
			tumorID: 't1',
			patID: 'p1',
			radiation: [{ _id: 'detail', custom: { value: 1 }, type: 'A' }, { type: 'B' }]
		},
		{ _id: 'r1', therapyID: 'duplicate', generalType: 'operation', radiation: [{ type: 'X' }] }
	];
	const f = await fixture(t, { therapy });
	const a = parseRows(await f.rows('radiation', { limit: 1 }))[0];
	const b = parseRows(await f.rows('radiation', { offset: 1, limit: 1 }))[0];
	assert.equal(a._id, 'r2');
	assert.equal(b._id, 'r2');
	assert.equal(a['radiation._id'], 'detail');
	assert.equal(a['custom.value'], 1);
	assert.deepEqual([a.type, b.type], ['A', 'B']);
	assert.equal(parseFields(await f.fields('radiation'))['custom.value'], 'NUMBER');
	assert.deepEqual(parseRows(await f.rows('radiation', { offset: 2 })), []);
});

test('all-field radiation keeps the mandatory tumor restriction despite duplicate therapy IDs and conflicting detail fields', async (t) => {
	const f = await fixture(
		t,
		{
			diagnosis: [
				{ tumorID: 't1', scope: 'allowed' },
				{ tumorID: 't2', scope: 'outside' }
			],
			therapy: [
				{
					_id: 'parent1',
					therapyID: 'duplicate',
					tumorID: 't1',
					patID: 'p1',
					generalType: 'radiation',
					radiation: [{ _id: 'child1', tumorID: 't2', type: 'A', custom: 'visible' }]
				},
				{
					_id: 'parent2',
					therapyID: 'duplicate',
					tumorID: 't2',
					patID: 'p1',
					generalType: 'radiation',
					radiation: [{ _id: 'child2', tumorID: 't1', type: 'A', outsideOnly: 'PRIVATE' }]
				}
			]
		},
		{ user: { userFilter: [filter(leaf('diagnosis', 'scope', 'allowed'))] } }
	);
	const rows = parseRows(await f.rows('radiation'));
	assert.equal(rows.length, 1);
	assert.equal(rows[0]._id, 'parent1');
	assert.equal(rows[0].tumorID, 't1');
	assert.equal(rows[0]['radiation.tumorID'], 't2');
	assert.equal(rows[0].custom, 'visible');
	assert.equal(parseFields(await f.fields('radiation')).outsideOnly, undefined);
});

test('study exports retain materialized keys/custom fields and use participation-aware membership without adding patient arrays', async (t) => {
	const documents = {
		study: [
			{ _id: 's1', studyKey: 'k1', status: 'open', extra: { flag: false } },
			{ _id: 's2', studyKey: 'k2', status: 'closed' }
		],
		studyPatient: [
			{ _id: 'sp1', studyKey: 'k1', patID: 'p1', extra: 4 },
			{ _id: 'sp2', studyKey: 'k2', patID: 'p1' },
			{ _id: 'sp3', studyKey: 'k1', patID: 'p2' }
		],
		patient: [
			{ _id: 'p1', patID: 'p1', scope: 'allowed' },
			{ _id: 'p2', patID: 'p2', scope: 'outside' }
		]
	};
	const f = await fixture(t, documents, {
		user: { userFilter: [filter(leaf('patient', 'scope', 'allowed'))] }
	});
	const requested = filter(leaf('study', 'status', 'open'));
	const rows = parseRows(await f.rows('studyPatient', { filter: requested }));
	assert.equal(rows.length, 1);
	assert.equal(rows[0].studyKey, 'k1');
	assert.equal(rows[0].extra, 4);
	const studies = parseRows(await f.rows('study', { filter: requested }));
	assert.equal(studies.length, 1);
	assert.equal(studies[0]['extra.flag'], 'false');
	assert.ok(!('studyPatients' in studies[0]));
	assert.ok(!f.calls.some(({ stages }) => stages.some((stage) => stage.$lookup)));
});

test('new clinical dataset IDs work and invalid pagination fails before reading', async (t) => {
	const f = await fixture(
		t,
		Object.fromEntries(
			['diagnostic', 'study', 'kaplanMeier', 'followUp'].map((id) => [id, [{ _id: 1, custom: id }]])
		)
	);
	for (const id of ['diagnostic', 'study', 'kaplanMeier', 'followUp'])
		assert.equal(parseRows(await f.rows(id))[0].custom, id);
	const before = f.calls.length;
	for (const options of [{ offset: -1 }, { limit: 0 }, { limit: 1001 }])
		assert.equal(
			(await f.rows('diagnosis', options)).errors?.[0].extensions.code,
			'BAD_USER_INPUT'
		);
	assert.equal(f.calls.length, before);
});

test('literal dotted fields fail explicitly and close the cursor rather than overwriting or misreading cells', async (t) => {
	const f = await fixture(t, { diagnosis: [{ _id: 1, custom: { x: 1 }, 'custom.x': 2 }] });
	assert.equal((await f.rows('diagnosis')).errors?.[0].extensions.code, 'BAD_USER_INPUT');
	assert.deepEqual(f.closed, ['diagnosis']);
});

test('study dates without Date suffix retain date descriptors, while arrays stay text', async (t) => {
	const f = await fixture(t, {
		study: [{ _id: 1, start: 1704067200000, firstPatInPlanned: null }],
		followUp: [{ _id: 1, therapyStartDate: [1704067200000] }]
	});
	const fields = parseFields(await f.fields('study'));
	assert.equal(fields.start, 'DATE');
	assert.equal(fields.firstPatInPlanned, 'DATE');
	assert.equal(parseFields(await f.fields('followUp')).therapyStartDate, 'TEXT');
});
