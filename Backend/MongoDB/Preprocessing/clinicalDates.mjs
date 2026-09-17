/**
 * Normalize dates accepted by the OMock importer. Missing/invalid values and
 * dates before 1900 are unknown, not JavaScript's numeric epoch value.
 */
export const sanitizeDate = (value) => {
	if (!value) return null;
	if (typeof value === 'string') {
		const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
		const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T|$)/.exec(value);
		if (german || iso) {
			const [year, month, day] = german
				? [Number(german[3]), Number(german[2]), Number(german[1])]
				: [Number(iso[1]), Number(iso[2]), Number(iso[3])];
			// Date('2023-02-29') silently rolls forward to March. A source calendar
			// date that never existed must not enter date filters or age calculations.
			const check = new Date(Date.UTC(year, month - 1, day));
			if (
				check.getUTCFullYear() !== year ||
				check.getUTCMonth() !== month - 1 ||
				check.getUTCDate() !== day
			)
				return null;
			// Date-only values use ISO's UTC calendar form, including the legacy
			// unpadded yyyy-m-d input. Explicit timestamp offsets stay untouched.
			if (german || !value.includes('T'))
				value = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(
					day
				).padStart(2, '0')}`;
		}
	}
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1900 ? null : date;
};

/** Preserve the existing rounded elapsed-year convention for valid inputs. */
export const calculateAgeAtDiagnosis = (diagnosisDate, birthDate) => {
	const diagnosis = sanitizeDate(diagnosisDate);
	const birth = sanitizeDate(birthDate);
	if (!diagnosis || !birth) return null;
	return Math.round(Math.abs(diagnosis.getTime() - birth.getTime()) / (86_400_000 * 365.2425));
};

// Study and recruitment dates accept the same German and ISO forms, including
// ISO fractional seconds. A dot alone does not identify a German calendar date.
export const normalizeStudyDate = (value) => sanitizeDate(value);
