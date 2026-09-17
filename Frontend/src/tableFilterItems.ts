import type { AggregatedValue } from './types/query';

export type QueryValue = {
	name: string;
	value: string | { min: number; max: number } | AggregatedValue[][] | number | boolean | null;
	queryBindId: string;
	description?: string;
};

export type QueryItem = {
	id: string;
	key: string;
	name: string;
	type: string;
	system?: string;
	values: QueryValue[];
	description?: string;
};

const ARRAY_COLUMN_SUFFIX = {
	ops: '_code',
	substance: '_substance',
	metastasisResection: '',
	surgeon: ''
} as const;

export type ArrayColumnName = keyof typeof ARRAY_COLUMN_SUFFIX;

export function isArrayFilterColumn(columnName: string): columnName is ArrayColumnName {
	return Object.prototype.hasOwnProperty.call(ARRAY_COLUMN_SUFFIX, columnName);
}

export function getArrayFilterKey(columnName: ArrayColumnName): string {
	return `${columnName}${ARRAY_COLUMN_SUFFIX[columnName]}`;
}

export function getCellValues(cellData: string | readonly unknown[] | null | undefined): string[] {
	const rawValues = Array.isArray(cellData) ? cellData : String(cellData ?? '').split(',');
	return rawValues.map((value) => String(value).trim()).filter(Boolean);
}

export function createArrayFilterItems(
	columnName: ArrayColumnName,
	cellData: string | readonly unknown[] | null | undefined
): QueryItem[] {
	const key = getArrayFilterKey(columnName);
	return getCellValues(cellData).map((value) => ({
		id: '-',
		key,
		name: key,
		type: 'EQUALS',
		system: 'therapy',
		values: [{ name: value, value, queryBindId: '-' }]
	}));
}

export function queryContainsValue(
	queryGroups: readonly (readonly QueryItem[])[],
	queryItem: QueryItem
): boolean {
	const expectedValues = new Set(queryItem.values.map((value) => value.value));
	return queryGroups.some((group) =>
		group.some(
			(item) =>
				item.key === queryItem.key &&
				item.system === queryItem.system &&
				item.type === queryItem.type &&
				item.values.some((value) => expectedValues.has(value.value))
		)
	);
}

export function appendQueryItemToFirstGroup(
	queryGroups: readonly (readonly QueryItem[])[],
	queryItem: QueryItem,
	assignedFilter?: unknown
): QueryItem[][] {
	if (isQueryItemRedundantWithAssignedFilter(queryItem, assignedFilter)) {
		return queryGroups.map((group) => [...group]);
	}
	const [firstGroup = [], ...restGroups] = queryGroups;
	const firstGroupItems = firstGroup.filter(
		(item) =>
			item.values.length > 0 ||
			item.key !== queryItem.key ||
			item.system !== queryItem.system ||
			item.type !== queryItem.type
	);
	const existingItem = firstGroupItems.find(
		(item) =>
			item.key === queryItem.key && item.system === queryItem.system && item.type === queryItem.type
	);

	if (!existingItem) {
		return [[...firstGroupItems, queryItem], ...restGroups.map((group) => [...group])];
	}

	const existingValues = new Set(existingItem.values.map(({ value }) => JSON.stringify(value)));
	const mergedValues = [
		...existingItem.values,
		...queryItem.values.filter(({ value }) => !existingValues.has(JSON.stringify(value)))
	];
	const mergedFirstGroup = firstGroupItems.map((item) =>
		item === existingItem ? { ...item, values: mergedValues } : item
	);

	return [mergedFirstGroup, ...restGroups.map((group) => [...group])];
}

type ChartQueryPasser = {
	getQueryAPI(): QueryItem[][];
	setQueryStoreAPI(query: QueryItem[][]): void;
	addStratifierToQueryAPI(selection: {
		label: string;
		catalogueGroupCode: string;
		parentGroupCode?: string;
		system?: string;
	}): void;
};

let chartSelectionId = 0;

/** Add a value already returned by a scoped chart, even if global suggestions are hidden. */
export function addChartQueryItem(
	dataPasser: ChartQueryPasser,
	queryItem: QueryItem,
	assignedFilter?: unknown
): void {
	if (isQueryItemRedundantWithAssignedFilter(queryItem, assignedFilter)) return;

	for (const selected of queryItem.values) {
		// A missing numeric/date value is an equality filter, not a numeric range.
		// Passing null through Lens' string lookup would create NaN range bounds.
		if (selected.value === null) {
			const id = `ovis-chart-${Date.now()}-${++chartSelectionId}`;
			dataPasser.setQueryStoreAPI(
				appendQueryItemToFirstGroup(dataPasser.getQueryAPI(), {
					...queryItem,
					id,
					name: `${queryItem.system}:${queryItem.key}:${queryItem.type}`,
					values: [{ ...selected, name: '-', queryBindId: id }]
				})
			);
			continue;
		}
		if (
			(queryItem.type === 'BETWEEN' || queryItem.type === 'NBETWEEN') &&
			selected.value &&
			typeof selected.value === 'object' &&
			'min' in selected.value &&
			'max' in selected.value
		) {
			const { min, max } = selected.value;
			if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) continue;
			const query = dataPasser.getQueryAPI();
			const existing = query[0]?.find(
				(item) =>
					item.key === queryItem.key &&
					item.system === queryItem.system &&
					item.type === queryItem.type
			);
			const id = `ovis-chart-${Date.now()}-${++chartSelectionId}`;
			dataPasser.setQueryStoreAPI(
				appendQueryItemToFirstGroup(query, {
					...queryItem,
					id: existing?.id ?? id,
					name: existing?.name ?? `${queryItem.system}:${queryItem.key}:${queryItem.type}`,
					values: [{ ...selected, name: `${min} - ${max}`, queryBindId: id }]
				})
			);
			continue;
		}
		// Keep Lens' field names, IDs, descriptions and date/number conversion. These
		// also let later quick selections and individual removal use the same row.
		dataPasser.addStratifierToQueryAPI({
			label: String(selected.value),
			catalogueGroupCode: queryItem.key,
			parentGroupCode: queryItem.system,
			system: queryItem.system
		});
		const query = dataPasser.getQueryAPI();
		// Lens puts the newly inserted/updated row last; the same field may also
		// have a separate equality-to-null row before its numeric/date range.
		const metadata = query[0]
			?.slice()
			.reverse()
			.find((item) => item.key === queryItem.key && item.system === queryItem.system);
		if (metadata?.values.some(({ value }) => Object.is(value, selected.value))) continue;
		// Numeric/date catalogue fields produce ranges instead of the clicked string.
		if (metadata && metadata.type !== queryItem.type && metadata.values.length > 0) continue;

		// An empty categorical lookup still supplies native field metadata. Fill it
		// with the visible chart value; never restore the global catalogue criteria.
		// IDs need uniqueness, not a secure context (clinic deployments can use HTTP).
		const selectionId = `ovis-chart-${Date.now()}-${++chartSelectionId}`;
		const fallback: QueryItem = {
			...queryItem,
			id: metadata?.id ?? selectionId,
			name: metadata?.name ?? `${queryItem.system}:${queryItem.key}:${queryItem.type}`,
			type: metadata?.type ?? queryItem.type,
			values: [{ ...selected, name: String(selected.value), queryBindId: selectionId }]
		};
		dataPasser.setQueryStoreAPI(appendQueryItemToFirstGroup(query, fallback));
	}
}

/** Suppress only selections guaranteed by every allowed branch of the assigned filter.
 * This controls the editable query display; the backend still enforces access independently.
 */
export function isQueryItemRedundantWithAssignedFilter(
	queryItem: QueryItem,
	assignedFilter: unknown
): boolean {
	if (queryItem.type !== 'EQUALS' || queryItem.values.length !== 1) return false;
	if (typeof assignedFilter === 'string') {
		try {
			assignedFilter = JSON.parse(assignedFilter);
		} catch {
			return false;
		}
	}
	const selectedValues = queryItem.values.map(({ value }) => value);
	function impliesSelection(value: unknown, depth = 0): boolean {
		if (!value || typeof value !== 'object' || depth > 64) return false;
		const node = value as Record<string, unknown>;
		if (Array.isArray(node.children)) {
			if (node.children.length === 0) return false;
			if (node.operand === 'AND') {
				return node.children.some((child) => impliesSelection(child, depth + 1));
			}
			if (node.operand === 'OR') {
				return node.children.every((child) => impliesSelection(child, depth + 1));
			}
			return false;
		}
		return (
			node.key === queryItem.key &&
			node.system === queryItem.system &&
			node.type === 'EQUALS' &&
			selectedValues.some((selected) => Object.is(node.value, selected))
		);
	}
	return impliesSelection(assignedFilter);
}
