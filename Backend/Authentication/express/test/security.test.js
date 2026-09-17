import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import routes from '../src/routes/keycloakRoutes.js';
import { createRateLimit } from '../src/middleware/rateLimit.js';

// All identities and Keycloak responses are synthetic. No real identity provider is contacted.
const realFetch = globalThis.fetch;
const previousEnv = { ...process.env };
let server;
let origin;
let upstreamCalls = [];
let sessionFailure = false;
const json = (body, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

before(async () => {
	process.env.OVIS_AUTH_SESSION_URL = 'http://session.invalid/auth/session';
	process.env.KEYCLOAK_URL = 'http://identity.invalid';
	process.env.KEYCLOAK_REALM = 'synthetic';
	process.env.KEYCLOAK_CLIENT_ID = 'synthetic-client';
	process.env.KEYCLOAK_CLIENT_SECRET = 'synthetic-client-secret';
	process.env.KEYCLOAK_ADMIN_CLIENT_ID = 'synthetic-admin';
	process.env.KEYCLOAK_ADMIN_CLIENT_SECRET = 'synthetic-admin-secret';
	globalThis.fetch = async (url, options = {}) => {
		upstreamCalls.push({ url: String(url), options });
		if (String(url).startsWith('http://session.invalid/')) {
			if (sessionFailure) throw new Error('Synthetic outage');
			const token = options.headers.Authorization;
			if (token === 'Bearer anonymous-token') return json({ anonymous: true, role: 'demo' });
			if (token === 'Bearer malformed-session') return json({ anonymous: false, role: 'admin' });
			const role = {
				'Bearer admin-token': 'admin',
				'Bearer super-token': 'super-admin',
				'Bearer user-token': 'user'
			}[token];
			if (!role) return json({ error: 'Invalid token' }, 401);
			return json({ sub: 'subject-123', userId: 'alice', role, anonymous: false });
		}
		assert.ok(String(url).startsWith('http://identity.invalid/'), 'Unexpected upstream URL');
		if (String(url).endsWith('/token'))
			return json({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' });
		if (String(url).includes('/users?')) {
			const email = new URL(url).searchParams.get('email');
			return json(email?.startsWith('known') ? [{ id: 'subject-123', email, enabled: true }] : []);
		}
		if (String(url).endsWith('/users/subject-123') && options.method !== 'PUT') {
			return json({
				id: 'subject-123',
				email: 'alice@example.invalid',
				attributes: { ovisFilter: ['restricted'] }
			});
		}
		if (String(url).endsWith('/users') && options.method === 'POST')
			return new Response(null, { status: 201 });
		if (options.method === 'PUT') return new Response(null, { status: 204 });
		throw new Error(`Unmocked test request: ${url}`);
	};
	const app = express();
	app.use(express.json({ limit: '64kb' }));
	app.use('/api/keycloak', routes);
	server = app.listen(0, '127.0.0.1');
	await once(server, 'listening');
	origin = `http://127.0.0.1:${server.address().port}/api/keycloak`;
});

after(async () => {
	globalThis.fetch = realFetch;
	for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
	Object.assign(process.env, previousEnv);
	if (server) await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
	upstreamCalls = [];
	sessionFailure = false;
});

const request = (path, body, authorization, method = 'POST') =>
	realFetch(`${origin}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			...(authorization ? { Authorization: authorization } : {})
		},
		body: JSON.stringify(body)
	});

for (const [name, authorization, status] of [
	['missing token', undefined, 401],
	['shared Basic credentials', 'Basic synthetic', 401],
	['forged token', 'Bearer forged', 401],
	['expired token', 'Bearer expired', 401],
	['ordinary user', 'Bearer user-token', 403],
	['anonymous demo', 'Bearer anonymous-token', 403],
	['malformed identity response', 'Bearer malformed-session', 403]
]) {
	test(`createuser rejects ${name} without identity-provider mutation`, async () => {
		const response = await request('/createuser', { username: 'new-user' }, authorization);
		assert.equal(response.status, status);
		assert.ok(upstreamCalls.every(({ url }) => url.startsWith('http://session.invalid/')));
	});
}

test('authorization outage fails closed', async () => {
	sessionFailure = true;
	assert.equal(
		(await request('/createuser', { username: 'new-user' }, 'Bearer admin-token')).status,
		503
	);
	assert.equal(upstreamCalls.length, 1);
});

for (const token of ['admin-token', 'super-token']) {
	test(`${token} can create a limited Keycloak user`, async () => {
		const response = await request(
			'/createuser',
			{
				username: 'new-user',
				email: 'new@example.invalid',
				credentials: [{ type: 'password', value: 'synthetic-password', temporary: false }]
			},
			`Bearer ${token}`
		);
		assert.equal(response.status, 201);
		const created = JSON.parse(
			upstreamCalls.find(({ url }) => url.endsWith('/users')).options.body
		);
		assert.equal(created.emailVerified, false);
		assert.equal(created.credentials[0].temporary, true);
		assert.equal(created.realmRoles, undefined);
	});
}

test('even administrators cannot pass through roles or arbitrary Keycloak attributes', async () => {
	for (const extra of [
		{ realmRoles: ['realm-admin'] },
		{ attributes: { ovisFilter: ['All Access'] } },
		{ emailVerified: true }
	]) {
		const response = await request(
			'/createuser',
			{ username: 'new-user', ...extra },
			'Bearer admin-token'
		);
		assert.equal(response.status, 400);
	}
	assert.ok(upstreamCalls.every(({ url }) => url.startsWith('http://session.invalid/')));
});

test('unauthenticated attribute update is rejected before any upstream request', async () => {
	assert.equal(
		(
			await request(
				'/user/alice@example.invalid',
				{ attributes: { locale: ['de'] } },
				undefined,
				'PUT'
			)
		).status,
		401
	);
	assert.equal(upstreamCalls.length, 0);
});

test('self profile edit uses verified subject and preserves authorization attributes', async () => {
	const response = await request(
		'/user/alice@example.invalid',
		{ attributes: { locale: ['de'] } },
		'Bearer user-token',
		'PUT'
	);
	assert.equal(response.status, 200);
	const update = upstreamCalls.find(({ options }) => options.method === 'PUT');
	assert.ok(update.url.endsWith('/users/subject-123'));
	assert.deepEqual(JSON.parse(update.options.body), {
		attributes: { ovisFilter: ['restricted'], locale: ['de'] }
	});
});

test('a user cannot update another email or inject a user search', async () => {
	const response = await request(
		`/user/${encodeURIComponent('victim@example.invalid&exact=false')}`,
		{
			attributes: { locale: ['de'] }
		},
		'Bearer user-token',
		'PUT'
	);
	assert.equal(response.status, 403);
	assert.ok(
		upstreamCalls.every(({ url, options }) => !url.includes('/users?') && options.method !== 'PUT')
	);
});

test('self edits cannot change authorization fields or malformed values', async () => {
	for (const attributes of [
		{ ovisFilter: ['All Access'] },
		{ role: ['super-admin'] },
		{ locale: 'de' },
		{ locale: ['de', 'en'] }
	]) {
		assert.equal(
			(await request('/user/alice@example.invalid', { attributes }, 'Bearer user-token', 'PUT'))
				.status,
			400
		);
	}
	assert.ok(upstreamCalls.every(({ url }) => url.startsWith('http://session.invalid/')));
});

test('legacy reset proof and password overwrite endpoints are disabled', async () => {
	assert.equal(
		(await request('/check-reset-code', { email: 'known@example.invalid', reset_code: '123456' }))
			.status,
		410
	);
	assert.equal(
		(
			await request(
				'/reset-password',
				{ email: 'known@example.invalid', newpassword: 'synthetic' },
				'Basic synthetic',
				'PUT'
			)
		).status,
		410
	);
	assert.equal(upstreamCalls.length, 0);
});

test('recovery returns no proof and delegates a 15-minute password action to Keycloak', async () => {
	const response = await request('/create-reset-code', { email: 'known-recovery@example.invalid' });
	assert.equal(response.status, 202);
	const body = await response.json();
	assert.deepEqual(Object.keys(body), ['message']);
	const action = upstreamCalls.find(({ url }) => url.includes('/execute-actions-email'));
	assert.ok(action.url.endsWith('?lifespan=900'));
	assert.deepEqual(JSON.parse(action.options.body), ['UPDATE_PASSWORD']);
	assert.equal(
		new URL(upstreamCalls.find(({ url }) => url.includes('/users?')).url).searchParams.get('exact'),
		'true'
	);
});

test('unknown account has the same recovery response and repeated email does not resend', async () => {
	const first = await request('/create-reset-code', { email: 'known-repeat@example.invalid' });
	const knownBody = await first.json();
	const unknown = await request('/create-reset-code', { email: 'missing@example.invalid' });
	assert.deepEqual(await unknown.json(), knownBody);
	upstreamCalls = [];
	const repeated = await request('/create-reset-code', { email: 'known-repeat@example.invalid' });
	assert.equal(repeated.status, 202);
	assert.equal(upstreamCalls.length, 0);
});

test('login no longer relies on browser-shared Basic credentials and does not log secrets', async () => {
	const messages = [];
	const originalLog = console.log;
	console.log = (...args) => messages.push(args);
	try {
		const response = await request('/login', {
			username: 'synthetic',
			password: 'synthetic-password'
		});
		assert.equal(response.status, 200);
		assert.equal(messages.length, 0);
	} finally {
		console.log = originalLog;
	}
});

test('rate limit denies repeated attempts and opens again after the window', () => {
	let now = 1000;
	let allowed = 0;
	let rejected;
	const limit = createRateLimit({ limit: 2, windowMs: 60000, now: () => now });
	const res = {
		set() {},
		status(code) {
			rejected = code;
			return this;
		},
		json() {}
	};
	const req = { ip: '127.0.0.1' };
	for (let i = 0; i < 3; i++) limit(req, res, () => allowed++);
	assert.equal(allowed, 2);
	assert.equal(rejected, 429);
	now += 60000;
	limit(req, res, () => allowed++);
	assert.equal(allowed, 3);
});
