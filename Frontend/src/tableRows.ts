export type TableShownRowsInput = {
	readonly panelHeight: number | undefined;
	readonly hasNavbar: boolean;
	readonly fallbackRows: number;
	readonly rowHeight?: number;
};

const tablePanelSelector = 'div[class*="table"][class*="box_level2"], .box_level2';

export function calculateTableShownRows({
	panelHeight,
	hasNavbar,
	fallbackRows,
	rowHeight = 32
}: TableShownRowsInput): number {
	if (panelHeight == null || rowHeight <= 0) {
		return fallbackRows;
	}

	const navbarAdjustment = hasNavbar ? 45 : 0;
	const rows = Math.floor((panelHeight - 170 - navbarAdjustment) / rowHeight);
	return Math.max(1, rows);
}

export function getTablePanel(tableContainer: Element): HTMLElement | undefined {
	const tablePanel = tableContainer.closest(tablePanelSelector);
	return tablePanel instanceof HTMLElement ? tablePanel : undefined;
}

export function calculateTableShownRowsForContainer(
	tableContainer: Element,
	fallbackRows: number,
	rowHeight = 32
): number {
	const tablePanel = getTablePanel(tableContainer);
	return calculateTableShownRows({
		panelHeight: tablePanel?.clientHeight,
		hasNavbar: tablePanel?.querySelector('.navbar') != null,
		fallbackRows,
		rowHeight
	});
}
