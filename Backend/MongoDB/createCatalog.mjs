import { closeConnection, oncdb } from './monConnector.js';
import { promises as fs } from 'fs';
import path from 'path';
import { ops4 } from './Preprocessing/ops4.mjs';

const cataloguePath = process.env.CATALOGUE_PATH || './ovis-catalogue.json';
const odb = await oncdb();

try {
	const collections = await odb.listCollections().toArray();

	const opsDocuments = ops4;
	console.log('Building the filter catalogue for OVIS...');

	const excludedFieldsPerCollection = {
		// Felder die nur in speziellen Collections ignoriert werden
		//'progress': ['tumorID'],
		//'metastasis': ['metastasisDate']
	};

	const exclusiveFields = {
		// Felder die nur in speziellen Collections berücksichtigt werden sollen
		diagnosis: ['tumorID'],
		patient: ['patID']
	};

	const invalidFields = { _id: 0 }; // Felder, die ignoriert werden sollen
	const excludedCollections = ['user', 'ops']; // Collections, die ignoriert werden sollen (OPS kommt aus Modul)

	let outputData = [];

	function sanitiseCatalogueText(value) {
		return value.toString().replace(/\s+/g, ' ').trim();
	}

	function createCollectionBuilder(collectionName) {
		let uniqueFields = new Set();
		let fieldValues = {};
		const excludedFields = excludedFieldsPerCollection[collectionName] || [];

		function extractFields(doc, prefix = '') {
			Object.keys(doc).forEach((key) => {
				const value = doc[key];
				const newKey = prefix ? `${prefix}_${key}` : key;

				// Prüfe auf exklusive Felder
				for (const [exclusiveCollection, fields] of Object.entries(exclusiveFields)) {
					if (fields.includes(newKey) && exclusiveCollection !== collectionName) {
						return; // Ignoriere, wenn das exklusive Feld in einer anderen Collection vorkommt
					}
				}

				// Prüfe, ob im Feldnamen "Date" vorkommt oder ob der Feldtyp "number" ist
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

				// Rekursive Verarbeitung von Objekten und Arrays
				if (typeof value === 'object' && value !== null) {
					if (value instanceof Date) {
						if (!fieldValues[newKey]) {
							fieldValues[newKey] = new Set();
						}
						fieldValues[newKey].add(value.toISOString());
					} else if (Array.isArray(value)) {
						value.forEach((item) => {
							if (typeof item === 'object' && item !== null) {
								extractFields(item, newKey);
							} else {
								if (!fieldValues[newKey]) {
									fieldValues[newKey] = new Set();
								}
								if (item !== null && item !== undefined) {
									fieldValues[newKey].add(item.toString());
								}
							}
						});
					} else {
						extractFields(value, newKey);
					}
				} else {
					if (!excludedFields.includes(newKey)) {
						uniqueFields.add(newKey);

						if (!fieldValues[newKey]) {
							fieldValues[newKey] = new Set();
						}
						if (value !== null && value !== undefined) {
							fieldValues[newKey].add(value.toString());
						}
					}
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
							criteriaValues.push('-'); // Standardwert "-" hinzufügen
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

	async function buildCollectionObject(collectionName, documents) {
		const builder = createCollectionBuilder(collectionName);
		for await (const document of documents) {
			builder.addDocument(document);
		}
		return builder.build();
	}

	for (const collectionInfo of collections) {
		const collectionName = collectionInfo.name;

		// Überspringe ausgeschlossene Collections
		if (excludedCollections.includes(collectionName)) {
			continue;
		}

		console.log(`Adding ${collectionName} filters...`);

		const collection = odb.collection(collectionName);
		const documents = collection.find({}, { projection: invalidFields });

		outputData.push(await buildCollectionObject(collectionName, documents));
	}

	if (opsDocuments.length > 0) {
		outputData.push(await buildCollectionObject('ops', opsDocuments));
	}

	// Erstelle eine duplizierte Version mit ! vor den Keys, nur wenn "system" existiert
	let duplicatedData = outputData.map((collection) => ({
		...collection,
		childCategories: collection.childCategories.map((child) => ({
			...child,
			key: child.system ? `!${child.key}` : child.key,
			name: child.system ? `!${child.name}` : child.name,
			type: child.type === 'EQUALS' ? 'NEQUALS' : child.type === 'BETWEEN' ? 'NBETWEEN' : child.type
		}))
	}));

	outputData = [...outputData, ...duplicatedData];
	const catalogueJson = JSON.stringify(outputData, null, 2);

	await fs.mkdir(path.dirname(cataloguePath), { recursive: true });
	await fs.writeFile(cataloguePath, catalogueJson, 'utf-8');
	console.log(`Filter catalogue saved (${cataloguePath}).`);
} catch (err) {
	console.error('Could not build the filter catalogue:', err);
	process.exitCode = 1;
} finally {
	closeConnection();
}
