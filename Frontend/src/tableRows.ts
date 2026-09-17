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

/** Maximized route panels have auto height. Their own bottom follows the current
 * page length, so only the enclosing content area can provide a stable limit. */
export function getTablePanelBottom(
	tableContainer: Element,
	maximized = false
): number | undefined {
	const panel = getTablePanel(tableContainer);
	if (!panel) return undefined;
	if (!maximized) return panel.getBoundingClientRect().bottom;
	const content = panel.closest('.content-view');
	if (!(content instanceof HTMLElement)) return undefined;
	const contentStyle = getComputedStyle(content);
	const panelStyle = getComputedStyle(panel);
	return (
		content.getBoundingClientRect().bottom -
		(Number.parseFloat(contentStyle.paddingBottom) || 0) -
		(Number.parseFloat(contentStyle.borderBottomWidth) || 0) -
		(Number.parseFloat(panelStyle.marginBottom) || 0)
	);
}

export function calculateTableShownRowsForContainer(
	tableContainer: Element,
	fallbackRows: number,
	rowHeight = 32,
	maximized = false
): number {
	const tablePanel = getTablePanel(tableContainer);
	const bottom = getTablePanelBottom(tableContainer, maximized);
	const panelHeight = maximized
		? tablePanel && bottom != null
			? Math.max(0, bottom - tablePanel.getBoundingClientRect().top)
			: undefined
		: tablePanel?.clientHeight;
	return calculateTableShownRows({
		panelHeight,
		hasNavbar: tablePanel?.querySelector('.navbar') != null,
		fallbackRows,
		rowHeight
	});
}
