import { dataUrl, graphqlFetch } from '../../graphQl/gql-url';
import { ExportError } from './errors';
import {
	datasets,
	relations,
	buildPreview,
	selectDatedRow,
	MAX_JOIN_ROWS,
	type DataRows,
	type DataRow,
	type TableSelection
} from './model';
import type { MongoExportField } from './fields';

export type ExportLoadProgress = {
	dataset: string;
	loadedRows: number;
	completedTables: number;
	totalTables: number;
};

export type ExportLoadOptions = {
	signal?: AbortSignal;
	pageSize?: number;
	onProgress?: (progress: ExportLoadProgress) => void;
};

const fieldsQuery = `query ExportFields($collection: ExportCollection!, $filter: String) {
	getExportFields(collection: $collection, filter: $filter) { id type }
}`;
const rowsQuery = `query ExportRows($collection: ExportCollection!, $offset: Int!, $limit: Int!, $filter: String) {
	getExportRows(collection: $collection, offset: $offset, limit: $limit, filter: $filter)
}`;
const previewQuery = `query ExportPreviewRows($collection: ExportCollection!, $offset: Int!, $limit: Int!, $filter: String, $match: ExportRowMatch) {
	getExportRows(collection: $collection, offset: $offset, limit: $limit, filter: $filter, match: $match)
}`;

export const EXPORT_PREVIEW_ROWS = 5;
export type ExportPreviewRow = Record<string, DataRow | null>;

function requestedTables(ids: string[]): string[] {
	const allowed = new Set(datasets.map((dataset) => dataset.id));
	for (const id of ids) {
		if (!allowed.has(id))
			throw new ExportError(
				'exportErrorUnknownTable',
				{ table: id },
				`Unknown export table: ${id}`
			);
	}
	return [...new Set(ids)];
}

function checkAbort(signal?: AbortSignal): void {
	if (signal?.aborted)
		throw signal.reason instanceof Error
			? signal.reason
			: new DOMException('Loading cancelled.', 'AbortError');
}

async function request(
	query: string,
	variables: Record<string, unknown>,
	endpoint: string,
	id: string,
	signal?: AbortSignal
): Promise<unknown[]> {
	checkAbort(signal);
	const response = await graphqlFetch(dataUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		signal,
		body: JSON.stringify({ query, variables })
	});
	checkAbort(signal);
	if (!response.ok)
		throw new ExportError(
			'exportErrorHttp',
			{ status: response.status },
			`Export data could not be loaded (HTTP ${response.status}).`
		);
	const payload: { data?: Record<string, unknown>; errors?: { message?: string }[] } =
		await response.json();
	checkAbort(signal);
	if (payload?.errors?.length) {
		const details = payload.errors
			.map((error) => error.message)
			.filter(Boolean)
			.join('; ');
		throw details
			? new ExportError(
					'exportErrorGraphqlDetails',
					{ details },
					`Export data could not be loaded: ${details}`
			  )
			: new ExportError(
					'exportErrorGraphql',
					{},
					'Export data could not be loaded (GraphQL error).'
			  );
	}
	const values = payload?.data?.[endpoint];
	if (!Array.isArray(values))
		throw new ExportError(
			'exportErrorMissingTable',
			{ table: id },
			`Missing data for export table ${id}.`
		);
	return values;
}

function normalizeField(value: unknown): MongoExportField {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new ExportError('exportErrorInvalidField', {}, 'Invalid export field.');
	const { id, type } = value as Record<string, unknown>;
	if (typeof id !== 'string' || !id.trim() || !['TEXT', 'NUMBER', 'DATE'].includes(String(type)))
		throw new ExportError('exportErrorInvalidField', {}, 'Invalid export field.');
	return { id, type: String(type).toLowerCase() as MongoExportField['type'] };
}

/** Discover every field within the permitted cohort, independent of interactive filters. */
export async function loadExportFields(
	ids: string[],
	options: Pick<ExportLoadOptions, 'signal'> = {}
): Promise<Record<string, MongoExportField[]>> {
	const requested = requestedTables(ids);
	const result: Record<string, MongoExportField[]> = {};
	checkAbort(options.signal);
	for (const id of requested) {
		const values = await request(
			fieldsQuery,
			{ collection: id, filter: null },
			'getExportFields',
			id,
			options.signal
		);
		const fields = values.map(normalizeField);
		if (new Set(fields.map((field) => field.id)).size !== fields.length)
			throw new ExportError('exportErrorInvalidField', {}, 'Duplicate export field.');
		result[id] = fields;
	}
	checkAbort(options.signal);
	return result;
}

function normalizeRow(serialized: unknown): DataRow {
	let value: unknown;
	try {
		if (typeof serialized !== 'string') throw new Error('Expected a JSON row.');
		value = JSON.parse(serialized);
	} catch {
		throw new ExportError('exportErrorInvalidRow', {}, 'Invalid table row in the export response.');
	}
	if (value === null || typeof value !== 'object' || Array.isArray(value))
		throw new ExportError('exportErrorInvalidRow', {}, 'Invalid table row in the export response.');
	return Object.fromEntries(
		Object.entries(value).map(([path, cell]) => {
			if (
				cell === null ||
				typeof cell === 'string' ||
				(typeof cell === 'number' && Number.isFinite(cell))
			)
				return [path, cell];
			throw new ExportError(
				'exportErrorUnexpectedValue',
				{ field: path },
				`Unexpected value for export field ${path}.`
			);
		})
	);
}

/**
 * Fetch flat Mongo rows through the authenticated export endpoint. The supplied filter is
 * frozen across pages. Arrays are lossless JSON strings and dates remain epoch milliseconds.
 */
export async function loadExportData(
	ids: string[],
	filter: string | null,
	options: ExportLoadOptions = {}
): Promise<DataRows> {
	const pageSize = options.pageSize ?? 1000;
	if (!Number.isSafeInteger(pageSize) || pageSize < 1)
		throw new ExportError('exportErrorInvalidPageSize', {}, 'Invalid page size.');
	const requested = requestedTables(ids);
	const result: DataRows = {};
	let completedTables = 0;
	checkAbort(options.signal);
	for (const id of requested) {
		const rows: DataRow[] = [];
		while (true) {
			const page = await request(
				rowsQuery,
				{ collection: id, offset: rows.length, limit: pageSize, filter },
				'getExportRows',
				id,
				options.signal
			);
			if (page.length === 0) break;
			rows.push(...page.map(normalizeRow));
			options.onProgress?.({
				dataset: id,
				loadedRows: rows.length,
				completedTables,
				totalTables: requested.length
			});
		}
		result[id] = rows;
		completedTables += 1;
		options.onProgress?.({
			dataset: id,
			loadedRows: rows.length,
			completedTables,
			totalTables: requested.length
		});
	}
	checkAbort(options.signal);
	return result;
}

/** Walk the same ordered joins as buildPreview, stopping after five result rows.
 * Child pages are scoped to their parent key, never independently sampled. */
export async function loadExportPreview(
	plan: TableSelection[],
	filter: string | null,
	options: Pick<ExportLoadOptions, 'signal'> = {}
): Promise<ExportPreviewRow[]> {
	checkAbort(options.signal);
	buildPreview(plan, [], {}); // Validate connections and entry-selection modes.
	if (!plan.length) return [];
	const rows: ExportPreviewRow[] = [];
	const cache = new Map<string, { rows: DataRow[]; complete: boolean }>();
	async function* candidates(id: string, match: { field: string; value: string } | null) {
		const key = JSON.stringify([id, match]);
		let cached = cache.get(key);
		if (!cached) {
			cached = { rows: [], complete: false };
			cache.set(key, cached);
		}
		let index = 0;
		while (true) {
			checkAbort(options.signal);
			if (index < cached.rows.length) {
				yield cached.rows[index++];
				continue;
			}
			if (cached.complete) return;
			const page = await request(
				previewQuery,
				{
					collection: id,
					filter,
					match,
					offset: cached.rows.length,
					limit: EXPORT_PREVIEW_ROWS
				},
				'getExportRows',
				id,
				options.signal
			);
			if (!page.length) {
				cached.complete = true;
				return;
			}
			if (cached.rows.length + page.length > MAX_JOIN_ROWS)
				throw new ExportError('exportErrorRowLimit', { limit: MAX_JOIN_ROWS });
			cached.rows.push(...page.map(normalizeRow));
		}
	}
	async function visit(index: number, tables: ExportPreviewRow): Promise<void> {
		checkAbort(options.signal);
		if (rows.length >= EXPORT_PREVIEW_ROWS) return;
		if (index === plan.length) {
			rows.push(tables);
			return;
		}
		const table = plan[index];
		let match: { field: string; value: string } | null = null;
		if (table.parent) {
			const relation = relations.find((item) => item.id === table.relation)!;
			const parentField = relation.from === table.parent ? relation.fromField : relation.toField;
			const childField = relation.from === table.parent ? relation.toField : relation.fromField;
			const value = tables[table.parent]?.[parentField];
			if (
				!(
					(typeof value === 'string' && value !== '') ||
					(typeof value === 'number' && Number.isFinite(value))
				)
			) {
				if (table.join === 'left') await visit(index + 1, { ...tables, [table.dataset]: null });
				return;
			}
			match = { field: childField, value: JSON.stringify(value) };
		}
		let matched = false;
		const dated: DataRow[] = [];
		for await (const candidate of candidates(table.dataset, match)) {
			matched = true;
			if (table.parent && table.selection && table.selection !== 'all') {
				// First/last needs the complete matching group, not the first page.
				dated.push(candidate);
			} else {
				await visit(index + 1, { ...tables, [table.dataset]: candidate });
				if (rows.length >= EXPORT_PREVIEW_ROWS) return;
			}
		}
		if (dated.length) {
			const dateField = datasets.find((dataset) => dataset.id === table.dataset)!.dateField!;
			const [selected] = selectDatedRow(dated, table.dataset, dateField, table.selection!);
			await visit(index + 1, { ...tables, [table.dataset]: selected });
		} else if (!matched && table.parent && table.join === 'left') {
			await visit(index + 1, { ...tables, [table.dataset]: null });
		}
	}
	await visit(0, {});
	checkAbort(options.signal);
	return rows;
}
