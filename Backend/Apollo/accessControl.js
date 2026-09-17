const { GraphQLError } = require('graphql');
const { filter2match } = require('./astTranslator');

const PUBLIC_QUERIES = new Set(['getPlatformConfiguration', 'getPlatformDocument']);
const MANAGEMENT_QUERIES = new Set([
	'getUsageByUser',
	'getUsageTimeline',
	'getUsageByModule',
	'getUsageReport',
	'dbmeta'
]);
const ROLES = new Set(['user', 'manager', 'admin', 'super-admin']);
const SELF_FIELDS = new Set([
	'language',
	'colorTheme',
	'colorPalette',
	'darkMode',
	'chartShowTop5',
	'chartHideNullValues',
	'firstLogin',
	'lastLogin',
	'lastModifiedBy'
]);

const securityError = (message, status = 403) =>
	new GraphQLError(message, {
		extensions: {
			code:
				status === 401 ? 'UNAUTHENTICATED' : status === 503 ? 'SERVICE_UNAVAILABLE' : 'FORBIDDEN',
			http: { status }
		}
	});

const requireUser = (security) => {
	if (!security || security.anonymous) throw securityError('Authentication required', 401);
	return security;
};

const isAdministrator = (security) => ['admin', 'super-admin'].includes(security?.role);
const isManager = (security) => ['manager', 'admin', 'super-admin'].includes(security?.role);
const PRIVATE_COLLECTIONS = new Set([
	'user',
	'usageEvent',
	'platformDocument',
	'platformConfiguration'
]);
const IDENTITY_FIELDS = new Set(['firstName', 'lastName']);

function clinicalCollections(context) {
	return new Set(
		[
			...Object.values(context.collections),
			'histology',
			'operation',
			'systemic',
			'radiation'
		].filter((name) => !PRIVATE_COLLECTIONS.has(name))
	);
}

function parseClinicalFilter(raw, context) {
	if (raw == null || raw === '') return null;
	if (typeof raw !== 'string' || raw.length > 250000) throw securityError('Invalid data filter');
	let ast;
	try {
		ast = JSON.parse(raw);
	} catch {
		throw securityError('Invalid data filter');
	}
	const collections = clinicalCollections(context);
	let nodes = 0;
	let leaves = 0;
	function visit(node, depth = 0) {
		if (!node || typeof node !== 'object' || Array.isArray(node) || ++nodes > 2000 || depth > 20) {
			throw securityError('Invalid data filter');
		}
		if ('children' in node) {
			if (!['AND', 'OR', 'NOR', 'XOR'].includes(node.operand) || !Array.isArray(node.children)) {
				throw securityError('Invalid data filter');
			}
			node.children.forEach((child) => visit(child, depth + 1));
		} else {
			if (
				!collections.has(node.system) ||
				typeof node.key !== 'string' ||
				!/^!?[A-Za-z_][A-Za-z0-9_.]*$/.test(node.key) ||
				!['EQUALS', 'NEQUALS', 'BETWEEN', 'NBETWEEN'].includes(node.type)
			) {
				throw securityError('Invalid data filter');
			}
			if (
				context.security?.user?.pseudonymization &&
				IDENTITY_FIELDS.has(node.key.replace(/^!/, ''))
			) {
				throw securityError('Patient names are not available to this account');
			}
			leaves++;
		}
	}
	visit(ast);
	return leaves ? ast : null;
}

/**
 * The identity provider validates tokens; role/status come from the server-side
 * OVIS user record. Browser flags, caller-supplied usernames and JWT payloads are
 * never trusted as an identity or permission source.
 */
function createAccessControl({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
	const demo =
		env.OVIS_IMPORT_MODE?.toLowerCase() === 'demo' && env.PUBLIC_LOGIN_ENABLED === 'false';
	const base = (env.KEYCLOAK_URL || 'http://keycloak:8080/keycloak').replace(/\/$/, '');
	const realm = env.KEYCLOAK_REALM || 'ovis';
	const clientId = env.KEYCLOAK_CLIENT_ID || 'ovis_client';
	const oidc = `${base}/realms/${encodeURIComponent(realm)}/protocol/openid-connect`;

	async function providerJson(url, options) {
		let response;
		try {
			response = await fetchImpl(url, {
				...options,
				redirect: 'error',
				signal: AbortSignal.timeout(5000)
			});
		} catch {
			throw securityError('Identity provider unavailable', 503);
		}
		if (response.status === 401 || response.status === 403) {
			throw securityError('Invalid access token', 401);
		}
		if (!response.ok) throw securityError('Identity provider unavailable', 503);
		try {
			return await response.json();
		} catch {
			throw securityError('Invalid identity provider response', 503);
		}
	}

	async function authenticate(req, db, collections) {
		const header = req.headers?.authorization;
		if (header === undefined) {
			return { security: { anonymous: true, demo, role: 'demo', userId: null } };
		}
		const match = typeof header === 'string' && /^Bearer ([^\s,]+)$/i.exec(header);
		if (!match || match[1].length > 16384) throw securityError('Invalid authorization header', 401);
		if (!env.KEYCLOAK_CLIENT_SECRET)
			throw securityError('Identity provider is not configured', 503);
		const token = match[1];
		const claims = await providerJson(`${oidc}/token/introspect`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
			body: new URLSearchParams({
				client_id: clientId,
				client_secret: env.KEYCLOAK_CLIENT_SECRET,
				token,
				token_type_hint: 'access_token'
			})
		});
		if (
			claims.active !== true ||
			typeof claims.sub !== 'string' ||
			!claims.sub ||
			(claims.client_id || claims.azp) !== clientId ||
			!Number.isFinite(claims.exp) ||
			claims.exp <= Date.now() / 1000 ||
			(env.KEYCLOAK_ISSUER && claims.iss !== env.KEYCLOAK_ISSUER)
		) {
			throw securityError('Invalid access token', 401);
		}
		// Introspection can also accept refresh tokens. Userinfo specifically
		// requires an access token, and must identify the same subject.
		const info = await providerJson(`${oidc}/userinfo`, {
			method: 'GET',
			headers: { authorization: `Bearer ${token}`, accept: 'application/json' }
		});
		if (
			info.sub !== claims.sub ||
			typeof info.preferred_username !== 'string' ||
			!info.preferred_username
		) {
			throw securityError('Invalid access token identity', 401);
		}
		const user = await db.collection(collections.usr).findOne({ _id: info.preferred_username });
		if (!user || user.status !== 'active' || !ROLES.has(user.role)) {
			throw securityError('OVIS account is not active');
		}
		return {
			security: {
				anonymous: false,
				demo: false,
				userId: String(user._id),
				sub: info.sub,
				role: user.role,
				user
			}
		};
	}

	function requireRead(security) {
		if (security?.anonymous && security.demo) return;
		requireUser(security);
	}

	async function clinicalArguments(field, args, context, info) {
		if (
			context.security?.user?.pseudonymization &&
			(IDENTITY_FIELDS.has(args.sortField) ||
				args.columnFilters?.some((entry) => IDENTITY_FIELDS.has(entry.field)))
		)
			throw securityError('Patient names are not available to this account');
		const stored = context.security?.user?.userFilter;
		const assigned = Array.isArray(stored) ? stored[stored.length - 1] : stored;
		const mandatory = parseClinicalFilter(assigned, context);
		const requested = parseClinicalFilter(args.filter, context);
		const merged =
			mandatory && requested
				? { operand: 'AND', children: [mandatory, requested] }
				: mandatory || requested;
		if (!merged) return args;
		if (['getPatientSingleHeader', 'getPatientOverview'].includes(field)) {
			const stages = await filter2match({
				value: JSON.stringify(merged),
				column: 'patient',
				db: context.db
			});
			const permitted = await context.db
				.collection('patient')
				.aggregate([{ $match: { patID: args.patID } }, ...stages, { $limit: 1 }])
				.next();
			if (!permitted) throw securityError('Patient is outside the permitted cohort');
			// A permitted patient may also have tumors outside the assigned cohort.
			// Detail resolvers must retain the validated filter when loading their
			// diagnoses and tumor-related events, not only check patient membership.
			return { ...args, filter: JSON.stringify(merged) };
		}
		const acceptsFilter = info?.parentType
			?.getFields()
			?.[field]?.args?.some((arg) => arg.name === 'filter');
		if (acceptsFilter || field === 'getValueOptions')
			return { ...args, filter: JSON.stringify(merged) };
		if (field === 'getLastMetaData') return args; // Import timestamp contains no patient data.
		throw securityError('This operation does not support the assigned data restriction');
	}

	async function authorizeUserChange(field, args, context) {
		const actor = requireUser(context.security);
		const users = context.db.collection(context.collections.usr);
		if (
			field === 'updateUser' &&
			args.id === actor.userId &&
			args.input &&
			Object.keys(args.input).every((key) => SELF_FIELDS.has(key))
		) {
			return { ...args, input: { ...args.input, lastModifiedBy: actor.userId } };
		}
		if (!isAdministrator(actor)) throw securityError('Administrator permission required');
		if (field === 'createUser') {
			const input = args.input;
			if (!input || typeof input._id !== 'string' || !input._id.trim() || !ROLES.has(input.role)) {
				throw securityError('A valid user identifier and role are required');
			}
			if (actor.role !== 'super-admin' && ['admin', 'super-admin'].includes(input.role)) {
				throw securityError('Only a super-admin may assign administrator roles');
			}
			return {
				...args,
				input: {
					...input,
					createdAt: Date.now(),
					createdBy: actor.userId,
					lastModifiedBy: actor.userId
				}
			};
		}
		const ids = field === 'deleteUser' ? args.users : [args.id];
		if (!Array.isArray(ids) || !ids.length || ids.some((id) => typeof id !== 'string' || !id)) {
			throw securityError('A user identifier is required');
		}
		for (const id of ids) {
			const target = await users.findOne({ _id: id });
			if (
				target?.role === 'super-admin' ||
				(target?.role === 'admin' && actor.role !== 'super-admin')
			) {
				throw securityError('This administrator account cannot be changed');
			}
		}
		if (field === 'updateUser') {
			if (
				!args.input ||
				'_id' in args.input ||
				'createdBy' in args.input ||
				'createdAt' in args.input
			) {
				throw securityError('User identity and creation metadata cannot be changed');
			}
			if (
				'role' in args.input &&
				(!ROLES.has(args.input.role) ||
					(actor.role !== 'super-admin' && ['admin', 'super-admin'].includes(args.input.role)))
			) {
				throw securityError('This role cannot be assigned');
			}
			return { ...args, input: { ...args.input, lastModifiedBy: actor.userId } };
		}
		return args;
	}

	function protectResolvers(resolverMaps) {
		const protectedMaps = resolverMaps.map((map) =>
			Object.fromEntries(
				Object.entries(map).map(([type, fields]) => {
					if (!['Query', 'Mutation', 'Subscription'].includes(type)) return [type, fields];
					return [
						type,
						Object.fromEntries(
							Object.entries(fields).map(([field, resolver]) => [
								field,
								async (parent, args, context, info) => {
									const security = context.security;
									if (type === 'Query' && PUBLIC_QUERIES.has(field))
										return resolver(parent, args, context, info);
									requireRead(security);
									if (type === 'Query') {
										if (field === 'getUser') {
											requireUser(security);
											if (!isManager(security)) return [security.user];
										}
										if (MANAGEMENT_QUERIES.has(field) && !isManager(security)) {
											throw securityError('Management permission required');
										}
										if (!MANAGEMENT_QUERIES.has(field) && field !== 'getUser') {
											if (
												field === 'getValueOptions' &&
												(!clinicalCollections(context).has(args.collection) ||
													typeof args.field !== 'string' ||
													!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(args.field) ||
													(security.user?.pseudonymization && IDENTITY_FIELDS.has(args.field)))
											) {
												throw securityError('These value options are not available');
											}
											args = await clinicalArguments(field, args, context, info);
										}
										return resolver(parent, args, context, info);
									}
									requireUser(security);
									if (['createUser', 'updateUser', 'deleteUser'].includes(field)) {
										args = await authorizeUserChange(field, args, context);
									} else if (field === 'recordUsageEvents') {
										if (args.events?.some((event) => event.userId !== security.userId)) {
											throw securityError('Usage events may only refer to the authenticated user');
										}
										args = {
											...args,
											events: args.events?.map((event) => ({ ...event, timestamp: Date.now() }))
										};
									} else if (
										['updatePlatformConfiguration', 'uploadPlatformDocument'].includes(field)
									) {
										if (!isManager(security)) throw securityError('Management permission required');
										args = { ...args, input: { ...args.input, updatedBy: security.userId } };
									} else {
										// New mutations need an explicit policy instead of inheriting access.
										throw securityError('Operation has no authorization policy');
									}
									return resolver(parent, args, context, info);
								}
							])
						)
					];
				})
			)
		);
		protectedMaps.push({
			Patientinformation: Object.fromEntries(
				[...IDENTITY_FIELDS].map((field) => [
					field,
					(patient, _args, context) =>
						context.security?.user?.pseudonymization ? null : patient[field]
				])
			)
		});
		return protectedMaps;
	}

	function sessionHandler(db, collections) {
		return async (req, res) => {
			res.setHeader('Cache-Control', 'no-store');
			try {
				const { security } = await authenticate(req, db, collections);
				requireRead(security);
				const stored = security.user?.userFilter;
				const assigned = Array.isArray(stored) ? stored[stored.length - 1] : stored;
				const cohortRestricted = Boolean(parseClinicalFilter(assigned, { security, collections }));
				res.json({
					userId: security.userId,
					sub: security.sub || null,
					role: security.role,
					anonymous: security.anonymous,
					cohortRestricted,
					pseudonymization: Boolean(security.user?.pseudonymization)
				});
			} catch (error) {
				res.status(error.extensions?.http?.status || 503).json({ error: error.message });
			}
		};
	}

	return { authenticate, protectResolvers, sessionHandler };
}

module.exports = { createAccessControl };
