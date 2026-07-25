import { closeConnection, oncdb } from './monConnector.js';
import { promises as fs } from 'fs';
import path from 'path';
import { ICD10 } from './Preprocessing/ICD10.mjs';
import { ops4 } from './Preprocessing/ops4.mjs';
import { buildCollectionObject } from './catalogueFieldCollector.mjs';

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

	const additionalFieldValuesPerCollection = {
		diagnosis: { ICD_ICD10_3: Object.keys(ICD10) }
	};
	const catalogueOptions = {
		excludedFieldsPerCollection,
		exclusiveFields,
		additionalFieldValuesPerCollection
	};

	for (const collectionInfo of collections) {
		const collectionName = collectionInfo.name;

		// Überspringe ausgeschlossene Collections
		if (excludedCollections.includes(collectionName)) {
			continue;
		}

		console.log(`Adding ${collectionName} filters...`);

		const collection = odb.collection(collectionName);
		const documents = collection.find({}, { projection: invalidFields });

		outputData.push(await buildCollectionObject(collectionName, documents, catalogueOptions));
	}

	if (opsDocuments.length > 0) {
		outputData.push(await buildCollectionObject('ops', opsDocuments, catalogueOptions));
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
