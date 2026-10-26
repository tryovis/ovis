import { ops4 } from './ops4.mjs';

const opsGroupTexts = new Map(ops4.map(({ OPSC_4, OPS_Gruppen_Text }) => [OPSC_4, OPS_Gruppen_Text]));

/** OPS group text ("Kategorie") for a code, keyed by its first four characters, e.g. 5-894.y -> 5-89. */
export function opsGroupText(code) {
	return opsGroupTexts.get(String(code ?? '').substring(0, 4)) ?? null;
}

export function parseSurgeon(value) {
	if (Array.isArray(value))
		return value.filter((entry) => typeof entry === 'string' && entry.trim());
	if (typeof value !== 'string') return value ?? null;

	const entries = value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);

	return entries.length > 0 ? entries : null;
}
