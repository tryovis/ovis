export type ImportMode = 'ccp' | 'credos' | 'onkostar' | 'ovis';

export type VariantTableColumn = {
	readonly data?: string;
	readonly header?: string;
	readonly ccp?: boolean;
	readonly ovis?: boolean;
	readonly [key: string]: unknown;
};

export function normalizeImportMode(importMode: string | undefined | null): ImportMode {
	const normalized = importMode?.trim().toLowerCase();

	if (normalized === 'ccp' || normalized === 'credos' || normalized === 'onkostar') {
		return normalized;
	}

	return 'ovis';
}

export function filterColumnsForImportMode<TColumn extends VariantTableColumn>(
	columns: readonly TColumn[],
	importMode: string | undefined | null
): TColumn[] {
	const normalizedMode = normalizeImportMode(importMode);

	if (normalizedMode === 'ccp') {
		return columns.filter((column) => column.ccp !== false && column.ovis !== true);
	}

	if (normalizedMode === 'credos') {
		return columns.filter((column) => column.ccp !== true && column.ovis !== true);
	}

	return columns.filter((column) => column.ccp !== true && column.ovis !== false);
}

export function buildTableHeaders(columns: readonly VariantTableColumn[]): string[] {
	const columnHeaders =
		columns.length > 0 && columns.some((column) => column.header)
			? columns.map((column) => column.header ?? '')
			: columns.map((_, index) => `col${index + 1}`);

	return ['_id', ...columnHeaders];
}
