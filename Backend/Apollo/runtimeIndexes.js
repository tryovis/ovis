async function createRuntimeIndexes(database, collections) {
	const usageEvents = database.collection(collections.usageEvent);
	await Promise.all([
		usageEvents.createIndex({ type: 1, createdAt: 1 }),
		usageEvents.createIndex({ type: 1, userId: 1 }),
		usageEvents.createIndex({ type: 1, targetType: 1, module: 1 })
	]);
}

module.exports = { createRuntimeIndexes };
