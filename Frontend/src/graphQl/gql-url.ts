import { apiPath } from '$lib/path-utils';
import {
	GRAPHQL_PROXY_REQUIRED_HEADER,
	GRAPHQL_PROXY_REQUIRED_HEADER_VALUE
} from '$lib/graphql-security';

export const dataUrl = apiPath('graphql');

// Required security header for GraphQL requests
/**
 * Wrapper for fetch that includes required security headers for GraphQL endpoint.
 * This is required because the server-side proxy validates these headers for CSRF protection.
 */
export function graphqlFetch(
	url: string,
	init: RequestInit
): Promise<Response> {
	const headers = new Headers(init.headers);
	headers.set(GRAPHQL_PROXY_REQUIRED_HEADER, GRAPHQL_PROXY_REQUIRED_HEADER_VALUE);

	return fetch(url, {
		...init,
		headers
	});
}
