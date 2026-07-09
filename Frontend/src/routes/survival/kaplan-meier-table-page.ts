export type KaplanMeierTableCell = string | number;

export type KaplanMeierTableRow = Readonly<Record<string, KaplanMeierTableCell>>;

export type KaplanMeierSourceRow = Readonly<{
	time: number;
	event: number;
	group: string;
	surv: number;
	upper: number;
	lower: number;
	n: number;
	nevent: number;
	ncensor: number;
	tumorID: string;
	status?: number;
}>;

export type KaplanMeierTableColumn = Readonly<{
	data: string;
}>;

export type KaplanMeierTableOptions = Readonly<{
	selectedTimeType: string;
	selectedConfidenceType: string;
	columns: readonly KaplanMeierTableColumn[];
	eventLabel: string;
}>;

export type KaplanMeierTableColumnFilter = Readonly<{
	field: string;
	value: string;
}>;

export type KaplanMeierTablePageRequest = Readonly<{
	offset: number;
	limit: number;
	sortField: string | null;
	sortDirection: 'asc' | 'desc';
	columnFilters: readonly KaplanMeierTableColumnFilter[];
}>;

export type KaplanMeierTablePage = Readonly<{
	rows: KaplanMeierTableRow[];
	total: number;
	filtered: number;
}>;

export type KaplanMeierTableData = Readonly<{
	rows: KaplanMeierTableRow[];
	reorderedRows: KaplanMeierTableRow[];
}>;

export function getKaplanMeierDaysDivider(timetype: string): number {
	switch (timetype) {
		case 'Monat':
			return 30.44;
		case 'Jahr':
			return 365;
		default:
			return 1;
	}
}

export function buildKaplanMeierTableData(
	sourceRows: readonly KaplanMeierSourceRow[],
	options: KaplanMeierTableOptions
): KaplanMeierTableData {
	const rows: KaplanMeierTableRow[] = [];
	const reorderedRows: KaplanMeierTableRow[] = [];
	const daysDivider = getKaplanMeierDaysDivider(options.selectedTimeType);
	const hideConfidenceInterval = options.selectedConfidenceType === 'Kein Konf.-Intervall';

	for (const entry of sourceRows) {
		if (entry.event === 2 || entry.status === 2) continue;

		const row: KaplanMeierTableRow = {
			tumorID: entry.tumorID,
			time: roundTableNumber(entry.time / daysDivider),
			event: entry.event === 0 ? 'Zensur' : options.eventLabel,
			nevent: roundTableNumber(entry.nevent),
			ncensor: roundTableNumber(entry.ncensor),
			n: roundTableNumber(entry.n),
			surv: roundTableNumber(entry.surv),
			upper: hideConfidenceInterval ? '' : roundTableNumber(entry.upper),
			lower: hideConfidenceInterval ? '' : roundTableNumber(entry.lower),
			group: entry.group
		};

		rows.push(row);
		reorderedRows.push(reorderTableRow(row, options.columns));
	}

	return { rows, reorderedRows };
}

export function fetchKaplanMeierTablePage(
	rows: readonly KaplanMeierTableRow[],
	request: KaplanMeierTablePageRequest
): KaplanMeierTablePage {
	const filteredRows =
		request.columnFilters.length === 0
			? rows
			: rows.filter((row) =>
					request.columnFilters.every((filter) => rowMatchesFilter(row, filter))
			  );
	const orderedRows = request.sortField
		? [...filteredRows].sort((left, right) =>
				compareRows(left, right, request.sortField ?? '', request.sortDirection)
		  )
		: filteredRows;

	return {
		rows: orderedRows.slice(request.offset, request.offset + request.limit),
		total: rows.length,
		filtered: filteredRows.length
	};
}

function roundTableNumber(value: number): number {
	return Number(value.toFixed(2));
}

function reorderTableRow(
	row: KaplanMeierTableRow,
	columns: readonly KaplanMeierTableColumn[]
): KaplanMeierTableRow {
	const reorderedRow: Record<string, KaplanMeierTableCell> = {};
	for (const column of columns) {
		reorderedRow[column.data] = row[column.data] ?? '';
	}
	return reorderedRow;
}

function rowMatchesFilter(row: KaplanMeierTableRow, filter: KaplanMeierTableColumnFilter): boolean {
	return String(row[filter.field] ?? '')
		.toLocaleLowerCase()
		.includes(filter.value.toLocaleLowerCase());
}

function compareRows(
	left: KaplanMeierTableRow,
	right: KaplanMeierTableRow,
	field: string,
	direction: 'asc' | 'desc'
): number {
	const leftValue = left[field] ?? '';
	const rightValue = right[field] ?? '';
	const comparison =
		typeof leftValue === 'number' && typeof rightValue === 'number'
			? leftValue - rightValue
			: String(leftValue).localeCompare(String(rightValue), 'de');

	return direction === 'asc' ? comparison : -comparison;
}
