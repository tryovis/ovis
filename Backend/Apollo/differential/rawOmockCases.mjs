import { rawAgeAtDiagnosis, rawOmockDate } from './omockMetricReference.mjs';

// Case expectations are direct predicates over source records, not an AST
// interpreter or a copy of the Mongo query translator.
const node = (system, key, type, value) => ({ system, key, type, value });
const condition = (name, ast, matches) => ({ name, ast, matches });
export const allRawRows = condition('all', null, () => true);
export const and = (...parts) =>
	condition(
		parts.map(({ name }) => name).join(' AND '),
		{ operand: 'AND', children: parts.filter(({ ast }) => ast).map(({ ast }) => ast) },
		(d, p, raw) => parts.every((part) => part.matches(d, p, raw))
	);
export const or = (...parts) =>
	condition(
		parts.map(({ name }) => name).join(' OR '),
		{ operand: 'OR', children: parts.map(({ ast }) => ast) },
		(d, p, raw) => parts.some((part) => part.matches(d, p, raw))
	);
const emptyLike = (value) =>
	value == null || ['', ' ', '-'].includes(value) || (Array.isArray(value) && value.length === 0);
const valuesEqual = (value, requested) =>
	requested === '-'
		? emptyLike(value)
		: requested === null
		? value == null
		: Object.is(value, requested);

const equality = (system, key, value, read, negate = false) =>
	condition(
		`${system}.${key}${negate ? '!=' : '='}${JSON.stringify(value)}`,
		node(system, `${negate ? '!' : ''}${key}`, negate ? 'NEQUALS' : 'EQUALS', value),
		(d, p, raw) =>
			(system === 'patient' ? !!p : !!d) &&
			(negate ? !valuesEqual(read(d, p, raw), value) : valuesEqual(read(d, p, raw), value))
	);
const icd = (value, negate = false) =>
	equality(
		'diagnosis',
		'ICD_ICD10_3',
		value,
		(d) => (typeof d.ICD_ICD10 === 'string' ? d.ICD_ICD10.slice(0, 3) : ''),
		negate
	);
const gender = (value, negate = false) =>
	equality('patient', 'gender', value, (_d, p) => p.gender, negate);
const reason = (value, negate = false) =>
	equality('diagnosis', 'diagnosisReason', value, (d) => d.diagnosisReason, negate);
const surgery = (value) =>
	equality('diagnosis', 'previousTherapy_surgery', value, (d, _p, raw) =>
		raw.therapy.some(
			(event) =>
				event.tumorID === d.tumorID &&
				String(event.generalType ?? '')
					.trim()
					.toLowerCase() === 'operation'
		)
	);

function range(key, min, max, read, { negative = false, date = false } = {}) {
	const boundary = (value) => {
		if (value == null) return null;
		if (!date) return value;
		const instant = typeof value === 'number' ? new Date(value) : rawOmockDate(value);
		if (!instant) throw new Error('Invalid test range');
		const midnight = Date.UTC(
			instant.getUTCFullYear(),
			instant.getUTCMonth(),
			instant.getUTCDate()
		);
		return instant.getTime() === midnight ? midnight : midnight + 86400000;
	};
	const lower = boundary(min),
		upper = boundary(max);
	return condition(
		`${key}${negative ? ' NOT' : ''} [${min},${max}]`,
		node('diagnosis', `${negative ? '!' : ''}${key}`, negative ? 'NBETWEEN' : 'BETWEEN', {
			min,
			max
		}),
		(d, p) => {
			if (!d) return false;
			const value = read(d, p);
			const inside =
				value != null && (lower == null || value >= lower) && (upper == null || value <= upper);
			return negative ? !inside : inside;
		}
	);
}
const dates = (min, max, options = {}) =>
	range('diagnosisDate', min, max, (d) => rawOmockDate(d.diagnosisDate)?.getTime() ?? null, {
		...options,
		date: true
	});
const ages = (min, max, options) =>
	range(
		'ageAtDiagnosis',
		min,
		max,
		(d, p) => rawAgeAtDiagnosis(d.diagnosisDate, p?.birthDate),
		options
	);

export function rawFilterCases() {
	const year = dates('2024-01-01T00:00:00Z', '2024-12-31T00:00:00Z');
	const lungOrBreast = or(icd('C34'), icd('C50'));
	const locks = [
		allRawRows,
		icd('C34'),
		lungOrBreast,
		gender('w'),
		gender('m', true),
		and(lungOrBreast, gender('w')),
		year,
		or(and(icd('C34'), gender('m')), and(icd('C50'), gender('w'))),
		ages(50, 70),
		reason('-'),
		surgery(true),
		and(icd('C34', true), dates('2024-01-01T00:00:00Z', null))
	];
	const requests = [
		allRawRows,
		icd('C34'),
		icd('C50'),
		lungOrBreast,
		gender('m'),
		gender('w'),
		or(gender('m'), gender('w')),
		gender('m', true),
		gender(''),
		gender(null),
		gender('-'),
		gender('-', true),
		reason(''),
		reason(null),
		reason('-'),
		reason('', true),
		reason('-', true),
		year,
		dates('2024-02-29T00:00:00Z', '2024-02-29T00:00:00Z'),
		dates(Date.UTC(2024, 1, 29), Date.UTC(2024, 1, 29)),
		dates(null, '2024-02-29T00:00:00Z'),
		dates('2024-03-01T00:00:00Z', null),
		dates('2024-02-29T00:00:00Z', '2024-03-01T00:00:00Z', { negative: true }),
		dates('2024-02-28T23:00:00Z', '2024-02-29T23:00:00Z'),
		ages(20, 40),
		ages(50, 70),
		or(ages(20, 30), ages(60, 70)),
		ages(30, 60, { negative: true }),
		and(gender('w'), icd('C34'), year),
		or(and(gender('m'), icd('C34')), and(gender('w'), icd('C50'))),
		and(gender('m', true), reason('', true), year),
		surgery(true),
		surgery(false),
		dates('2024-02-01T00:00:00Z', '2024-02-01T00:00:00Z'),
		dates('2024-07-01T00:00:00Z', '2024-07-01T00:00:00Z')
	];
	return locks.flatMap((lock, lockIndex) =>
		requests.map((request, requestIndex) => ({
			name: `lock-${lockIndex}/request-${requestIndex}: ${lock.name} / ${request.name}`,
			lock,
			request,
			effective: and(lock, request)
		}))
	);
}

export function selectRawIds(raw, predicate) {
	const patients = new Map(raw.patient.map((p) => [p.patID, p]));
	const diagnosisByPatient = new Map();
	for (const d of raw.diagnosis) {
		const list = diagnosisByPatient.get(d.patID) ?? [];
		list.push(d);
		diagnosisByPatient.set(d.patID, list);
	}
	const tumorIds = raw.diagnosis
		.filter((d) => predicate.matches(d, patients.get(d.patID), raw))
		.map((d) => d.tumorID)
		.sort();
	const patientIds = raw.patient
		.filter((p) => {
			const tumors = diagnosisByPatient.get(p.patID) ?? [];
			return tumors.length
				? tumors.some((d) => predicate.matches(d, p, raw))
				: predicate.matches(undefined, p, raw);
		})
		.map((p) => p.patID)
		.sort();
	return { tumorIds, patientIds };
}

export function appendRawEdgeFixtures(source) {
	const raw = structuredClone(source);
	const patientFields = Object.keys(raw.patient[0]);
	const diagnosisFields = Object.keys(raw.diagnosis[0]);
	const therapyFields = Object.keys(raw.therapy[0]);
	const blank = (fields) => Object.fromEntries(fields.map((key) => [key, null]));
	const genders = ['m', 'w', 'd', 'x', '', null, undefined, ' ', '-'];
	const dateValues = [
		'2023-12-31T00:00:00Z',
		'2024-01-01T00:00:00Z',
		'2024-02-28T00:00:00Z',
		'2024-02-29T00:00:00Z',
		'2024-03-01T00:00:00Z',
		'2024-12-31T00:00:00Z',
		'2025-01-01T00:00:00Z',
		'',
		null,
		undefined,
		'not-a-date',
		'2023-02-29',
		'29.02.2024',
		'2024-02-29T23:00:00+01:00',
		'2024-03-01T00:00:00+01:00',
		'1.2.2024',
		'1.7.2024',
		'2024-03-01T00:00:00-05:00',
		' ',
		'-',
		'1900-01-01T00:00:00Z',
		'1899-12-31',
		'1.1.2024'
	];
	for (let index = 0; index < 36; index++) {
		const patID = `OMOCK-VERIFY-P${index}`;
		const tumorID = `OMOCK-VERIFY-T${index}`;
		const p = {
			...blank(patientFields),
			patID,
			firstName: 'Synthetic',
			lastName: `Case${index}`,
			birthDate:
				index === 33 ? 'not-a-date' : index === 34 ? null : `${1955 + (index % 6) * 10}-02-28`,
			gender: genders[index % genders.length],
			vitalState: index % 2 ? 'alive' : 'dead',
			vitalDate: '2026-01-01T00:00:00Z',
			countryCode: 'DE',
			postalCode: '80000'
		};
		if (p.gender === undefined) delete p.gender;
		const d = {
			...blank(diagnosisFields),
			patID,
			tumorID,
			ICD_ICD10: ['C34.1', 'C50.9', 'C32.0', ''][index % 4],
			diagnosisDate: dateValues[index % dateValues.length],
			diagnosisReason: genders[index % genders.length],
			ICDO_histologyCode: '8140/3',
			ICDO_histologyDate: '2024-01-01',
			primaryCase: 'true'
		};
		if (d.diagnosisDate === undefined) delete d.diagnosisDate;
		if (d.diagnosisReason === undefined) delete d.diagnosisReason;
		raw.patient.push(p);
		raw.diagnosis.push(d);
		raw.therapy.push({
			...blank(therapyFields),
			tumorID,
			therapyID: `OMOCK-VERIFY-H${index}`,
			generalType: index % 2 ? 'systemic' : 'operation',
			therapyOccurrenceDate: '2024-03-15T00:00:00Z'
		});
		if (index < 6)
			raw.diagnosis.push({
				...d,
				tumorID: `${tumorID}-SECOND`,
				ICD_ICD10: 'C50.9',
				diagnosisDate: '2025-01-01T00:00:00Z'
			});
	}
	raw.patient.push({
		...blank(patientFields),
		patID: 'OMOCK-VERIFY-WITHOUT-TUMOR',
		firstName: 'Synthetic',
		lastName: 'NoDiagnosis',
		gender: 'w',
		birthDate: '1960-01-01',
		vitalState: 'alive',
		vitalDate: '2026-01-01'
	});
	return raw;
}
