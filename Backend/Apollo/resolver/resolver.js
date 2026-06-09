const { aggregationArry } = require('../utils');
const { filter2match } = require('../astTranslator');

const genericGetAll = async (db, colname, args) => {
	return db
		.collection(colname)
		.aggregate(await aggregationArry(args, colname, db))
		.toArray();
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

// --- Helper: Filter AST (aus preprocessor) parsen und nur Nicht-Study-Klauseln behalten ---
function parseAstFilter(raw) {
	try {
		// im Projekt werden "_" zu "." (ausser _3 und _id) umcodiert
		// (gleiches Muster wie im Backend sonst genutzt wird)
		return JSON.parse(raw.replaceAll(/_(?!3)(?!id)/g, '.'));
	} catch (_e) {
		return null;
	}
}

function keepNonStudyClauses(ast) {
	if (!ast) return null;

	// logisch zusammengesetzte Knoten
	if (Array.isArray(ast.children)) {
		const kids = ast.children.map(keepNonStudyClauses).filter(Boolean);

		// wenn nichts übrig bleibt, weg damit
		if (kids.length === 0) return null;

		return { ...ast, children: kids };
	}

	// leaf expression
	// filter2match nutzt "system" um zu entscheiden, aus welcher Collection die IDs kommen
	if (ast.system === 'study') return null;

	return ast;
}

module.exports = {
	Query: {
		getAllPatient: (_parent, input, context) =>
			genericGetAll(context.db, context.collections.patient, input),

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
				if ('histology' === col) {
					agg.unshift({ $unwind: '$ICDO' });
					db = context.db.collection(context.collections.diagnosis);
				}

				if (['systemic', 'operation', 'radiation'].includes(col)) {
					agg.unshift({ $match: { generalType: col } });
					db = context.db.collection(context.collections.therapy);
				}

				db ??= context.db.collection(col);
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

		// ------------------------------
		// FIX: studyPatients "mitfiltern"
		// ------------------------------
		getAllStudies: async (_parent, input, context) => {
			const studyCol = context.collections.study;
			const patientCol = context.collections.patient;

			// Basis-Aggregation (inkl. Paging/Sort/Project etc.)
			const agg = await aggregationArry(input, studyCol, context.db);

			// Filter leer? => Standardverhalten
			const isEmptyFilter =
				!input?.filter ||
				input.filter === '{"operand":"OR","children":[]}' ||
				input.filter === 'null';

			if (isEmptyFilter) {
				return context.db.collection(studyCol).aggregate(agg).toArray();
			}

			// 1) Filter-AST parsen und nur Patient-/Nicht-Study-Klauseln behalten
			const fullAst = parseAstFilter(input.filter);
			const patAst = keepNonStudyClauses(fullAst);

			// Wenn keine patient-relevanten Filterteile existieren, machen wir nichts extra.
			// (Dann ist es wirklich ein Study-only Filter.)
			if (!patAst) {
				return context.db.collection(studyCol).aggregate(agg).toArray();
			}

			// 2) Patientenkohorte bestimmen (patID Set)
			const patFilterStr = JSON.stringify(patAst);
			const patMatchStages = await filter2match({
				value: patFilterStr,
				column: patientCol,
				db: context.db
			});

			const patIDsDoc = await context.db
				.collection(patientCol)
				.aggregate([...patMatchStages, { $group: { _id: null, ids: { $addToSet: '$patID' } } }])
				.next();

			const patIDs = patIDsDoc?.ids ?? [];

			// 3) In Studies-Aggregation: studyPatients auf patIDs schneiden
			agg.push({
				$set: {
					studyPatients: {
						$filter: {
							input: '$studyPatients',
							as: 'sp',
							cond: { $in: ['$$sp.patID', patIDs] }
						}
					}
				}
			});

			// optional, aber i.d.R. gewünscht: Studien ohne Treffer rauswerfen
			agg.push({ $match: { 'studyPatients.0': { $exists: true } } });

			return context.db.collection(studyCol).aggregate(agg).toArray();
		},

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
