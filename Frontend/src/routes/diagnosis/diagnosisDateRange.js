/** Match MongoDB's UTC $year/$month/$week buckets, including its Sunday-based week 0. */
export function getDiagnosisChartDateRange(category) {
	if (typeof category !== 'string') return null;
	const match = /^(\d{4})(?:-(?:Q([1-4])|(\d{2})|W(\d{2})))?$/.exec(category);
	if (!match) return null;
	const year = Number(match[1]);
	// Clinical chart years are four-digit years; Date.UTC treats 00-99 specially.
	if (year < 100) return null;
	const yearStart = Date.UTC(year, 0, 1);
	const nextYear = Date.UTC(year + 1, 0, 1);
	let min = yearStart;
	let endExclusive = nextYear;
	if (match[2]) {
		const startMonth = (Number(match[2]) - 1) * 3;
		min = Date.UTC(year, startMonth, 1);
		endExclusive = Date.UTC(year, startMonth + 3, 1);
	} else if (match[3]) {
		const month = Number(match[3]);
		if (month < 1 || month > 12) return null;
		min = Date.UTC(year, month - 1, 1);
		endExclusive = Date.UTC(year, month, 1);
	} else if (match[4]) {
		const week = Number(match[4]);
		if (week > 53) return null;
		const day = 24 * 60 * 60 * 1000;
		const firstSunday = yearStart + ((7 - new Date(yearStart).getUTCDay()) % 7) * day;
		if (week === 0) {
			endExclusive = firstSunday;
		} else {
			min = firstSunday + (week - 1) * 7 * day;
			endExclusive = Math.min(min + 7 * day, nextYear);
		}
	}
	// Date filters store inclusive calendar dates at midnight. The backend rounds
	// non-midnight bounds upward; an end-of-day value would include the next day.
	return min < endExclusive ? { min, max: endExclusive - 24 * 60 * 60 * 1000 } : null;
}
