// enetsCancerCategories.js

// ============================================================================
// Kategorien
// ============================================================================

export const enetsCategoryLabels = {
	enetsGepNen: 'ENETS / GEP-NEN gesamt',
	gepNet: 'GEP-NET',
	gepNec: 'GEP-NEC',
	minen: 'MiNEN',
	enetsUnclear: 'Unklar / prüfen'
};

// ============================================================================
// Aggregationen
//
// ENETS / GEP-NEN gesamt ist keine eigene histologische Kategorie.
// Sie umfasst alle sicher zugeordneten GEP-NET-, GEP-NEC- und MiNEN-Fälle.
// Unklare Fälle gehören nicht automatisch zur Gesamtgruppe.
// ============================================================================

export const enetsCategoryGroups = {
	enetsGepNen: ['gepNet', 'gepNec', 'minen']
};

// ============================================================================
// Gültige GEP-Topographien
//
// Der jeweilige Wert ist als Dreisteller-Präfix zu verstehen:
// C15 umfasst beispielsweise C15.0 bis C15.9.
// ============================================================================

export const enetsGepTopographies = [
	'C15', // Ösophagus
	'C16', // Magen
	'C17', // Dünndarm
	'C18', // Kolon einschließlich Appendix C18.1
	'C19', // Rektosigmoid
	'C20', // Rektum
	'C21', // Anus und Analkanal
	'C25' // Pankreas
];

// ============================================================================
// Zuordnungen
//
// Ein Fall gehört zur angegebenen Kategorie, wenn gleichzeitig:
//
// 1. die ICD-O-Topographie mit dem angegebenen Dreisteller beginnt und
// 2. der vollständige ICD-O-Morphologiecode übereinstimmt.
//
// Beispiel:
// topography = C25.1
// morphology = 8151/3
// => gepNet
// ============================================================================

export const enetsCancerCategories = [
	// ------------------------------------------------------------------------
	// GEP-NET
	// Gut differenzierte gastroenteropankreatische neuroendokrine Tumoren
	// ------------------------------------------------------------------------

	// Ösophagus
	{ category: 'gepNet', topography: 'C15', morphology: '8240/3' },
	{ category: 'gepNet', topography: 'C15', morphology: '8241/3' },
	{ category: 'gepNet', topography: 'C15', morphology: '8242/3' },
	{ category: 'gepNet', topography: 'C15', morphology: '8249/3' },

	// Magen
	{ category: 'gepNet', topography: 'C16', morphology: '8240/3' },
	{ category: 'gepNet', topography: 'C16', morphology: '8241/3' },
	{ category: 'gepNet', topography: 'C16', morphology: '8242/3' },
	{ category: 'gepNet', topography: 'C16', morphology: '8249/3' },

	// Dünndarm
	{ category: 'gepNet', topography: 'C17', morphology: '8240/3' },
	{ category: 'gepNet', topography: 'C17', morphology: '8241/3' },
	{ category: 'gepNet', topography: 'C17', morphology: '8242/3' },
	{ category: 'gepNet', topography: 'C17', morphology: '8249/3' },

	// Kolon einschließlich Appendix
	{ category: 'gepNet', topography: 'C18', morphology: '8240/3' },
	{ category: 'gepNet', topography: 'C18', morphology: '8241/3' },
	{ category: 'gepNet', topography: 'C18', morphology: '8242/3' },
	{ category: 'gepNet', topography: 'C18', morphology: '8249/3' },

	// Rektosigmoid
	{ category: 'gepNet', topography: 'C19', morphology: '8240/3' },
	{ category: 'gepNet', topography: 'C19', morphology: '8241/3' },
	{ category: 'gepNet', topography: 'C19', morphology: '8242/3' },
	{ category: 'gepNet', topography: 'C19', morphology: '8249/3' },

	// Rektum
	{ category: 'gepNet', topography: 'C20', morphology: '8240/3' },
	{ category: 'gepNet', topography: 'C20', morphology: '8241/3' },
	{ category: 'gepNet', topography: 'C20', morphology: '8242/3' },
	{ category: 'gepNet', topography: 'C20', morphology: '8249/3' },

	// Anus und Analkanal
	{ category: 'gepNet', topography: 'C21', morphology: '8240/3' },
	{ category: 'gepNet', topography: 'C21', morphology: '8241/3' },
	{ category: 'gepNet', topography: 'C21', morphology: '8242/3' },
	{ category: 'gepNet', topography: 'C21', morphology: '8249/3' },

	// Pankreas: allgemeine NET-Morphologien
	{ category: 'gepNet', topography: 'C25', morphology: '8240/3' },
	{ category: 'gepNet', topography: 'C25', morphology: '8241/3' },
	{ category: 'gepNet', topography: 'C25', morphology: '8242/3' },
	{ category: 'gepNet', topography: 'C25', morphology: '8249/3' },

	// Pankreas: spezifische pankreatische NET-Morphologien
	{ category: 'gepNet', topography: 'C25', morphology: '8150/3' },
	{ category: 'gepNet', topography: 'C25', morphology: '8151/3' },
	{ category: 'gepNet', topography: 'C25', morphology: '8152/3' },
	{ category: 'gepNet', topography: 'C25', morphology: '8153/3' },
	{ category: 'gepNet', topography: 'C25', morphology: '8155/3' },
	{ category: 'gepNet', topography: 'C25', morphology: '8156/3' },
	{ category: 'gepNet', topography: 'C25', morphology: '8157/3' },

	// ------------------------------------------------------------------------
	// GEP-NEC
	// Schlecht differenzierte gastroenteropankreatische NEC
	// ------------------------------------------------------------------------

	// Ösophagus
	{ category: 'gepNec', topography: 'C15', morphology: '8013/3' },
	{ category: 'gepNec', topography: 'C15', morphology: '8041/3' },
	{ category: 'gepNec', topography: 'C15', morphology: '8246/3' },

	// Magen
	{ category: 'gepNec', topography: 'C16', morphology: '8013/3' },
	{ category: 'gepNec', topography: 'C16', morphology: '8041/3' },
	{ category: 'gepNec', topography: 'C16', morphology: '8246/3' },

	// Dünndarm
	{ category: 'gepNec', topography: 'C17', morphology: '8013/3' },
	{ category: 'gepNec', topography: 'C17', morphology: '8041/3' },
	{ category: 'gepNec', topography: 'C17', morphology: '8246/3' },

	// Kolon einschließlich Appendix
	{ category: 'gepNec', topography: 'C18', morphology: '8013/3' },
	{ category: 'gepNec', topography: 'C18', morphology: '8041/3' },
	{ category: 'gepNec', topography: 'C18', morphology: '8246/3' },

	// Rektosigmoid
	{ category: 'gepNec', topography: 'C19', morphology: '8013/3' },
	{ category: 'gepNec', topography: 'C19', morphology: '8041/3' },
	{ category: 'gepNec', topography: 'C19', morphology: '8246/3' },

	// Rektum
	{ category: 'gepNec', topography: 'C20', morphology: '8013/3' },
	{ category: 'gepNec', topography: 'C20', morphology: '8041/3' },
	{ category: 'gepNec', topography: 'C20', morphology: '8246/3' },

	// Anus und Analkanal
	{ category: 'gepNec', topography: 'C21', morphology: '8013/3' },
	{ category: 'gepNec', topography: 'C21', morphology: '8041/3' },
	{ category: 'gepNec', topography: 'C21', morphology: '8246/3' },

	// Pankreas
	{ category: 'gepNec', topography: 'C25', morphology: '8013/3' },
	{ category: 'gepNec', topography: 'C25', morphology: '8041/3' },
	{ category: 'gepNec', topography: 'C25', morphology: '8246/3' },

	// ------------------------------------------------------------------------
	// MiNEN
	// Gemischte neuroendokrine und nicht-neuroendokrine Neoplasien
	// ------------------------------------------------------------------------

	// Historischer MANEC-/MiNEN-Code
	{ category: 'minen', topography: 'C15', morphology: '8244/3' },
	{ category: 'minen', topography: 'C16', morphology: '8244/3' },
	{ category: 'minen', topography: 'C17', morphology: '8244/3' },
	{ category: 'minen', topography: 'C18', morphology: '8244/3' },
	{ category: 'minen', topography: 'C19', morphology: '8244/3' },
	{ category: 'minen', topography: 'C20', morphology: '8244/3' },
	{ category: 'minen', topography: 'C21', morphology: '8244/3' },
	{ category: 'minen', topography: 'C25', morphology: '8244/3' },

	// Gemischte pankreatische Neoplasie
	{ category: 'minen', topography: 'C25', morphology: '8154/3' }
];

// ============================================================================
// Kategorie „Unklar / prüfen“
//
// Diese Kategorie kann nicht als feste Liste aus gültigen Topographie- und
// Morphologiekombinationen dargestellt werden.
//
// Ein Fall ist „Unklar / prüfen“, wenn:
//
// - eine der unten genannten potenziell neuroendokrinen Morphologien vorliegt,
// - aber keine Kombination aus enetsCancerCategories getroffen wurde.
//
// Beispiele:
//
// C34.9 + 8240/3
// => neuroendokriner Lungentumor, kein GEP-NET
// => enetsUnclear
//
// C18.9 + 8151/3
// => pankreasspezifische Morphologie außerhalb des Pankreas
// => enetsUnclear
//
// C26.9 + 8240/3
// => Verdauungsorgan nicht genauer bezeichnet
// => enetsUnclear
// ============================================================================

export const enetsUnclearDefinition = {
	category: 'enetsUnclear',

	potentialMorphologies: [
		// NEC
		'8013/3',
		'8041/3',
		'8246/3',

		// Pankreatische NET
		'8150/3',
		'8151/3',
		'8152/3',
		'8153/3',
		'8155/3',
		'8156/3',
		'8157/3',

		// Gemischte Neoplasien
		'8154/3',
		'8244/3',

		// NET
		'8240/3',
		'8241/3',
		'8242/3',
		'8249/3'
	],

	excludeMatchedCategories: ['gepNet', 'gepNec', 'minen']
};

// ============================================================================
// Reihenfolge für die Anzeige
// ============================================================================

export const enetsCategoryOrder = ['enetsGepNen', 'gepNet', 'gepNec', 'minen', 'enetsUnclear'];

const normalizeCode = (value) =>
	String(value ?? '')
		.trim()
		.toUpperCase();

const enetsCategoryByCodePair = new Map(
	enetsCancerCategories.map(({ category, topography, morphology }) => [
		`${normalizeCode(topography)}|${normalizeCode(morphology)}`,
		category
	])
);

const potentialMorphologies = new Set(
	enetsUnclearDefinition.potentialMorphologies.map(normalizeCode)
);

const createEmptyEnetsCategories = () =>
	Object.fromEntries(enetsCategoryOrder.map((category) => [category, false]));

const getHistologyEntries = (diagnosis, histologies) => [
	{
		topography: diagnosis?.ICDO_localizationCode,
		morphology: diagnosis?.ICDO_histologyCode
	},
	...(histologies ?? []).map((histology) => ({
		topography: histology?.ICDO_localizationCode ?? diagnosis?.ICDO_localizationCode,
		morphology: histology?.ICDO_histologyCode
	}))
];

/**
 * Materialises the ENETS/GEP-NEN categories used by the filter catalogue.
 * A pathology histology without its own topography inherits the diagnosis
 * topography because both records belong to the same tumour.
 */
export function classifyEnetsDiagnosis(diagnosis, histologies = []) {
	const categories = createEmptyEnetsCategories();
	const matchedCategories = new Set();
	let hasPotentialMorphology = false;

	for (const { topography, morphology } of getHistologyEntries(diagnosis, histologies)) {
		const normalizedMorphology = normalizeCode(morphology);
		if (!normalizedMorphology) continue;

		if (potentialMorphologies.has(normalizedMorphology)) hasPotentialMorphology = true;

		const normalizedTopography = normalizeCode(topography).slice(0, 3);
		const category = enetsCategoryByCodePair.get(`${normalizedTopography}|${normalizedMorphology}`);
		if (category) matchedCategories.add(category);
	}

	for (const category of matchedCategories) categories[category] = true;
	for (const [group, members] of Object.entries(enetsCategoryGroups)) {
		categories[group] = members.some((category) => matchedCategories.has(category));
	}
	categories[enetsUnclearDefinition.category] =
		hasPotentialMorphology && matchedCategories.size === 0;

	return categories;
}
