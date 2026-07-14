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

export function lensCatalogueSchemaCompatibility() {
	return {
		name: 'lens-catalogue-schema-compatibility',
		enforce: 'pre',
		transform(code, id) {
			if (!id.replaceAll('\\', '/').endsWith(LENS_MODULE_SUFFIX)) return null;

			return {
				code: extendLensCatalogueOperatorSchema(code),
				map: null
			};
		}
	};
}
