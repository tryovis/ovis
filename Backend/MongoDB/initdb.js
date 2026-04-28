const rootUsername = process.env.OVIS_ROOT_USERNAME || 'ovis-root';

db = db.getSiblingDB('onc_test');
db.createCollection('user');
db.user.insertMany([
	{
		_id: rootUsername,
		createdAt: new Date(),
		createdBy: 'system',
		role: 'super-admin',
		status: 'active',
		pseudonymization: false,
		darkMode: false,
		colorTheme: 'CCCMunich',
		language: 'en'
	}
]);
