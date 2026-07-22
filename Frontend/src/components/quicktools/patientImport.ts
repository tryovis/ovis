const normalizeIdToken = (token: unknown): string => {
	if (token == null) return '';
	if (typeof token === 'number' && Number.isFinite(token)) {
		if (Number.isInteger(token)) return String(Math.trunc(token));
		return String(token);
	}
	return String(token)
		.trim()
		.replace(/^['"]|['"]$/g, '');
};

const looksLikeHeader = (id: string): boolean => {
	const normalizedId = id.trim().toLowerCase();
	return (
		normalizedId === 'patid' ||
		normalizedId === 'pat_id' ||
		normalizedId === 'patientid' ||
		normalizedId === 'patient_id'
	);
};

type ParsedPatientIds = {
	readonly idsRaw: readonly string[];
	readonly attemptedRows: number;
};

type PatientIdsPasteEvent = {
	readonly clipboardData: {
		getData(type: string): string;
	} | null;
	preventDefault(): void;
};

export const parseIdsFromText = (text: string): ParsedPatientIds => {
	const lines = text.split(/\r?\n/);
	const idsRaw: string[] = [];
	let attemptedRows = 0;

	for (const line of lines) {
		const trimmedLine = line.trim();
		if (!trimmedLine) continue;
		const firstCell = trimmedLine.split(/[\t,;]+/)[0] ?? '';

		for (const token of firstCell.split(/\s+/)) {
			attemptedRows += 1;
			const id = normalizeIdToken(token);
			if (!id || looksLikeHeader(id)) continue;
			idsRaw.push(id);
		}
	}

	return { idsRaw, attemptedRows };
};

export const parseIdsFromPasteEvent = (event: PatientIdsPasteEvent): ParsedPatientIds | null => {
	const pastedText = event.clipboardData?.getData('text') ?? '';
	if (!pastedText) return null;
	event.preventDefault();
	return parseIdsFromText(pastedText);
};
