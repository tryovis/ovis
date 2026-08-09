const normalizeDate = (value) => {
	if (!value) return null;
	if (typeof value === 'string' && /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(value)) {
		const [day, month, year] = value.split('.');
		value = `${year}-${month}-${day}`;
	}
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime()) || date.getFullYear() < 1900) return null;
	return date;
};

const dateKey = (value) => {
	const date = normalizeDate(value);
	if (!date) return null;
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
};

const normalizeCode = (value) => String(value ?? '').trim().toUpperCase();

const markMixedTumors = (entries) => {
	const entriesByDate = new Map();

	for (const entry of entries) {
		entry.ICDO_mixedTumor = false;
		const key = dateKey(entry.ICDO_histologyDate);
		const code = normalizeCode(entry.ICDO_histologyCode);
		if (!key || !code) continue;

		let sameDate = entriesByDate.get(key);
		if (!sameDate) {
			sameDate = [];
			entriesByDate.set(key, sameDate);
		}
		sameDate.push(entry);
	}

	for (const sameDate of entriesByDate.values()) {
		const distinctCodes = new Set(
			sameDate.map((entry) => normalizeCode(entry.ICDO_histologyCode)).filter(Boolean)
		);
		if (distinctCodes.size < 2) continue;
		for (const entry of sameDate) entry.ICDO_mixedTumor = true;
	}

	return entries;
};

const diagnosisHistologyRow = (diagnosis) => ({
	tumorID: diagnosis.tumorID,
	patID: diagnosis.patID,
	ICDO_histologyCode: diagnosis.ICDO_histologyCode,
	ICDO_histologyCodeText:
		diagnosis.ICDO_histologyCodeText ?? diagnosis.ICDO_histologyDescription,
	ICDO_histologyDescription: diagnosis.ICDO_histologyDescription,
	ICDO_histologyDate: normalizeDate(diagnosis.ICDO_histologyDate),
	ICDO_localizationCode: diagnosis.ICDO_localizationCode,
	ICDO_localizationCodeText: diagnosis.ICDO_localizationCodeText,
	ICDO_source: 'diagnosis',
	ICDO_mixedTumor: false
});

const pathologyHistologyRow = (histology, diagnosis) => ({
	...histology,
	tumorID: diagnosis.tumorID,
	patID: diagnosis.patID ?? histology.patID,
	ICDO_histologyCodeText:
		histology.ICDO_histologyCodeText ?? histology.ICDO_histologyDescription,
	ICDO_histologyDate: normalizeDate(histology.ICDO_histologyDate),
	ICDO_grading: histology.ICDO_grading ?? histology.grading,
	ICDO_source: 'other',
	ICDO_mixedTumor: false
});

export function materializeHistologyDocuments(diagnoses = [], histologies = []) {
	const histologiesByTumorID = new Map();
	for (const histology of histologies) {
		let entries = histologiesByTumorID.get(histology?.tumorID);
		if (!entries) {
			entries = [];
			histologiesByTumorID.set(histology?.tumorID, entries);
		}
		entries.push(histology);
	}

	const documents = [];
	for (const diagnosis of diagnoses) {
		const entries = [
			diagnosisHistologyRow(diagnosis),
			...(histologiesByTumorID.get(diagnosis?.tumorID) ?? []).map((histology) =>
				pathologyHistologyRow(histology, diagnosis)
			)
		];
		documents.push(...markMixedTumors(entries));
	}

	return documents;
}

const gradingOrdinal = (value) => {
	if (value === 'unbekannt') return -2;
	if (value === 'Trifft nicht zu') return -1;
	if (value === 'Differenzierungsgrad nicht bestimmbar') return 0;
	if (value === '0') return 1;
	if (value === '1') return 2;
	if (/^niedriggradig/i.test(value ?? '')) return 3;
	if (value === '2') return 4;
	if (/^mittelgradig maligne/i.test(value ?? '')) return 5;
	if (value === '3') return 6;
	if (/^hochgradig/i.test(value ?? '')) return 7;
	if (value === '4') return 8;
	return -3;
};

export function deriveGradingFeatures(histologies = []) {
	const datedGradings = histologies
		.map((histology, index) => ({
			grading: histology?.ICDO_grading ?? histology?.grading,
			date: normalizeDate(histology?.ICDO_histologyDate),
			index
		}))
		.filter(({ grading }) => grading !== undefined)
		.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0) || a.index - b.index);

	if (datedGradings.length === 0) {
		return {
			grading_first: null,
			grading_last: null,
			grading_lowest: null,
			grading_highest: null
		};
	}

	let lowest = datedGradings[0];
	let highest = datedGradings[0];
	for (const entry of datedGradings.slice(1)) {
		if (gradingOrdinal(entry.grading) < gradingOrdinal(lowest.grading)) lowest = entry;
		if (gradingOrdinal(entry.grading) > gradingOrdinal(highest.grading)) highest = entry;
	}

	return {
		grading_first: datedGradings[0].grading,
		grading_last: datedGradings.at(-1).grading,
		grading_lowest: lowest.grading,
		grading_highest: highest.grading
	};
}

export function getHistologyCodes(diagnosis, histologies = []) {
	return [
		diagnosis?.ICDO_histologyCode,
		...histologies.map((histology) => histology?.ICDO_histologyCode)
	].filter((code) => code !== undefined && code !== null && code !== '');
}
