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

type FetchAllTableRowsOptions<Row> = {
	readonly baseRequest: TablePageRequest;
	readonly totalRows: number;
	readonly pageSize: number;
	readonly fetchPage: (request: TablePageRequest) => Promise<Row[]>;
	readonly onProgress?: (loadedRows: number, expectedRows: number) => void;
};

export async function fetchAllTableRows<Row>({
	baseRequest,
	totalRows,
	pageSize,
	fetchPage,
	onProgress
}: FetchAllTableRowsOptions<Row>): Promise<Row[]> {
	const rows: Row[] = [];
	let offset = 0;
	let reachedEnd = false;

	while (!reachedEnd) {
		const request = {
			...baseRequest,
			offset,
			limit: pageSize
		};
		const page = await fetchPage(request);
		if (page.length === 0) {
			reachedEnd = true;
			continue;
		}

		rows.push(...page);
		offset += page.length;
		onProgress?.(rows.length, Math.max(totalRows, rows.length));
	}

	return rows;
}

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
		return getRows(null, request.limit, filter);
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
