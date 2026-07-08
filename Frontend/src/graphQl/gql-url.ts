import { appPath } from '$lib/path-utils';
import {
	GRAPHQL_PROXY_REQUIRED_HEADER,
	GRAPHQL_PROXY_REQUIRED_HEADER_VALUE
} from '$lib/graphql-security';
import type { TablePageRequest } from './table-page';

export const dataUrl = appPath('graphql');

let activeTableRequest: TablePageRequest | null = null;

export function setActiveTableRequest(request: TablePageRequest | null): void {
	activeTableRequest = request;
}

function requestWithTablePaging(init: RequestInit): RequestInit {
	if (!activeTableRequest || typeof init.body !== 'string') {
		return init;
	}

	const body = JSON.parse(init.body);
	if (typeof body.query !== 'string' || !body.query.includes('continueFromID')) {
		return init;
	}

	const queryWithVariables = body.query.replace(
		/(\$filter\s*:\s*String!?)/,
		'$1, $offset: Int, $sortField: String, $sortDirection: String, $columnFilters: [TableColumnFilter!]'
	);
	const queryWithArguments = queryWithVariables.replace(
		/(continueFromID\s*:\s*\$continueFromID\s*,\s*limit\s*:\s*\$limit\s*,\s*filter\s*:\s*\$filter)/g,
		'$1, offset: $offset, sortField: $sortField, sortDirection: $sortDirection, columnFilters: $columnFilters'
	);

	return {
		...init,
		body: JSON.stringify({
			...body,
			query: queryWithArguments,
			variables: {
				...body.variables,
				continueFromID: null,
				limit: activeTableRequest.limit,
				offset: activeTableRequest.offset,
				sortField: activeTableRequest.sortField,
				sortDirection: activeTableRequest.sortDirection,
				columnFilters: activeTableRequest.columnFilters
			}
		})
	};
}

// Required security header for GraphQL requests
/**
 * Wrapper for fetch that includes required security headers for GraphQL endpoint.
 * This is required because the server-side proxy validates these headers for CSRF protection.
 */
export function graphqlFetch(url: string, init: RequestInit): Promise<Response> {
	const pagedInit = requestWithTablePaging(init);
	const headers = new Headers(pagedInit.headers);
	headers.set(GRAPHQL_PROXY_REQUIRED_HEADER, GRAPHQL_PROXY_REQUIRED_HEADER_VALUE);

	return fetch(url, {
		...pagedInit,
		headers
	});
}
