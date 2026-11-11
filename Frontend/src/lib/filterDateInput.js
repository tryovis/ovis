/**
 * Read both UTC calendar dates and the local-midnight values in existing filters.
 * @param {number | string | null | undefined} timestamp
 */
export function formatDateForInput(timestamp) {
	if (
		timestamp === null ||
		timestamp === undefined ||
		(typeof timestamp === 'string' && timestamp.trim() === '')
	) {
		return '';
	}
	const n = Number(timestamp);
	const date = new Date(Number.isNaN(n) ? timestamp : n);
	if (Number.isNaN(date.getTime())) return '';
	if (date.getTime() % 86400000 === 0) return date.toISOString().split('T')[0];
	const year = String(date.getFullYear()).padStart(4, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/** @param {{min: number | string | null, max: number | string | null}} range @param {string} separator */
export function formatFilterDateRange({ min, max }, separator) {
	const display = (bound) => formatDateForInput(bound).split('-').reverse().join('.') || '-';
	if (min == null && max == null) return '-';
	if (min == null) return `≤ ${display(max)}`;
	if (max == null) return `≥ ${display(min)}`;
	const start = display(min);
	const end = display(max);
	return start === end ? start : `${start}${separator}${end}`;
}

/**
 * Parse and validate a local calendar day for editing and calendar arithmetic.
 * @param {unknown} value Native date input value (YYYY-MM-DD), or an empty string.
 * @returns {number | null}
 */
export function parseDateInput(value) {
	if (typeof value !== 'string' || !/^\d{4,}-\d{2}-\d{2}$/.test(value)) return null;
	const [year, month, day] = value.split('-').map(Number);
	if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;

	// setFullYear also handles years 1–99 without the Date constructor's 1900 offset.
	const date = new Date(0);
	date.setFullYear(year, month - 1, day);
	date.setHours(0, 0, 0, 0);
	if (
		Number.isNaN(date.getTime()) ||
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null;
	}
	return date.getTime();
}

/**
 * The backend rounds each bound up to UTC midnight. West of UTC, use the
 * selected day's UTC midnight so it does not round to the following day.
 * @param {number | null} localMidnight
 */
export function dateFilterBound(localMidnight) {
	if (localMidnight === null || new Date(localMidnight).getTimezoneOffset() <= 0) return localMidnight;
	return Date.parse(formatDateForInput(localMidnight));
}
