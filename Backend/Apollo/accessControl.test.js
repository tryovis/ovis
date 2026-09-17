const assert = require('node:assert/strict');
const test = require('node:test');
const { ApolloServer } = require('@apollo/server');
const { createAccessControl } = require('./accessControl');
const userResolvers = require('./resolver/resolver');

const collections = { usr: 'user', patient: 'patient', diagnosis: 'diagnosis', therapy: 'therapy' };
const user = (id, role = 'user', extra = {}) => ({ _id: id, role, status: 'active', ...extra });
const env = {
	OVIS_IMPORT_MODE: 'credos',
	PUBLIC_LOGIN_ENABLED: 'false',
	KEYCLOAK_URL: 'http://identity.test.invalid',
	KEYCLOAK_CLIENT_SECRET: 'synthetic-test-secret'
};
const match = (row, query = {}) =>
	Object.entries(query).every(([key, value]) => {
		if (key === '$and') return value.every((part) => match(row, part));
		if (key === '$or') return value.some((part) => match(row, part));
		if (value && typeof value === 'object' && '$eq' in value) return row[key] === value.$eq;
		if (value && typeof value === 'object' && '$in' in value) return value.$in.includes(row[key]);
		return row[key] === value;
	});

function fixture(options = {}) {
	const rows = {
		user: [
			user('alice'),
			user('bob'),
			user('manager', 'manager'),
			user('admin', 'admin'),
			user('root', 'super-admin')
		],
		patient: [
			{ patID: 'p1', firstName: 'Synthetic', lastName: 'One' },
			{ patID: 'p2', firstName: 'Synthetic', lastName: 'Two' }
		],
		diagnosis: [
			{ patID: 'p1', tumorID: 't1' },
			{ patID: 'p2', tumorID: 't2' }
		]
	};
	const writes = [];
	const db = {
		collection(name) {
			const data = rows[name] || [];
			return {
				findOne: async (query) => data.find((row) => match(row, query)) || null,
				distinct: async (field, query = {}) => [
					...new Set(data.filter((row) => match(row, query)).map((row) => row[field]))
				],
				aggregate(stages) {
					let result = data;
					for (const stage of stages) {
						if (stage.$match) result = result.filter((row) => match(row, stage.$match));
						else if (stage.$limit) result = result.slice(0, stage.$limit);
						else if (stage.$sort) continue;
						else throw new Error(`Unsupported synthetic DB stage: ${Object.keys(stage)}`);
					}
					return { toArray: async () => result, next: async () => result[0] || null };
				},
				insertOne: async (input) => {
					writes.push(input);
					return { acknowledged: true, insertedId: input._id };
				},
				updateOne: async (query, update) => {
					writes.push({ query, update });
					return { acknowledged: true, modifiedCount: 1 };
				},
				deleteMany: async (query) => {
					writes.push(query);
					return { acknowledged: true, deletedCount: 1 };
				}
			};
		}
	};
	const calls = [];
	const fetchImpl = async (url, init) => {
		calls.push({ url, init });
		if (options.providerDown) throw new Error('synthetic provider outage');
		const token = url.endsWith('/userinfo')
			? init.headers.authorization.slice(7)
			: init.body.get('token');
		const id = token.replace('valid-', '');
		if (url.endsWith('/userinfo')) {
			return new Response(
				JSON.stringify({
					sub: options.wrongSubject ? 'other' : `subject-${id}`,
					preferred_username: id
				}),
				{ status: 200 }
			);
		}
		return new Response(
			JSON.stringify({
				active: token.startsWith('valid-'),
				sub: `subject-${id}`,
				client_id: options.clientId || 'ovis_client',
				exp: options.exp || Math.floor(Date.now() / 1000) + 300
			}),
			{ status: 200 }
		);
	};
	const control = createAccessControl({ env: { ...env, ...options.env }, fetchImpl });
	const context = async (id) => ({
		db,
		collections,
		...(await control.authenticate(
			{ headers: id ? { authorization: `Bearer valid-${id}` } : {} },
			db,
			collections
		))
	});
	return { rows, db, writes, calls, control, context };
}

const info = (field) => ({
	parentType: { getFields: () => ({ [field]: { args: [{ name: 'filter' }] } }) }
});
const denied = (fn, code = 'FORBIDDEN') =>
	assert.rejects(fn, (error) => error.extensions?.code === code);

test('clinical data requires authentication even when the old UI login flag is false', async () => {
	const f = fixture();
	const guarded = f.control.protectResolvers([userResolvers])[0];
	await denied(
		() => guarded.Query.getAllPatient(null, {}, { db: f.db, collections }, info('getAllPatient')),
		'UNAUTHENTICATED'
	);
	await denied(
		async () => guarded.Query.getAllPatient(null, {}, await f.context(), info('getAllPatient')),
		'UNAUTHENTICATED'
	);
	assert.equal(f.writes.length, 0);
});

test('only explicitly selected anonymous demo permits reads and never user administration', async () => {
	const f = fixture({ env: { OVIS_IMPORT_MODE: 'demo', PUBLIC_LOGIN_ENABLED: 'false' } });
	const guarded = f.control.protectResolvers([userResolvers])[0];
	const context = await f.context();
	assert.equal(
		(await guarded.Query.getAllPatient(null, { limit: 1 }, context, info('getAllPatient'))).length,
		1
	);
	await denied(
		() => guarded.Mutation.createUser(null, { input: user('new') }, context),
		'UNAUTHENTICATED'
	);
	await denied(() => guarded.Query.getUser(null, {}, context), 'UNAUTHENTICATED');
	const loginDemo = fixture({ env: { OVIS_IMPORT_MODE: 'demo', PUBLIC_LOGIN_ENABLED: 'true' } });
	await denied(
		async () =>
			loginDemo.control
				.protectResolvers([userResolvers])[0]
				.Query.getAllPatient(null, {}, await loginDemo.context()),
		'UNAUTHENTICATED'
	);
});

test('tokens must be active, unexpired, for this client, and identify the same user at both provider endpoints', async () => {
	const invalid = fixture();
	await denied(
		() =>
			invalid.control.authenticate(
				{ headers: { authorization: 'Bearer invalid-token' } },
				invalid.db,
				collections
			),
		'UNAUTHENTICATED'
	);
	for (const options of [{ clientId: 'different-client' }, { exp: 1 }, { wrongSubject: true }]) {
		const f = fixture(options);
		await denied(() => f.context('alice'), 'UNAUTHENTICATED');
	}
	const outage = fixture({ providerDown: true });
	await denied(() => outage.context('alice'), 'SERVICE_UNAVAILABLE');
	const missing = fixture({ env: { KEYCLOAK_CLIENT_SECRET: '' } });
	await denied(() => missing.context('alice'), 'SERVICE_UNAVAILABLE');
});

test('disabled, unregistered and unknown-role accounts are denied despite a valid identity token', async () => {
	const f = fixture();
	f.rows.user[0].status = 'inactive';
	await denied(() => f.context('alice'));
	await denied(() => f.context('unregistered'));
	f.rows.user[1].role = 'unexpected';
	await denied(() => f.context('bob'));
});

test('normal users read only their own user record regardless of supplied filters', async () => {
	const f = fixture();
	const guarded = f.control.protectResolvers([userResolvers])[0];
	const result = await guarded.Query.getUser(
		null,
		{ filter: '{}', limit: 999 },
		await f.context('alice')
	);
	assert.deepEqual(
		result.map((row) => row._id),
		['alice']
	);
	const administrators = await guarded.Query.getUser(null, {}, await f.context('admin'));
	assert.equal(administrators.length, 5);
});

test('self-service preferences work; changing permissions, restrictions, identity or another account is denied', async () => {
	const f = fixture();
	const guarded = f.control.protectResolvers([userResolvers])[0];
	const context = await f.context('alice');
	await guarded.Mutation.updateUser(
		null,
		{ id: 'alice', input: { darkMode: true, lastModifiedBy: 'not-trusted' } },
		context
	);
	assert.equal(f.writes[0].update.$set.lastModifiedBy, 'alice');
	for (const input of [
		{ role: 'admin' },
		{ status: 'active' },
		{ userFilter: [] },
		{ pseudonymization: false },
		{ _id: 'bob' }
	]) {
		await denied(() => guarded.Mutation.updateUser(null, { id: 'alice', input }, context));
	}
	await denied(() =>
		guarded.Mutation.updateUser(null, { id: 'bob', input: { darkMode: true } }, context)
	);
	await denied(() => guarded.Mutation.deleteUser(null, { users: ['bob'] }, context));
	assert.equal(f.writes.length, 1);
});

test('administrator hierarchy is checked at the server for create, change and delete', async () => {
	const f = fixture();
	const guarded = f.control.protectResolvers([userResolvers])[0];
	const admin = await f.context('admin');
	await guarded.Mutation.createUser(null, { input: user('new', 'manager') }, admin);
	await denied(() =>
		guarded.Mutation.createUser(null, { input: user('new-admin', 'admin') }, admin)
	);
	await denied(() =>
		guarded.Mutation.updateUser(null, { id: 'bob', input: { role: 'super-admin' } }, admin)
	);
	await denied(() => guarded.Mutation.deleteUser(null, { users: ['root'] }, admin));
	await denied(() => guarded.Mutation.deleteUser(null, { users: ['admin'] }, admin));
	await guarded.Mutation.createUser(
		null,
		{ input: user('new-admin', 'admin') },
		await f.context('root')
	);
	assert.equal(f.writes.length, 2);
});

test('assigned cohort filters remain mandatory when the request omits or broadens its filter', async () => {
	const f = fixture();
	const mandatory = {
		operand: 'AND',
		children: [{ system: 'patient', key: 'patID', type: 'EQUALS', value: 'p1' }]
	};
	f.rows.user[0].userFilter = [JSON.stringify(mandatory)];
	const guarded = f.control.protectResolvers([userResolvers])[0];
	const context = await f.context('alice');
	const omitted = await guarded.Query.getAllPatient(null, {}, context, info('getAllPatient'));
	assert.deepEqual(
		omitted.map((row) => row.patID),
		['p1']
	);
	const broad = JSON.stringify({
		operand: 'OR',
		children: [mandatory.children[0], { ...mandatory.children[0], value: 'p2' }]
	});
	const widened = await guarded.Query.getAllPatient(
		null,
		{ filter: broad },
		context,
		info('getAllPatient')
	);
	assert.deepEqual(
		widened.map((row) => row.patID),
		['p1']
	);
	await denied(() =>
		guarded.Query.getAllPatient(null, { filter: '{broken' }, context, info('getAllPatient'))
	);
});

test('C30-C39 remains mandatory when personal C34 and year filters are added, removed or OR-expanded', async () => {
	const f = fixture();
	const mandatory = {
		operand: 'AND',
		children: [{ system: 'diagnosis', key: 'ICD_ICD10Group', type: 'EQUALS', value: 'C30-C39' }]
	};
	const lung = { system: 'diagnosis', key: 'ICD_ICD10_3', type: 'EQUALS', value: 'C34' };
	const year = {
		system: 'diagnosis', key: 'diagnosisDate', type: 'BETWEEN',
		value: { min: Date.UTC(2026, 0, 1), max: Date.UTC(2027, 0, 1) - 1 }
	};
	const narrowed = { operand: 'AND', children: [lung, year] };
	const broadened = {
		operand: 'OR',
		children: [narrowed, { ...lung, value: 'C50' }]
	};
	const storedFilter = JSON.stringify(mandatory);
	f.rows.user[0].userFilter = [storedFilter];
	const context = await f.context('alice');
	const captured = [];
	// Capture the arguments passed through the real authorization wrapper rather than
	// simulating cross-collection diagnosis filtering in the fixture database.
	const guarded = f.control.protectResolvers([{
		Query: {
			getTumors: (_parent, args) => {
				captured.push(structuredClone(args));
				return [];
			}
		}
	}])[0];
	const requests = [
		{ label: 'C34 and year', requested: narrowed },
		{ label: 'year after removing C34', requested: year },
		{ label: 'C34 after removing year', requested: lung },
		{ label: 'OR-expanded personal selection', requested: broadened },
		{ label: 'all personal filters removed', requested: null },
		{ label: 'empty personal query tree', requested: { operand: 'OR', children: [] } }
	];
	for (const { label, requested } of requests) {
		const args = { limit: 25, ...(requested ? { filter: JSON.stringify(requested) } : {}) };
		const originalArgs = structuredClone(args);
		await guarded.Query.getTumors(null, args, context, info('getTumors'));
		const effective = captured.at(-1);
		const hasPersonalCriterion = requested && requested.children?.length !== 0;
		assert.deepEqual(JSON.parse(effective.filter), hasPersonalCriterion
			? { operand: 'AND', children: [mandatory, requested] }
			: mandatory, label);
		assert.equal(effective.limit, 25);
		assert.deepEqual(args, originalArgs, 'the caller query must remain separate from the assignment');
		assert.deepEqual(context.security.user.userFilter, [storedFilter]);
	}
	assert.equal(captured.length, requests.length);
	assert.equal(f.writes.length, 0);
});

test('direct patient detail requests respect the assigned cohort', async () => {
	const f = fixture();
	f.rows.user[0].userFilter = [
		JSON.stringify({
			operand: 'AND',
			children: [{ system: 'patient', key: 'patID', type: 'EQUALS', value: 'p1' }]
		})
	];
	let accessed = 0;
	let detailArguments;
	const guarded = f.control.protectResolvers([
		{
			Query: {
				getPatientSingleHeader: (_parent, args) => {
					accessed++;
					detailArguments = args;
					return {};
				}
			}
		}
	])[0];
	const context = await f.context('alice');
	await denied(() => guarded.Query.getPatientSingleHeader(null, { patID: 'p2' }, context));
	assert.equal(accessed, 0);
	await guarded.Query.getPatientSingleHeader(null, { patID: 'p1' }, context);
	assert.equal(accessed, 1);
	assert.deepEqual(JSON.parse(detailArguments.filter), JSON.parse(f.rows.user[0].userFilter[0]),
		'the detail resolver must receive the restriction for related tumor data');
	assert.equal(detailArguments.patID, 'p1');
});

test('value options cannot enumerate administrative collections or hidden patient names', async () => {
	const f = fixture();
	f.rows.user[0].pseudonymization = true;
	const guarded = f.control.protectResolvers([{ Query: { getValueOptions: () => [] } }])[0];
	const context = await f.context('alice');
	await denied(() =>
		guarded.Query.getValueOptions(null, { collection: 'user', field: 'email' }, context)
	);
	await denied(() =>
		guarded.Query.getValueOptions(null, { collection: 'patient', field: 'firstName' }, context)
	);
});

test('patient names cannot be used as column predicates or sort keys when hidden', async () => {
	const f = fixture();
	f.rows.user[0].pseudonymization = true;
	const guarded = f.control.protectResolvers([userResolvers])[0];
	const context = await f.context('alice');
	await denied(() =>
		guarded.Query.getAllPatient(
			null,
			{ columnFilters: [{ field: 'firstName', value: 'Synthetic' }] },
			context,
			info('getAllPatient')
		)
	);
	await denied(() =>
		guarded.Query.getAllPatient(null, { sortField: 'lastName' }, context, info('getAllPatient'))
	);
});

test('the session endpoint reports verified cohort and name-visibility policy', async () => {
	const f = fixture();
	f.rows.user[0].userFilter = [
		JSON.stringify({
			operand: 'AND',
			children: [{ system: 'patient', key: 'patID', type: 'EQUALS', value: 'p1' }]
		})
	];
	f.rows.user[0].pseudonymization = true;
	let body;
	let cache;
	await f.control.sessionHandler(f.db, collections)(
		{ headers: { authorization: 'Bearer valid-alice' } },
		{
			setHeader(_key, value) {
				cache = value;
			},
			json(value) {
				body = value;
			},
			status() {
				throw new Error('unexpected denial');
			}
		}
	);
	assert.equal(body.userId, 'alice');
	assert.equal(body.cohortRestricted, true);
	assert.equal(body.pseudonymization, true);
	assert.equal(body.anonymous, false);
	assert.equal(cache, 'no-store');
});

test('GraphQL aliases and fragments cannot bypass patient-name redaction or user-write policy', async () => {
	const f = fixture();
	f.rows.user[0].pseudonymization = true;
	const server = new ApolloServer({
		typeDefs: `type Patientinformation { patID: String firstName: String lastName: String }
			type Query { getAllPatient(filter: String): [Patientinformation] }
			type Mutation { deleteUser(users: [String!]!): Boolean }`,
		resolvers: f.control.protectResolvers([
			{
				Query: { getAllPatient: () => f.rows.patient },
				Mutation: {
					deleteUser: () => {
						f.writes.push('unexpected');
						return true;
					}
				}
			}
		])
	});
	try {
		const result = await server.executeOperation(
			{
				query:
					'{ patients: getAllPatient { ...Names } } fragment Names on Patientinformation { name:firstName lastName patID }'
			},
			{ contextValue: await f.context('alice') }
		);
		assert.equal(result.body.kind, 'single');
		assert.equal(result.body.singleResult.data.patients[0].name, null);
		assert.equal(result.body.singleResult.data.patients[0].lastName, null);
		const deniedResult = await server.executeOperation(
			{ query: 'mutation { hidden:deleteUser(users:["bob"]) }' },
			{ contextValue: await f.context('alice') }
		);
		assert.equal(deniedResult.body.singleResult.errors[0].extensions.code, 'FORBIDDEN');
		assert.equal(f.writes.length, 0);
	} finally {
		await server.stop();
	}
});

test('public legal configuration works before login; unknown mutations and forged usage ownership are denied', async () => {
	const f = fixture();
	const guarded = f.control.protectResolvers([
		{
			Query: { getPlatformConfiguration: () => ({ language: 'de' }) },
			Mutation: { futureAdminAction: () => true, recordUsageEvents: () => true }
		}
	])[0];
	assert.deepEqual(await guarded.Query.getPlatformConfiguration(null, {}, await f.context()), {
		language: 'de'
	});
	await denied(async () => guarded.Mutation.futureAdminAction(null, {}, await f.context('root')));
	await denied(async () =>
		guarded.Mutation.recordUsageEvents(
			null,
			{ events: [{ userId: 'bob' }] },
			await f.context('alice')
		)
	);
});
