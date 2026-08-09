const { aggregationArry, countAggregationArry } = require('../utils');
const { filter2match } = require('../astTranslator');
const {
	getStudyOverview,
	getStudyOverviewCount,
	getStudyPatientCount,
	getStudyPatientTable
} = require('./studyPatientTable');

const genericGetAll = async (db, colname, args) => {
	return db
		.collection(colname)
		.aggregate(await aggregationArry(args, colname, db))
		.toArray();
};

const collectionNameForCount = (context, collection) => {
	const collectionMap = {
		bioMaterial: context.collections.bioMaterial,
		molecularMarker: context.collections.molecularmarker,
		operation: context.collections.therapy,
		systemic: context.collections.therapy,
		radiation: context.collections.therapy
	};
	return collectionMap[collection] ?? context.collections[collection] ?? collection;
};

const tableCount = async (db, colname, args, options) => {
	const result = await db
		.collection(colname)
		.aggregate(await countAggregationArry(args, colname, db, options))
		.next();
	return result?.count ?? 0;
};

const toStringArray = (value) => {
	if (Array.isArray(value))
		return value.filter((entry) => typeof entry === 'string' && entry.trim());
	if (typeof value === 'string' && value.trim()) return [value];
	return value ?? null;
};

const genericCount = async (collection, selectedType, flaten, filter) => {
	let agg = [];
	if (filter) agg = await filter;
	if (flaten) {
		agg.push(
			{ $match: { generalType: 'radiation' } },
			{ $unwind: { path: '$radiation', preserveNullAndEmptyArrays: true } },
			{ $set: { 'radiation.therapyID': '$therapyID' } },
			{ $replaceRoot: { newRoot: '$radiation' } }
		);
	}
	agg.push({
		$group: {
			_id: { label: '$' + selectedType },
			count: { $count: {} }
		}
	});

	console.dir(agg, { depth: null });
	const res = await collection.aggregate(agg).toArray();
	const formattedResult = { label: [], count: [] };
	res.forEach((item) => {
		formattedResult.label.push(item._id.label);
		formattedResult.count.push(item.count);
	});
	return formattedResult;
};

module.exports = {
	Query: {
		getAllPatient: (_parent, input, context) =>
			genericGetAll(context.db, context.collections.patient, input),

		getTableCount: (_parent, input, context) =>
			input.collection === 'studyPatient'
				? getStudyPatientCount(input, context)
				: input.collection === 'study'
				? getStudyOverviewCount(input, context)
				: tableCount(context.db, collectionNameForCount(context, input.collection), input),

		getFirstAssessment: (_parent, input, context) =>
			genericGetAll(context.db, context.collections.diagnosis, input),

		getDiagnosisDiagnosticTable: (_parent, input, context) =>
			genericGetAll(context.db, context.collections.diagnostic, input),

		getTNMMetastasisTable: (_parent, input, context) =>
			genericGetAll(context.db, context.collections.metastasis, input),

		getConsultation: (_parent, input, context) =>
			genericGetAll(context.db, context.collections.consultation, input),

		getTumorBoard: (_parent, input, context) =>
			genericGetAll(context.db, context.collections.tumorBoard, input),

		getCourses: (_parent, input, context) =>
			genericGetAll(context.db, context.collections.progress, input),

		getAllTherapies: async (_parent, input, context) => {
			let res = await genericGetAll(context.db, context.collections.therapy, {
				...input,
				project: [
					{
						$set: {
							ops4: {
								$map: {
									input: '$ops.code',
									as: 'it',
									in: { $substr: ['$$it', 0, 4] }
								}
							}
						}
					},
					{
						$lookup: {
							from: 'ops4',
							localField: 'ops4',
							foreignField: 'OPSC_4',
							as: 'opscode'
						}
					}
				]
			});

			const reslen = res.length;
			let it;
			for (let i = 0; i < reslen; ++i) {
				it = res[i];
				let codes = it.ops?.map((op) => {
					let found = it.opscode.find((el) => el.OPSC_4 === op.code.substring(0, 4));
					if (found)
						return {
							ops: op.code,
							text: op.text,
							ops4: found.OPSC_4,
							text4: found.OPS_Gruppen_Text
						};
					else
						return {
							ops: op.code,
							ops4: op.code.substring(0, 4)
						};
				});
				it.ops = codes;
				it.surgeon = toStringArray(it.surgeon);
				it.metastasisResection = toStringArray(it.metastasisResection);
				delete it.ops4;
				delete it.opscode;
			}
			return res;
		},

		getQuicktoolsCountOverview: async (_parent, input, context) => {
			let dbCalls = [];
			for (const col of input.collection) {
				let db = null;
				let agg = [{ $count: 'count' }, { $set: { collection: col } }];
				if ('radiation' === col)
					agg.unshift({ $unwind: { path: '$radiation', preserveNullAndEmptyArrays: true } });
				if (['systemic', 'operation', 'radiation'].includes(col)) {
					agg.unshift({ $match: { generalType: col } });
					db = context.db.collection(context.collections.therapy);
				}

				db ??= context.db.collection(context.collections[col] ?? col);
				if (input.filter)
					agg.unshift(
						...(await filter2match({ value: input.filter, column: col, db: context.db }))
					);
				dbCalls.push(db.aggregate(agg).next());
				console.dir(agg, { depth: null });
			}
			return Promise.all(dbCalls);
		},

		getTnmMetastases: (_parent, input, context) =>
			genericGetAll(context.db, context.collections.tnm, input),

		getCategoryChart: async (_parent, { selectedType, collection, filter }, context) => {
			const ccol = context.collections[collection];
			let flaten = false;
			if (selectedType.startsWith('radiation')) {
				flaten = true;
				selectedType = `${selectedType.substring(10)}`;
			}
			let f2m = filter ? filter2match({ value: filter, column: ccol, db: context.db }) : null;
			return genericCount(context.db.collection(ccol), selectedType, flaten, f2m);
		},

		getAllStudies: (_parent, input, context) => getStudyOverview(input, context),

		getStudyPatientTable: (_parent, input, context) => getStudyPatientTable(input, context),

		getSupplementary: (_parent, input, context) =>
			genericGetAll(context.db, context.collections.supplementary, input),

		getMolecularMarker: (_parent, input, context) =>
			genericGetAll(context.db, context.collections.molecularmarker, input),

		getBioMaterial: (_parent, input, context) =>
			genericGetAll(context.db, context.collections.bioMaterial, input),

		getStatus: (_parent, input, context) =>
			genericGetAll(context.db, context.collections.status, input),

		getUser: (_parent, input, context) => genericGetAll(context.db, context.collections.usr, input)
	},

	Mutation: {
		createUser: (_parent, { input }, context) => {
			if (!input.createdAt) input.createdAt = new Date(Date.now());
			return context.db.collection(context.collections.usr).insertOne(input);
		},
		updateUser: (_parent, { id, input }, context) => {
			if (!input.lastModifiedAt) input.lastModifiedAt = new Date(Date.now());
			return context.db
				.collection(context.collections.usr)
				.updateOne({ _id: id }, { $set: input }, { upsert: false });
		},
		deleteUser: (_parent, { users }, context) =>
			context.db.collection(context.collections.usr).deleteMany({ _id: { $in: users } })
	}
};
