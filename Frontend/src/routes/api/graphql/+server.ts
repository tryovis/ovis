import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import {
	GRAPHQL_PROXY_REQUIRED_HEADER,
	GRAPHQL_PROXY_REQUIRED_HEADER_VALUE
} from '$lib/graphql-security';

const UPSTREAM =
	process.env.GRAPHQL_UPSTREAM_URL ||
	process.env.OVIS_GRAPHQL_UPSTREAM_URL ||
	'http://ovis-backend-apollo:4001/graphql';

/**
 * Security validation for GraphQL proxy requests:
 * 1. POST only (GET is disabled to prevent URL-based query exposure)
 * 2. Requests must include the frontend GraphQL proxy marker header
 * 3. Origin or Referer must be present and same-origin
 * 4. Content-Type must be application/json
 * 5. Minimal headers forwarded to backend
 */
function validateRequest(event: RequestEvent): { error?: Response } {
	const request = event.request;
	const url = new URL(request.url);
	const expectedOrigin = `${url.protocol}//${url.host}`;
	const contentType = request.headers.get('content-type') || '';
	const requiredHeader = request.headers.get(GRAPHQL_PROXY_REQUIRED_HEADER);

	// 1. Validate frontend marker header
	if (requiredHeader !== GRAPHQL_PROXY_REQUIRED_HEADER_VALUE) {
		return {
			error: json({ errors: [{ message: 'Invalid request' }] }, { status: 403 })
		};
	}

	// 2. Validate Origin header when present
	const origin = request.headers.get('origin');
	if (origin) {
		if (origin !== expectedOrigin) {
			return {
				error: json({ errors: [{ message: 'Invalid request' }] }, { status: 403 })
			};
		}
	}

	// 3. Require browser provenance when Origin is absent
	const referer = request.headers.get('referer');
	if (!origin && !referer) {
		return {
			error: json({ errors: [{ message: 'Invalid request' }] }, { status: 403 })
		};
	}

	if (!origin && referer) {
		try {
			const refererUrl = new URL(referer);
			const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
			if (refererOrigin !== expectedOrigin) {
				return {
					error: json({ errors: [{ message: 'Invalid request' }] }, { status: 403 })
				};
			}
		} catch {
			return {
				error: json({ errors: [{ message: 'Invalid request' }] }, { status: 403 })
			};
		}
	}

	// 4. Validate Content-Type
	if (!contentType.toLowerCase().startsWith('application/json')) {
		return {
			error: json({ errors: [{ message: 'Invalid request' }] }, { status: 415 })
		};
	}

	return {};
}

/**
 * Build safe headers to forward to backend.
 * Only forwards essential headers to reduce exposure.
 */
function buildUpstreamHeaders(request: Request): Headers {
	const headers = new Headers();

	// Only forward essential headers
	const allowedHeaders = [
		'content-type',
		'authorization',
		'x-request-id',
		'accept',
		'accept-encoding'
	];

	for (const name of allowedHeaders) {
		const value = request.headers.get(name);
		if (value) {
			headers.set(name, value);
		}
	}

	return headers;
}

export async function POST(event: RequestEvent) {
	const validation = validateRequest(event);
	if (validation.error) {
		return validation.error;
	}

	const body = await event.request.text();

	// Quick sanity check: must be valid JSON
	try {
		JSON.parse(body);
	} catch {
		return json({ errors: [{ message: 'Invalid JSON in request body' }] }, { status: 400 });
	}

	const headers = buildUpstreamHeaders(event.request);

	try {
		const response = await fetch(UPSTREAM, {
			method: 'POST',
			headers,
			body
		});

		const responseBody = await response.text();

		return new Response(responseBody, {
			status: response.status,
			statusText: response.statusText,
			headers: {
				'content-type': response.headers.get('content-type') || 'application/json'
			}
		});
	} catch (err) {
		console.error('GraphQL proxy error:', err);
		throw error(502, 'GraphQL upstream unavailable');
	}
}

// GET handler disabled for security - GraphQL queries should use POST only
export async function GET() {
	return json(
		{ errors: [{ message: 'GraphQL endpoint accepts POST requests only' }] },
		{ status: 405 }
	);
}
