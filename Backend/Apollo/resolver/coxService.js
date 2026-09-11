const DEFAULT_COX_SERVICE_URL = 'http://ovis-backend-cox:8000';
const { COX_TIMEOUT_MS, coxTimeoutError } = require('./coxDeadline');

const serviceError = (message, cause) => {
	const error = new Error(message);
	error.cause = cause;
	error.coxServiceError = true;
	return error;
};

const normalizeRJson = (value) => {
	if (Array.isArray(value)) return value.map(normalizeRJson);
	if (value && typeof value === 'object') {
		const entries = Object.entries(value);
		if (entries.length === 0) return null;
		return Object.fromEntries(entries.map(([key, nested]) => [key, normalizeRJson(nested)]));
	}
	return value;
};

async function fitCoxModel(payload, options = {}) {
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	if (typeof fetchImpl !== 'function') {
		throw new Error('The Cox regression service requires a fetch implementation.');
	}
	const serviceUrl = String(
		options.serviceUrl ?? process.env.COX_R_URL ?? DEFAULT_COX_SERVICE_URL
	).replace(/\/$/, '');
	const timeoutMs = options.timeoutMs ?? COX_TIMEOUT_MS;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetchImpl(`${serviceUrl}/fit`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...payload, deadlineUnixMs: Date.now() + timeoutMs }),
			signal: controller.signal
		});
		const responseText = await response.text();
		let result;
		try {
			result = normalizeRJson(responseText ? JSON.parse(responseText) : {});
		} catch (error) {
			throw serviceError('The Cox regression service returned invalid JSON.', error);
		}
		if (!response.ok) {
			if (response.status === 408) throw coxTimeoutError();
			throw serviceError(
				result?.message || `The Cox regression service returned HTTP ${response.status}.`
			);
		}
		if (!result || typeof result !== 'object' || !hasOwn(result, 'status')) {
			throw serviceError('The Cox regression service returned an incomplete response.');
		}
		return result;
	} catch (error) {
		if (error?.name === 'AbortError') {
			throw coxTimeoutError();
		}
		if (error?.extensions?.code === 'COX_TIMEOUT') throw error;
		if (error?.coxServiceError) throw error;
		throw serviceError('The Cox regression service is unavailable.', error);
	} finally {
		clearTimeout(timeout);
	}
}

const hasOwn = (object, property) => Object.prototype.hasOwnProperty.call(object, property);

module.exports = { DEFAULT_COX_SERVICE_URL, fitCoxModel, normalizeRJson };
