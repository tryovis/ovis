const { MongoClient: MonClient } = require('mongodb');
const name = process.env.DB || 'onc_test';
const dburl = process.env.ADDRESS || 'mongodb://mongo:27017';
const oname = process.env.oncName || 'onc_test';

const client = new MonClient(dburl);
let db = null;
let oc = null;

async function establishConnection(dbName = name) {
	if (db) return db;
	try {
		const con = await client.connect();
		db = con.db(dbName);
		oc = con.db(oname);
	} catch (err) {
		console.log(`Could not connect to MongoDB.\n${err}`);
		process.exit(1);
	}
	return db;
}

const oncdb = async () => {
	if (oc) return oc;
	try {
		const con = await client.connect();
		oc = con.db(oname);
	} catch (err) {
		console.log(`Could not connect to MongoDB.\n${err}`);
		process.exit(1);
	}
	return oc;
};

function closeConnection() {
	if (db || oc) client.close();
}

module.exports = { establishConnection, closeConnection, oncdb };
