const rootUsername = process.env.OVIS_ROOT_USERNAME || 'ovis-root';

db = db.getSiblingDB('onc_test');
db.createCollection('user');
db.createCollection('usageEvent');
db.createCollection('platformConfiguration');
db.createCollection('platformDocument');
if (db.usageEvent && typeof db.usageEvent.createIndex === 'function') {
	db.usageEvent.createIndex({ type: 1, createdAt: 1 });
	db.usageEvent.createIndex({ type: 1, userId: 1 });
	db.usageEvent.createIndex({ type: 1, targetType: 1, module: 1 });
}
const users = [
	{
		_id: rootUsername,
		createdAt: new Date(),
		createdBy: 'system',
		role: 'super-admin',
		status: 'active',
		pseudonymization: false,
		darkMode: false,
		chartShowTop5: true,
		chartHideNullValues: true,
		colorTheme: 'CCCMunich',
		language: 'en'
	}
];

db.user.insertMany(users);
