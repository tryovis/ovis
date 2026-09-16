/**
 * Filter dates use local calendar days, matching the DatePicker and filter overview.
 * Reading UTC components here would display the previous day for local midnight in Berlin.
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
	const year = String(date.getFullYear()).padStart(4, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * Store both inclusive bounds at local midnight, as the DatePicker does.
 * The backend normalizes date bounds to UTC midnight; an end-of-day timestamp
 * would be rounded up and incorrectly include the following day.
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
