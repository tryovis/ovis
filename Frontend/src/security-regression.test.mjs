import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(os.tmpdir(), `ovis-security-${randomUUID()}.mjs`);
await build({
	stdin: {
		contents: `
			export { authenticatedFetch, setAccessTokenProvider, invalidateAuthenticatedRequests } from './src/lib/request-auth.ts';
			export { graphqlFetch } from './src/graphQl/gql-url.ts';
			export { requireBackendSession } from './src/lib/server/backend-auth.ts';
			export { protectCatalogue } from './src/lib/server/catalogue-access.ts';
			export { GET as catalogue } from './src/routes/api/catalogue/+server.js';
			export { GET as progress } from './src/routes/api/import-progress/+server.ts';
			export { escapeHtml } from './src/lib/escape-html.ts';
		`,
		resolveDir: root
	},
	outfile, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent',
	plugins: [{ name: 'security-test-aliases', setup(builder) {
		builder.onResolve({ filter: /^\$lib\// }, ({ path: name }) => ({
			path: path.join(root, 'src/lib', `${name.slice(5)}.ts`)
		}));
		builder.onResolve({ filter: /^(\$app\/paths|@sveltejs\/kit)$/ }, ({ path: name }) => ({
			path: name, namespace: 'stubs'
		}));
		builder.onLoad({ filter: /.*/, namespace: 'stubs' }, ({ path: name }) => ({
			contents: name === '$app/paths' ? `export const base = '';` :
				`export const json = (body, init = {}) => new Response(JSON.stringify(body), init);`,
			loader: 'js'
		}));
	}}]
});
const api = await import(pathToFileURL(outfile).href);
await fs.unlink(outfile);

test('GraphQL sends current bearer token; login override uses the new identity', async () => {
	const originalFetch = globalThis.fetch;
	const requests = [];
	globalThis.fetch = async (_url, init) => { requests.push(init); return new Response('{}'); };
	api.setAccessTokenProvider(async () => 'refreshed-access-token');
	try {
		await api.graphqlFetch('/graphql', { method: 'POST', body: '{"query":"{ getUser { _id } }"}' });
		assert.equal(requests[0].headers.get('authorization'), 'Bearer refreshed-access-token');
		assert.equal(requests[0].headers.get('x-ovis-graphql-request'), '1');
		await api.graphqlFetch('/graphql', { headers: { authorization: 'Bearer new-login-token' } });
		assert.equal(requests[1].headers.get('authorization'), 'Bearer new-login-token');
	} finally { globalThis.fetch = originalFetch; api.setAccessTokenProvider(async () => null); }
});

test('catalogue and progress deny missing or invalid sessions before reading data', async () => {
	const originalFetch = globalThis.fetch;
	for (const status of [401, 403, 500]) {
		for (const handler of [api.catalogue, api.progress]) {
			const calls = [];
			globalThis.fetch = async (url) => { calls.push(String(url)); return new Response('{}', { status }); };
			try {
				const result = await handler({ request: new Request('http://localhost/api/test') });
				assert.equal(result.status, status === 500 ? 503 : status);
				assert.equal(calls.length, 1);
				assert.match(calls[0], /\/auth\/session$/);
			} finally { globalThis.fetch = originalFetch; }
		}
	}
});

test('data proxy authorizes bearer via Apollo and keeps credentials from preprocessing', async () => {
	const originalFetch = globalThis.fetch;
	const calls = [];
	globalThis.fetch = async (url, init) => {
		calls.push({ url: String(url), headers: new Headers(init.headers) });
		return new Response(JSON.stringify(calls.length === 1 ? { userId: 'fixture', sub: 'fixture-sub', role: 'user', anonymous: false, cohortRestricted: false, pseudonymization: false } : { ready: true }));
	};
	try {
		const response = await api.progress({ request: new Request('http://localhost/api/import-progress', {
			headers: { authorization: 'Bearer fixture-token', cookie: 'untrusted=session' }
		}) });
		assert.equal(response.status, 200);
		assert.equal(calls[0].headers.get('authorization'), 'Bearer fixture-token');
		assert.equal(calls[0].headers.get('cookie'), null);
		assert.equal(calls[1].headers.get('authorization'), null);
		assert.match(calls[1].url, /\/health$/);
	} finally { globalThis.fetch = originalFetch; }
});

test('authorization outage fails closed', async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async () => { throw new Error('offline'); };
	try {
		assert.equal((await api.requireBackendSession(new Request('http://localhost'))).status, 503);
	} finally { globalThis.fetch = originalFetch; }
});

test('untrusted HTML data cannot form tags or quoted attributes', () => {
	const attack = '<img src=x onerror="alert(1)">\'&';
	const escaped = api.escapeHtml(attack);
	assert.equal(escaped, '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;');
	assert.doesNotMatch(escaped, /[<>"']/);
});

test('a successful HTTP status without a verified session is denied', async () => {
	const originalFetch = globalThis.fetch;
	try {
		for (const body of ['{}', '<html>Login</html>', JSON.stringify({ anonymous: false, userId: 'fixture', role: 'user' })]) {
			globalThis.fetch = async (_url, init) => {
				assert.equal(init.redirect, 'error');
				return new Response(body);
			};
			assert.equal((await api.requireBackendSession(new Request('http://localhost'))).status, 503);
		}
	} finally { globalThis.fetch = originalFetch; }
});

test('catalogues exclude administration and hide global suggestions for restricted cohorts', () => {
	const catalogue = [
		{ key: 'user', childCategories: [{ key: 'email', criteria: [{ key: 'private@example.invalid' }] }] },
		{ key: 'usageEvent', childCategories: [] },
		{ key: 'platformDocument', childCategories: [] },
		{ key: 'patient', childCategories: [
			{ key: 'firstName', system: 'patient', criteria: [{ key: 'Name' }] },
			{ key: '!lastName', system: 'patient', criteria: [{ key: 'Name' }] },
			{ key: 'patID', system: 'patient', criteria: [{ key: 'OUTSIDE-COHORT' }] }
		] }
	];
	const restricted = api.protectCatalogue(catalogue, { cohortRestricted: true, pseudonymization: true });
	assert.deepEqual(restricted.map((category) => category.key), ['patient']);
	assert.deepEqual(restricted[0].childCategories, [{ key: 'patID', system: 'patient', criteria: [] }]);
	const ordinary = api.protectCatalogue(catalogue, { cohortRestricted: false, pseudonymization: false });
	assert.equal(ordinary[0].childCategories.length, 3);
	assert.equal(catalogue[3].childCategories[2].criteria.length, 1, 'shared source data must not be modified');
});

test('catalogue HTTP handler applies policy to wrapped and raw upstream data', async () => {
	const originalFetch = globalThis.fetch;
	const data = [{ key: 'patient', childCategories: [{ key: 'patID', system: 'patient', criteria: [{ key: 'OUTSIDE-COHORT' }] }] }];
	try {
		for (const payload of [data, { data, timestamp: 10, size: 50 }]) {
			let count = 0;
			globalThis.fetch = async () => new Response(JSON.stringify(++count === 1
				? { anonymous: false, userId: 'fixture', sub: 'fixture-sub', role: 'user', cohortRestricted: true, pseudonymization: false }
				: payload));
			const response = await api.catalogue({ request: new Request('http://localhost/api/catalogue') });
			assert.equal(response.status, 200);
			assert.deepEqual((await response.json()).data[0].childCategories[0].criteria, []);
		}
	} finally { globalThis.fetch = originalFetch; }
});

test('an in-flight response from a logged-out session is not delivered', async () => {
	const originalFetch = globalThis.fetch;
	let complete;
	api.setAccessTokenProvider(async () => null);
	globalThis.fetch = () => new Promise((resolve) => { complete = resolve; });
	try {
		const request = api.authenticatedFetch('/graphql');
		await new Promise((resolve) => setTimeout(resolve, 0));
		api.invalidateAuthenticatedRequests();
		complete(new Response('{}'));
		await assert.rejects(request, /Session changed/);
	} finally { globalThis.fetch = originalFetch; }
});

test('catalogue revision changes with each access policy at an unchanged import timestamp', async () => {
	const originalFetch = globalThis.fetch;
	const timestamp = 10;
	const data = [{ key: 'patient', childCategories: [
		{ key: 'firstName', system: 'patient', criteria: [{ key: 'NAME' }] },
		{ key: 'patID', system: 'patient', criteria: [{ key: 'PATIENT' }] }
	] }];
	try {
		const revisions = new Set();
		const etags = new Set();
		for (const cohortRestricted of [false, true]) {
			for (const pseudonymization of [false, true]) {
				let count = 0;
				globalThis.fetch = async () => new Response(JSON.stringify(++count === 1
					? { anonymous: false, userId: 'fixture', sub: 'fixture-sub', role: 'user', cohortRestricted, pseudonymization }
					: { data, timestamp, size: 50, revision: 'untrusted-upstream-revision' }));
				const response = await api.catalogue({ request: new Request('http://localhost/api/catalogue') });
				const result = await response.json();
				assert.equal(response.status, 200);
				assert.equal(result.timestamp, timestamp);
				assert.notEqual(result.revision, 'untrusted-upstream-revision');
				revisions.add(result.revision);
				etags.add(response.headers.get('etag'));
				assert.equal(result.data[0].childCategories.some((field) => field.key === 'firstName'), !pseudonymization);
				assert.equal(result.data[0].childCategories.at(-1).criteria.length, cohortRestricted ? 0 : 1);
			}
		}
		assert.equal(revisions.size, 4, 'each policy must replace cached UI data');
		assert.equal(etags.size, 4, 'HTTP validators must identify the protected representation');
	} finally { globalThis.fetch = originalFetch; }
});
