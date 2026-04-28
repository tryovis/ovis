module.exports = {
	Query: {
		// --- bestehend ---
		dbmeta: async (_parent, _args, context, _info) => {
			let res = [];
			let dbs = context.db.listCollections({}, { nameOnly: true });
			let dbCalls = [];

			for await (const it of dbs) {
				let doc = { collection: it.name };
				res.push(doc);
				dbCalls.push(getFields(context.db.collection(it.name)));
			}

			const fields = await Promise.all(dbCalls);
			for (const i in fields) {
				res[i].field = fields[i];
			}
			return res;
		},

		// --- bestehend ---
		getValueOptions: (_parent, { field, collection }, context) =>
			context.db.collection(collection).distinct(field),

		// --- NEU: nur der letzte MetaData-Eintrag ---
		getLastMetaData: async (_parent, _args, context) => {
			const doc = await context.db
				.collection('metaData')
				.find({})
				.sort({ executedAt: -1 })
				.limit(1)
				.next();

			return doc
				? {
						...doc,
						id: doc._id ? doc._id.toString() : null,
						executedAt:
							doc.executedAt instanceof Date ? doc.executedAt.toISOString() : doc.executedAt ?? null
				  }
				: null;
		}
	}
};

// --- bestehend ---
const getFields = async (collection) => {
	const query = [
		{ $project: { arrayofkeyvalue: { $objectToArray: '$$ROOT' } } },
		{ $unwind: '$arrayofkeyvalue' },
		{ $group: { _id: null, allkeys: { $addToSet: '$arrayofkeyvalue.k' } } }
	];
	const res = await collection.aggregate(query).next();
	return res ? res.allkeys : [];
};
