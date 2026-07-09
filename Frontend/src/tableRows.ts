export type TableShownRowsInput = {
	readonly panelHeight: number | undefined;
	readonly hasNavbar: boolean;
	readonly fallbackRows: number;
};

export function calculateTableShownRows({
	panelHeight,
	hasNavbar,
	fallbackRows
}: TableShownRowsInput): number {
	if (panelHeight == null) {
		return fallbackRows;
	}

	const navbarAdjustment = hasNavbar ? 45 : 0;
	const rows = Math.floor((panelHeight - 170 - navbarAdjustment) / 32);
	return rows > 0 ? rows : fallbackRows;
}
