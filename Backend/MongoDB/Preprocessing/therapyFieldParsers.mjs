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
