import type { AggregatedValue } from './types/query';

export type QueryValue = {
	name: string;
	value: string | { min: number; max: number } | AggregatedValue[][] | number | null;
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
	queryItem: QueryItem
): QueryItem[][] {
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

	const existingValues = new Set(existingItem.values.map((value) => value.value));
	const mergedValues = [
		...existingItem.values,
		...queryItem.values.filter((value) => !existingValues.has(value.value))
	];
	const mergedFirstGroup = firstGroupItems.map((item) =>
		item === existingItem ? { ...item, values: mergedValues } : item
	);

	return [mergedFirstGroup, ...restGroups.map((group) => [...group])];
}
