//const { establishConnection, closeConnection } = require('./monConnector')
import { establishConnection, closeConnection } from './monConnector.js';

const collectionName = process.argv;
const query = [
	{ $project: { arrayofkeyvalue: { $objectToArray: '$$ROOT' } } },
	{ $unwind: '$arrayofkeyvalue' },
	{ $group: { _id: null, allkeys: { $addToSet: '$arrayofkeyvalue.k' } } }
];
const schema = `type ${collectionName[2]} {`;

const db = await establishConnection();

const res = (await db.collection(collectionName[2]).aggregate(query).next()).allkeys;

console.log(collectionName[2]);
let resSchema = schema;
res.forEach((element) => {
	resSchema += '\n' + '    ' + element + ': String';
});
resSchema += '\n}';
console.log(resSchema);

closeConnection();
