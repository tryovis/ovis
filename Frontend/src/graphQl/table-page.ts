import { dataUrl, graphqlFetch, setActiveTableRequest } from './gql-url';

export type TableColumnFilter = {
	readonly field: string;
	readonly value: string;
};

export type TablePageRequest = {
	readonly offset: number;
	readonly limit: number;
	readonly sortField: string | null;
	readonly sortDirection: 'asc' | 'desc';
	readonly columnFilters: readonly TableColumnFilter[];
};

export type TablePage<Row> = {
	readonly rows: Row[];
	readonly total: number;
	readonly filtered: number;
};

export async function fetchTableRows<Row>(
	getRows: (
		continueFromID: string | undefined | null,
		limit: number,
		filter: string | null
	) => Promise<Row[]>,
	request: TablePageRequest,
	filter: string | null
): Promise<Row[]> {
	setActiveTableRequest(request);
	try {
		return await getRows(null, request.limit, filter);
	} finally {
		setActiveTableRequest(null);
	}
}

export async function getTableCount(
	collection: string,
	filter: string | null,
	columnFilters: readonly TableColumnFilter[]
): Promise<number> {
	const response = await graphqlFetch(dataUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			query: `
				query getTableCount($collection: collection!, $filter: String, $columnFilters: [TableColumnFilter!]) {
					getTableCount(collection: $collection, filter: $filter, columnFilters: $columnFilters)
				}
			`,
			variables: {
				collection,
				filter,
				columnFilters
			}
		})
	});
	const result = await response.json();
	return result.data.getTableCount ?? 0;
}
