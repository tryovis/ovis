const LENS_MODULE_SUFFIX = '/@samply/lens/dist/lens.js';
const ORIGINAL_OPERATOR_ENUM = `enum: [
          "EQUALS",
          "BETWEEN"
        ]`;
const EXTENDED_OPERATOR_ENUM = `enum: [
          "EQUALS",
          "BETWEEN",
          "NEQUALS",
          "NBETWEEN"
        ]`;

export function extendLensCatalogueOperatorSchema(code) {
	if (code.includes(EXTENDED_OPERATOR_ENUM)) return code;

	const firstMatch = code.indexOf(ORIGINAL_OPERATOR_ENUM);
	if (firstMatch === -1) {
		throw new Error('Unable to locate the Lens catalogue operator enum');
	}
	if (code.indexOf(ORIGINAL_OPERATOR_ENUM, firstMatch + ORIGINAL_OPERATOR_ENUM.length) !== -1) {
		throw new Error('Lens catalogue operator enum is ambiguous');
	}

	return code.replace(ORIGINAL_OPERATOR_ENUM, EXTENDED_OPERATOR_ENUM);
}

// Lens 0.4.4 groups query rows by their display name. OVIS catalogues can contain
// the same label in several collections, so identity must include the field scope.
export function extendLensQueryIdentity(code) {
	if (code.includes('/* ovis-scoped-query-identity */')) return code;
	const replacements = [
		[
			'return t.children.length === 1 && t.children[0] === null ? {',
			'return t === null || (t.children.length === 1 && t.children[0] === null) ? {'
		],
		['const s = i.name;', 'const s = JSON.stringify([i.system || "", i.key, i.type]);'],
		[
			'(o) => o.name !== e.name',
			'(o) => o.key !== e.key || (o.system || "") !== (e.system || "") || o.type !== e.type'
		],
		[
			's.name === e.name && (s.values',
			's.key === e.key && (s.system || "") === (e.system || "") && s.type === e.type && (s.values'
		],
		['(a) => a.name === r.name', '(a) => JSON.stringify(a.value) === JSON.stringify(r.value)'],
		['t = i != null ? i.name : "", n = e.value;', 't = i != null ? i.name : e.value, n = e.value;'],
		[
			'else if (typeof e.value == "boolean")\n    n = e.value.toString();',
			'else if (e.value === null || typeof e.value == "number" || typeof e.value == "boolean")\n    t = String(e.value ?? "-"), n = e.value;'
		],
		[
			't = e.value.min === 0 ? ` ≤ ${e.value.max}` : e.value.max === 0 ? ` ≥ ${e.value.min}` : ` ${e.value.min} - ${e.value.max}`, typeof e.value.min == "number" && typeof e.value.max == "number"',
			't = e.value.min == null ? ` ≤ ${e.value.max}` : e.value.max == null ? ` ≥ ${e.value.min}` : ` ${e.value.min} - ${e.value.max}`, [e.value.min, e.value.max].every((bound) => bound == null || typeof bound === "number" || typeof bound === "string")'
		]
	];
	for (const [original, replacement] of replacements) {
		if (code.split(original).length !== 2) {
			throw new Error(`Review the Lens query identity adapter: ${original}`);
		}
		code = code.replace(original, replacement);
	}
	return `/* ovis-scoped-query-identity */\n${code}`;
}

/** @returns {import('vite').Plugin} */
export function lensCatalogueSchemaCompatibility() {
	return {
		name: 'lens-catalogue-schema-compatibility',
		enforce: 'pre',
		transform(code, id) {
			if (!id.split('?')[0].replaceAll('\\', '/').endsWith(LENS_MODULE_SUFFIX)) return null;

			return {
				code: extendLensQueryIdentity(extendLensCatalogueOperatorSchema(code)),
				map: null
			};
		}
	};
}
