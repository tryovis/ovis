async function createRuntimeIndexes(database, collections) {
	const usageEvents = database.collection(collections.usageEvent);
	await Promise.all([
		usageEvents.createIndex({ type: 1, createdAt: 1 }),
		usageEvents.createIndex({ type: 1, userId: 1 }),
		usageEvents.createIndex({ type: 1, targetType: 1, module: 1 })
	]);
	const analysisIndexes = [
		[collections.diagnosis, { patID: 1, diagnosisDate: 1, tumorID: 1 }],
		...['kaplanmeier', 'tnm', 'histology', 'status'].map((key) => [
			collections[key],
			{ tumorID: 1 }
		])
	];
	await Promise.all(
		analysisIndexes.map(async ([name, specification]) => {
			const collection = database.collection(name);
			// createIndex also creates a missing collection. Do not let API startup
			// create empty placeholders before the importer has written its data.
			if (await collection.findOne({}, { projection: { _id: 1 } })) {
				await collection.createIndex(specification);
			}
		})
	);
}

module.exports = { createRuntimeIndexes };
