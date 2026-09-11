const assert = require('node:assert/strict');
const test = require('node:test');

const { fitCoxModel, normalizeRJson } = require('./coxService');

const response = (body, options = {}) => ({
	ok: options.ok ?? true,
	status: options.status ?? 200,
	text: async () => JSON.stringify(body)
});

test('aborts slow R requests with a structured timeout instead of fabricated model statistics', async () => {
	await assert.rejects(
		fitCoxModel(
			{ rows: [], covariates: ['age'] },
			{
				timeoutMs: 10,
				fetchImpl: (_url, { signal }) =>
					new Promise((_, reject) => {
						signal.addEventListener(
							'abort',
							() => reject(new DOMException('Aborted', 'AbortError')),
							{ once: true }
						);
					})
			}
		),
		(error) => error.extensions?.code === 'COX_TIMEOUT'
	);
});

test('recognises the R worker deadline response', async () => {
	await assert.rejects(
		fitCoxModel(
			{ rows: [], covariates: ['age'] },
			{
				fetchImpl: async () => response({ status: 'ERROR' }, { ok: false, status: 408 })
			}
		),
		(error) => error.extensions?.code === 'COX_TIMEOUT'
	);
});

test('posts the whitelisted Cox payload to the internal R service', async () => {
	let request;
	const result = await fitCoxModel(
		{ rows: [{ time: 10, event: 1, age: 60 }], covariates: ['age'] },
		{
			serviceUrl: 'http://cox.test/',
			fetchImpl: async (url, options) => {
				request = { url, options };
				return response({ status: 'OK', coefficients: [] });
			}
		}
	);

	assert.equal(request.url, 'http://cox.test/fit');
	assert.equal(request.options.method, 'POST');
	assert.deepEqual(JSON.parse(request.options.body).covariates, ['age']);
	assert.equal(result.status, 'OK');
});

test('normalizes R null placeholders before GraphQL serialization', () => {
	assert.deepEqual(
		normalizeRJson({
			message: {},
			coefficients: [{ confidenceLow: {}, confidenceHigh: 2.5 }],
			warnings: []
		}),
		{
			message: null,
			coefficients: [{ confidenceLow: null, confidenceHigh: 2.5 }],
			warnings: []
		}
	);
});

test('surfaces a structured R service error', async () => {
	await assert.rejects(
		fitCoxModel(
			{ rows: [], covariates: ['age'] },
			{
				fetchImpl: async () =>
					response({ status: 'ERROR', message: 'model failed' }, { ok: false, status: 422 })
			}
		),
		/model failed/
	);
});

test('rejects an incomplete service response', async () => {
	await assert.rejects(
		fitCoxModel(
			{ rows: [], covariates: ['age'] },
			{ fetchImpl: async () => response({ coefficients: [] }) }
		),
		/incomplete response/
	);
});
