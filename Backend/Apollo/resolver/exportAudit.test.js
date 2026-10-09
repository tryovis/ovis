const assert = require('node:assert/strict');
const test = require('node:test');
const { ApolloServer } = require('@apollo/server');
const { createAccessControl } = require('../accessControl');
const audit = require('./exportAudit');
const schema = require('../schema/exportAudit.graphql');

const collections = {
	usr: 'user',
	patient: 'patient',
	diagnosis: 'diagnosis',
	therapy: 'therapy',
	usageEvent: 'usageEvent',
	exportAudit: 'exportAudit'
};
const criterion = (value) => ({ system: 'diagnosis', key: 'tumorID', type: 'EQUALS', value });
const input = (changes = {}) => ({
	route: '/export',
	title: 'Synthetic export',
	kind: 'TABLE',
	format: 'CSV',
	fileName: '../../synthetic.csv',
	filterActive: true,
	filter: JSON.stringify(criterion('T-2')),
	selection: JSON.stringify({ columns: ['tumorID'] }),
	policyVersion: '2026-10-02',
	appVersion: '1.4.0',
	...changes
});
const actor = (id = 'alice', role = 'user') => ({
	anonymous: false,
	demo: false,
	userId: id,
	sub: `subject-${id}`,
	role,
	user: { _id: id, status: 'active', role, userFilter: [JSON.stringify(criterion('T-1'))] }
});
const matches = (row, query) =>
	Object.entries(query).every(([key, value]) => {
		if (key === '$or') return value.some((branch) => matches(row, branch));
		if (value && typeof value === 'object' && '$regex' in value)
			return new RegExp(value.$regex, value.$options).test(row[key]);
		return row[key] === value;
	});

function fixture(security = actor()) {
	const records = [];
	const writes = [];
	const state = { acknowledged: true, throwWrite: false, collisions: 0, race: null };
	const store = {
		async insertOne(row, options) {
			if (state.collisions-- > 0)
				throw Object.assign(new Error('synthetic collision'), { code: 11000 });
			if (state.throwWrite) throw new Error('synthetic write failure');
			writes.push({ operation: 'insert', options });
			if (state.acknowledged) records.push(row);
			return { acknowledged: state.acknowledged, insertedId: row._id };
		},
		async findOne(query) {
			return records.find((row) => matches(row, query)) || null;
		},
		async updateOne(query, update, options) {
			if (state.throwWrite) throw new Error('synthetic write failure');
			if (state.race) {
				const race = state.race;
				state.race = null;
				race(records[0]);
			}
			const row = records.find((entry) => matches(entry, query));
			writes.push({ operation: 'update', options, query, update });
			if (state.acknowledged && row) Object.assign(row, update.$set);
			return {
				acknowledged: state.acknowledged,
				matchedCount: row ? 1 : 0,
				modifiedCount: row ? 1 : 0
			};
		},
		async countDocuments(query) {
			return records.filter((row) => matches(row, query)).length;
		},
		find(query) {
			let rows = records.filter((row) => matches(row, query));
			const cursor = {
				sort() {
					rows.sort((a, b) => b.createdAt - a.createdAt || b._id.localeCompare(a._id));
					return cursor;
				},
				skip(offset) {
					rows = rows.slice(offset);
					return cursor;
				},
				limit(limit) {
					rows = rows.slice(0, limit);
					return cursor;
				},
				async toArray() {
					return rows;
				}
			};
			return cursor;
		}
	};
	const context = {
		security,
		collections,
		db: {
			collection(name) {
				assert.equal(name, 'exportAudit');
				return store;
			}
		}
	};
	const protectedResolvers = createAccessControl().protectResolvers([audit])[0];
	return {
		records,
		writes,
		state,
		context,
		create: (changes) =>
			protectedResolvers.Mutation.createExportAudit(null, { input: input(changes) }, context),
		prepare: (id, changes = {}) =>
			protectedResolvers.Mutation.prepareExportAudit(
				null,
				{ id, sizeBytes: 17, sha256: 'a'.repeat(64), rowCount: 2, ...changes },
				context
			),
		complete: (id, outcome) =>
			protectedResolvers.Mutation.completeExportAudit(null, { id, outcome }, context),
		read: (args = {}) => protectedResolvers.Query.getExportAudits(null, args, context)
	};
}

test('audit identity, creation time, policy, filename and mandatory filter come from trusted context', async () => {
	const f = fixture();
	const before = Date.now();
	const result = await f.create({
		userId: 'mallory',
		createdAt: 1,
		anonymousDemo: true,
		metadataSource: 'server'
	});
	const row = f.records[0];
	assert.match(result.id, /^[a-f0-9]{24}$/);
	assert.ok(result.createdAt >= before && result.createdAt <= Date.now());
	assert.equal(row.userId, 'alice');
	assert.equal(row.actorSubject, 'subject-alice');
	assert.equal(row.userRole, 'user');
	assert.equal(row.anonymousDemo, false);
	assert.equal(row.metadataSource, 'browser');
	assert.equal(row.confirmedAt, row.createdAt);
	assert.equal(row.status, 'CREATED');
	assert.equal(row.fileName, result.fileName);
	assert.ok(!row.fileName.includes('/'));
	assert.ok(row.fileName.endsWith(`_${result.id}.csv`));
	assert.deepEqual(JSON.parse(row.mandatoryFilter), criterion('T-1'));
	assert.deepEqual(JSON.parse(row.effectiveFilter), {
		operand: 'AND',
		children: [criterion('T-1'), criterion('T-2')]
	});
	assert.deepEqual(f.writes[0].options, { writeConcern: { w: 'majority', j: true } });
});

test('disabling requested filter never disables latest mandatory restriction', async () => {
	const f = fixture();
	f.context.security.user.userFilter.unshift(JSON.stringify(criterion('old')));
	await f.create({ filterActive: false });
	assert.deepEqual(JSON.parse(f.records[0].effectiveFilter), criterion('T-1'));
	assert.deepEqual(JSON.parse(f.records[0].filter), criterion('T-2'));
	await f.create({ filter: null });
	assert.deepEqual(JSON.parse(f.records[1].effectiveFilter), criterion('T-1'));
});

test('malformed, private or unbounded metadata and incompatible kind/format are rejected before writes', async () => {
	const invalid = [
		{ policyVersion: 'old' },
		{ policyVersion: null },
		{ route: 'https://outside.invalid' },
		{ title: 'x'.repeat(241) },
		{ appVersion: '\n' },
		{ fileName: 'x'.repeat(201) },
		{ filterActive: 'true' },
		{ kind: 'CHART', format: 'CSV' },
		{ format: 'SVG' },
		{ filter: '{' },
		{ filter: 'x'.repeat(250001) },
		{ selection: 'true' },
		{ selection: '{' },
		{ selection: JSON.stringify({ value: 'x'.repeat(250000) }) },
		{ filter: JSON.stringify({ ...criterion('alice'), system: 'exportAudit', key: 'userId' }) }
	];
	for (const changes of invalid) {
		const f = fixture();
		await assert.rejects(f.create(changes));
		assert.equal(f.writes.length, 0);
	}
	const f = fixture();
	f.context.security.user.userFilter = ['{'];
	await assert.rejects(f.create());
	assert.equal(f.writes.length, 0);
});

test('preparation seals browser artifact metadata before release, with exact idempotent retries', async () => {
	const f = fixture();
	const { id } = await f.create();
	await assert.rejects(f.complete(id, 'SAVED'));
	assert.equal(await f.prepare(id), true);
	const preparedAt = f.records[0].preparedAt;
	assert.equal(f.records[0].status, 'PREPARED');
	assert.equal(f.records[0].sha256, 'a'.repeat(64));
	assert.equal(f.records[0].sizeBytes, 17);
	const count = f.writes.length;
	assert.equal(await f.prepare(id, { sha256: 'A'.repeat(64) }), true);
	assert.equal(f.writes.length, count);
	assert.equal(f.records[0].preparedAt, preparedAt);
	await assert.rejects(f.prepare(id, { sizeBytes: 18 }));
	await assert.rejects(f.prepare(id, { rowCount: 3 }));
	assert.equal(f.records[0].sizeBytes, 17);
	assert.equal(await f.complete(id, 'DOWNLOAD_STARTED'), true);
	assert.ok(f.records[0].completedAt >= preparedAt);
	assert.equal(await f.complete(id, 'DOWNLOAD_STARTED'), true);
	await assert.rejects(f.complete(id, 'SAVED'));
	await assert.rejects(f.prepare(id));
});

test('cancel/failure may finish an unprepared attempt, and terminal statuses are immutable', async () => {
	for (const outcome of ['CANCELLED', 'FAILED']) {
		const f = fixture();
		const { id } = await f.create();
		assert.equal(await f.complete(id, outcome), true);
		assert.equal(f.records[0].sha256, null);
		assert.equal(await f.complete(id, outcome), true);
		await assert.rejects(f.complete(id, 'DOWNLOAD_STARTED'));
		await assert.rejects(f.prepare(id));
	}
});

test('artifact bounds and audit owner cannot be forged, including changed identity-provider subject', async () => {
	const f = fixture();
	const { id } = await f.create();
	for (const changes of [
		{ sizeBytes: -1 },
		{ sizeBytes: 1.5 },
		{ sizeBytes: Infinity },
		{ sizeBytes: 10 * 1024 ** 3 + 1 },
		{ sha256: '../bad' },
		{ rowCount: -1 },
		{ rowCount: 2.5 }
	])
		await assert.rejects(f.prepare(id, changes));
	f.context.security = actor('bob');
	await assert.rejects(f.prepare(id), { extensions: { code: 'FORBIDDEN' } });
	await assert.rejects(f.complete(id, 'FAILED'), { extensions: { code: 'FORBIDDEN' } });
	f.context.security = { ...actor(), sub: 'replacement-account' };
	await assert.rejects(f.prepare(id), { extensions: { code: 'FORBIDDEN' } });
	assert.equal(f.records[0].status, 'CREATED');
});

test('all anonymous mutation paths, including demo, remain fail-closed', async () => {
	for (const demo of [false, true]) {
		const f = fixture({ anonymous: true, demo, role: 'demo', userId: null });
		await assert.rejects(f.create(), {
			extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } }
		});
		await assert.rejects(f.prepare('a'.repeat(24)));
		await assert.rejects(f.complete('a'.repeat(24), 'FAILED'));
		assert.equal(f.writes.length, 0);
	}
});

test('unacknowledged/unavailable writes never authorize release; collisions are retried', async () => {
	const f = fixture();
	f.state.collisions = 1;
	const { id } = await f.create();
	f.state.acknowledged = false;
	await assert.rejects(f.prepare(id), { extensions: { code: 'SERVICE_UNAVAILABLE' } });
	assert.equal(f.records[0].status, 'CREATED');
	f.state.acknowledged = true;
	await f.prepare(id);
	f.state.acknowledged = false;
	await assert.rejects(f.complete(id, 'SAVED'));
	assert.equal(f.records[0].status, 'PREPARED');
	for (const failure of ['acknowledged', 'throwWrite']) {
		const next = fixture();
		next.state[failure] = failure === 'throwWrite';
		await assert.rejects(next.create(), { extensions: { code: 'SERVICE_UNAVAILABLE' } });
		assert.equal(next.records.length, 0);
	}
});

test('conditional updates prevent racing requests from replacing sealed artifacts or outcomes', async () => {
	const f = fixture();
	const { id } = await f.create();
	f.state.race = (row) =>
		Object.assign(row, { status: 'PREPARED', sizeBytes: 99, sha256: 'b'.repeat(64), rowCount: 3 });
	await assert.rejects(f.prepare(id));
	assert.equal(f.records[0].sizeBytes, 99);
	f.state.race = (row) => Object.assign(row, { status: 'CANCELLED' });
	await assert.rejects(f.complete(id, 'SAVED'));
	assert.equal(f.records[0].status, 'CANCELLED');
});

test('audit reads require administrator role and search is bounded/literal, with exact ID/hash lookup', async () => {
	const f = fixture();
	const { id } = await f.create({ fileName: 'literal[1].csv' });
	await f.prepare(id);
	for (const role of ['user', 'manager']) {
		f.context.security = actor('reader', role);
		await assert.rejects(f.read(), { extensions: { code: 'FORBIDDEN', http: { status: 403 } } });
	}
	for (const role of ['admin', 'super-admin']) {
		f.context.security = actor('reader', role);
		const page = await f.read({ search: id });
		assert.equal(page.total, 1);
		assert.equal(page.records[0].id, id);
		assert.equal(typeof page.records[0].createdAt, 'number');
		assert.equal((await f.read({ search: 'A'.repeat(64) })).total, 1);
		assert.equal((await f.read({ search: '.*' })).total, 0);
		assert.equal((await f.read({ search: 'alice' })).total, 1);
		assert.equal((await f.read({ offset: 1 })).records.length, 0);
	}
	for (const args of [{ offset: -1 }, { limit: 101 }, { limit: 0 }, { search: 'x'.repeat(201) }])
		await assert.rejects(f.read(args));
});

test('audit collection cannot be queried through clinical filters, options, or generic counts', async () => {
	const control = createAccessControl();
	const guarded = control.protectResolvers([
		{
			Query: {
				getTableCount: () => assert.fail('private count called'),
				getValueOptions: () => assert.fail('private values called')
			}
		}
	])[0];
	const f = fixture(actor('root', 'super-admin'));
	await assert.rejects(guarded.Query.getTableCount(null, { collection: 'exportAudit' }, f.context));
	await assert.rejects(
		guarded.Query.getValueOptions(null, { collection: 'exportAudit', field: 'userId' }, f.context)
	);
});

test('GraphQL contract exposes metadata while rejecting caller-supplied user/time and file bytes', async () => {
	const f = fixture();
	const server = new ApolloServer({
		typeDefs: [
			'type Query { ping: Boolean } type Mutation { ping: Boolean } type Patientinformation { firstName: String lastName: String }',
			schema
		],
		resolvers: createAccessControl().protectResolvers([audit]),
		includeStacktraceInErrorResponses: false
	});
	try {
		const query =
			'mutation($input: ExportAuditInput!) { createExportAudit(input:$input) { id fileName createdAt } }';
		const ok = await server.executeOperation(
			{ query, variables: { input: input() } },
			{ contextValue: f.context }
		);
		assert.equal(ok.body.singleResult.errors, undefined);
		assert.match(ok.body.singleResult.data.createExportAudit.id, /^[a-f0-9]{24}$/);
		const denied = await server.executeOperation(
			{
				query,
				variables: { input: input({ userId: 'forged', createdAt: 1, contents: 'patient data' }) }
			},
			{ contextValue: f.context }
		);
		assert.ok(denied.body.singleResult.errors.length);
		assert.equal(f.records.length, 1);
	} finally {
		await server.stop();
	}
});
