import { dateFilterBound, parseDateInput } from './filterDateInput.js';

/** @param {string | null} selectedDate A table or quick selection in D.M.YYYY format. */
export function datePickerParts(selectedDate) {
	const [day = '', month = '', year = ''] = (selectedDate ?? '').split('.');
	return { day: day.padStart(2, '0'), month: month.padStart(2, '0'), year };
}

/** @param {number} timestamp @param {number} days */
function shiftCalendarDay(timestamp, days) {
	const date = new Date(timestamp);
	date.setDate(date.getDate() + days);
	return date.getTime();
}

/**
 * Convert the visible comparison to the inclusive calendar bounds used by the filter API.
 * @param {'=' | '>=' | '>' | '<=' | '<' | '[]'} operator
 * @param {boolean} yearsOnly
 * @param {ReturnType<typeof datePickerParts>} start
 * @param {ReturnType<typeof datePickerParts>} [rangeEnd] The second input for a between comparison.
 * @returns {{min: number | null, max: number | null} | null}
 */
export function datePickerRange(operator, yearsOnly, start, rangeEnd = start) {
	const end = operator === '[]' ? rangeEnd : start;
	const first = parseDateInput(yearsOnly ? `${start.year}-01-01` : `${start.year}-${start.month}-${start.day}`);
	const last = parseDateInput(yearsOnly ? `${end.year}-12-31` : `${end.year}-${end.month}-${end.day}`);
	switch (operator) {
		case '>=':
			return first === null ? null : { min: dateFilterBound(first), max: null };
		case '>':
			return last === null ? null : { min: dateFilterBound(shiftCalendarDay(last, 1)), max: null };
		case '<=':
			return last === null ? null : { min: null, max: dateFilterBound(last) };
		case '<':
			return first === null ? null : { min: null, max: dateFilterBound(shiftCalendarDay(first, -1)) };
		default:
			return first === null || last === null || first > last ? null : { min: dateFilterBound(first), max: dateFilterBound(last) };
	}
}
