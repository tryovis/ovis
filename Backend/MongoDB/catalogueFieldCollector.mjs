function sanitiseCatalogueText(value) {
	return value.toString().replace(/\s+/g, ' ').trim();
}

export function createCollectionBuilder(
	collectionName,
	{ excludedFieldsPerCollection = {}, exclusiveFields = {} } = {}
) {
	let uniqueFields = new Set();
	let fieldValues = {};
	const excludedFields = excludedFieldsPerCollection[collectionName] || [];

	function isExclusiveField(newKey) {
		return Object.entries(exclusiveFields).some(
			([exclusiveCollection, fields]) =>
				fields.includes(newKey) && exclusiveCollection !== collectionName
		);
	}

	function addValue(newKey, value) {
		uniqueFields.add(newKey);
		if (!fieldValues[newKey]) {
			fieldValues[newKey] = new Set();
		}
		if (value !== null && value !== undefined) {
			fieldValues[newKey].add(value.toString());
		}
	}

	function extractFields(doc, prefix = '') {
		Object.keys(doc).forEach((key) => {
			const value = doc[key];
			const newKey = prefix ? `${prefix}_${key}` : key;

			if (isExclusiveField(newKey)) {
				return;
			}

			if (/date/i.test(newKey)) {
				fieldValues[newKey] = {
					key: newKey,
					name: `TODO Name für ${newKey}`,
					system: collectionName,
					fieldType: 'date',
					type: 'BETWEEN',
					infoButtonText: [
						`Date for ${collectionName} represents the relevant date for this field.`
					],
					criteria: []
				};
				uniqueFields.add(newKey);
				return;
			} else if (typeof value === 'number') {
				fieldValues[newKey] = {
					key: newKey,
					name: `TODO Name für ${newKey}`,
					system: collectionName,
					fieldType: 'number',
					type: 'BETWEEN',
					infoButtonText: [`Number for ${collectionName} represents the range for this field.`],
					criteria: []
				};
				uniqueFields.add(newKey);
				return;
			}

			if (typeof value === 'object' && value !== null) {
				if (value instanceof Date) {
					addValue(newKey, value.toISOString());
				} else if (Array.isArray(value)) {
					value.forEach((item) => {
						if (typeof item === 'object' && item !== null) {
							extractFields(item, newKey);
						} else if (!excludedFields.includes(newKey)) {
							addValue(newKey, item);
						}
					});
				} else {
					extractFields(value, newKey);
				}
			} else if (!excludedFields.includes(newKey)) {
				addValue(newKey, value);
			}
		});
	}

	return {
		addDocument: extractFields,
		build() {
			return {
				key: collectionName,
				name: 'TODO',
				childCategories: [...uniqueFields].map((field) => {
					if (
						fieldValues[field]?.fieldType === 'date' ||
						fieldValues[field]?.fieldType === 'number'
					) {
						return fieldValues[field];
					}

					const criteriaValues =
						fieldValues[field] instanceof Set
							? [...new Set([...fieldValues[field]].map(sanitiseCatalogueText).filter(Boolean))]
							: [];

					if (!criteriaValues.includes('-')) {
						criteriaValues.push('-');
					}

					return {
						key: field,
						name: field,
						fieldType: 'single-select',
						type: 'EQUALS',
						system: collectionName,
						criteria: criteriaValues.map((value) => ({
							key: value.toString(),
							name: value.toString(),
							description: ''
						}))
					};
				})
			};
		}
	};
}

export function createCollectionCatalogue(collectionName, documents, options = {}) {
	const builder = createCollectionBuilder(collectionName, options);
	documents.forEach((document) => builder.addDocument(document));
	return builder.build();
}

export async function buildCollectionObject(collectionName, documents, options = {}) {
	const builder = createCollectionBuilder(collectionName, options);
	for await (const document of documents) {
		builder.addDocument(document);
	}
	return builder.build();
}
