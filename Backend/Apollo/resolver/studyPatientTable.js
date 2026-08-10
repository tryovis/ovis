const { filter2match } = require('../astTranslator');
const { combineLogicalClauses, parseAstFilter } = require('../astUtils');

const sortOrder = { newest: -1 };
const tableSortOrder = { asc: 1, desc: -1 };
const emptyFilter = '{"operand":"OR","children":[]}';

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeColumnFilters = (columnFilters) =>
	Array.isArray(columnFilters)
		? columnFilters.filter(({ field, value }) => field && String(value ?? '').trim() !== '')
		: [];

const columnFilterStages = (columnFilters) =>
	normalizeColumnFilters(columnFilters).map(({ field, value }) => ({
		$match: {
			[field]: {
				$regex: escapeRegex(value),
				$options: 'i'
			}
		}
	}));

const sortStage = ({ sortField, sortDirection }) => {
	const direction = tableSortOrder[sortDirection] ?? sortOrder.newest;
	if (!sortField) return { $sort: { recruitmentDate: sortOrder.newest, _id: sortOrder.newest } };
	return { $sort: { [sortField]: direction, _id: sortOrder.newest } };
};

const mergeMatchStages = (stages) => {
	const matches = stages.map((stage) => stage.$match).filter(Boolean);
	if (matches.length === 0) return null;
	if (matches.length === 1) return matches[0];
	return { $and: matches };
};

const astValue = (ast) => JSON.stringify(astAsRoot(ast));
const astAsRoot = (ast) => (Array.isArray(ast.children) ? ast : { operand: 'OR', children: [ast] });
const isEmptyFilter = (filter) => !filter || filter === emptyFilter || filter === 'null';

function singleLeafSystem(node) {
	if (!Array.isArray(node?.children)) return node?.system ?? null;
	let found = null;
	for (const child of node.children) {
		const system = singleLeafSystem(child);
		if (!system) return null;
		if (found == null) found = system;
		if (found !== system) return null;
	}
	return found;
}

function everyLeaf(node, predicate) {
	if (!Array.isArray(node?.children)) return predicate(node);
	return node.children.every((child) => everyLeaf(child, predicate));
}

async function collectionMatch(ast, collection, db) {
	return mergeMatchStages(
		await filter2match({
			value: astValue(ast),
			column: collection,
			db
		})
	);
}

async function matchingPatientIDs(ast, collections, db) {
	const patMatchStages = await filter2match({
		value: astValue(ast),
		column: collections.patient,
		db
	});
	const patIDsDoc = await db
		.collection(collections.patient)
		.aggregate([...patMatchStages, { $group: { _id: null, ids: { $addToSet: '$patID' } } }])
		.next();
	return patIDsDoc?.ids ?? [];
}

async function matchingStudyKeys(ast, collections, db) {
	const match = await collectionMatch(ast, collections.study, db);
	return db.collection(collections.study).distinct('studyKey', match ?? {});
}

/** Translate any global AST into a query on one materialized participation row. */
async function filterAstToParticipationMatch(ast, collections, db) {
	if (!ast) return null;
	const system = singleLeafSystem(ast);
	if (system === 'study') {
		return { studyKey: { $in: await matchingStudyKeys(ast, collections, db) } };
	}
	if (system === 'studyPatient') {
		return collectionMatch(ast, collections.studyPatient, db);
	}
	if (system) {
		return { patID: { $in: await matchingPatientIDs(ast, collections, db) } };
	}
	if (!Array.isArray(ast.children)) return { $expr: { $eq: [1, 0] } };
	if (everyLeaf(ast, (leaf) => !['study', 'studyPatient'].includes(leaf.system))) {
		return { patID: { $in: await matchingPatientIDs(ast, collections, db) } };
	}

	let childrenToTranslate = ast.children;
	if (ast.operand === 'AND') {
		const patientScoped = [];
		const participationScoped = [];
		for (const child of ast.children) {
			if (everyLeaf(child, (leaf) => !['study', 'studyPatient'].includes(leaf.system))) {
				patientScoped.push(child);
			} else {
				participationScoped.push(child);
			}
		}
		childrenToTranslate = [
			...participationScoped,
			...(patientScoped.length > 0 ? [{ operand: 'AND', children: patientScoped }] : [])
		];
	}

	const children = [];
	for (const child of childrenToTranslate) {
		const match = await filterAstToParticipationMatch(child, collections, db);
		if (match) children.push(match);
	}
	if (children.length === 0) return null;
	return combineLogicalClauses(ast.operand, children);
}

async function globalParticipationMatch(input, collections, db) {
	if (isEmptyFilter(input?.filter)) return null;
	const ast = parseAstFilter(input.filter);
	if (!ast) throw new Error('Invalid filter AST');
	return filterAstToParticipationMatch(ast, collections, db);
}

async function studyMatchWithoutParticipation(ast, collections, db) {
	const system = singleLeafSystem(ast);
	if (system === 'study') return collectionMatch(ast, collections.study, db);
	if (system) return { $expr: { $eq: [1, 0] } };
	if (!Array.isArray(ast?.children)) return { $expr: { $eq: [1, 0] } };

	const clauses = [];
	for (const child of ast.children) {
		clauses.push(await studyMatchWithoutParticipation(child, collections, db));
	}
	return combineLogicalClauses(ast.operand, clauses);
}

const studyPatientProjection = {
	$project: {
		_id: { $toString: '$_id' },
		studyID: 1,
		shortname: 1,
		patID: 1,
		recruitmentDate: 1
	}
};

async function buildStudyPatientTableAggregation(input, collections, db) {
	const agg = [];
	const match = await globalParticipationMatch(input, collections, db);
	if (match) agg.push({ $match: match });
	agg.push(studyPatientProjection);
	agg.push(...columnFilterStages(input?.columnFilters));
	agg.push(sortStage(input ?? {}));
	if (input?.offset) agg.push({ $skip: input.offset });
	if (input?.limit) agg.push({ $limit: input.limit });
	return agg;
}

async function buildStudyPatientCountAggregation(input, collections, db) {
	const agg = [];
	const match = await globalParticipationMatch(input, collections, db);
	if (match) agg.push({ $match: match });
	agg.push(studyPatientProjection);
	agg.push(...columnFilterStages(input?.columnFilters));
	agg.push({ $count: 'count' });
	return agg;
}

async function studyOverviewMembership(input, collections, db) {
	const participationMatch = await globalParticipationMatch(input, collections, db);
	const stages = [];
	let emptyStudyKeys = [];
	if (participationMatch) {
		const matchingParticipationStudyKeys = await db
			.collection(collections.studyPatient)
			.distinct('studyKey', participationMatch);
		const allParticipationStudyKeys = await db
			.collection(collections.studyPatient)
			.distinct('studyKey');
		const ast = parseAstFilter(input.filter);
		const noParticipationMatch = await studyMatchWithoutParticipation(ast, collections, db);
		emptyStudyKeys = await db.collection(collections.study).distinct('studyKey', {
			$and: [noParticipationMatch, { studyKey: { $nin: allParticipationStudyKeys } }]
		});
		stages.push({
			$match: {
				studyKey: { $in: [...new Set([...matchingParticipationStudyKeys, ...emptyStudyKeys])] }
			}
		});
	}
	return { stages, participationMatch, emptyStudyKeys };
}

async function studyOverviewRowStages(input, collections, db) {
	const { stages, participationMatch, emptyStudyKeys } = await studyOverviewMembership(
		input,
		collections,
		db
	);

	const lookupPipeline = [{ $match: { $expr: { $eq: ['$studyKey', '$$studyKey'] } } }];
	if (participationMatch) lookupPipeline.push({ $match: participationMatch });
	stages.push({
		$lookup: {
			from: collections.studyPatient,
			let: { studyKey: '$studyKey' },
			pipeline: lookupPipeline,
			as: 'studyPatients'
		}
	});
	if (participationMatch) {
		stages.push({
			$match: {
				$or: [{ 'studyPatients.0': { $exists: true } }, { studyKey: { $in: emptyStudyKeys } }]
			}
		});
	}
	return stages;
}

async function buildStudyOverviewAggregation(input, collections, db) {
	const stages = await studyOverviewRowStages(input, collections, db);
	stages.push(...(input?.project ?? []));
	stages.push(...columnFilterStages(input?.columnFilters));
	const direction = tableSortOrder[input?.sortDirection] ?? sortOrder.newest;
	const sortField = input?.sortField === 'studyPatients' ? '__studyPatientCount' : input?.sortField;
	if (input?.sortField === 'studyPatients') {
		stages.push({
			$set: {
				__studyPatientCount: { $size: { $ifNull: ['$studyPatients', []] } }
			}
		});
	}
	stages.push(
		sortField
			? { $sort: { [sortField]: direction, _id: sortOrder.newest } }
			: { $sort: { _id: sortOrder.newest } }
	);
	if (input?.continueFromID) {
		stages.push({
			$match: {
				$expr: { $lt: ['$_id', { $toObjectId: input.continueFromID }] }
			}
		});
	}
	if (input?.offset) stages.push({ $skip: input.offset });
	if (input?.limit) stages.push({ $limit: input.limit });
	return stages;
}

async function buildStudyOverviewCountAggregation(input, collections, db) {
	const needsParticipationData =
		(input?.project ?? []).some((stage) => JSON.stringify(stage).includes('$studyPatients')) ||
		normalizeColumnFilters(input?.columnFilters).some(({ field }) =>
			field.startsWith('studyPatients')
		);
	const stages = needsParticipationData
		? await studyOverviewRowStages(input, collections, db)
		: (await studyOverviewMembership(input, collections, db)).stages;
	stages.push(...(input?.project ?? []));
	stages.push(...columnFilterStages(input?.columnFilters));
	stages.push({ $count: 'count' });
	return stages;
}

async function getStudyPatientTable(input, context) {
	const agg = await buildStudyPatientTableAggregation(input, context.collections, context.db);
	return context.db.collection(context.collections.studyPatient).aggregate(agg).toArray();
}

async function getStudyPatientCount(input, context) {
	const agg = await buildStudyPatientCountAggregation(input, context.collections, context.db);
	const result = await context.db
		.collection(context.collections.studyPatient)
		.aggregate(agg)
		.next();
	return result?.count ?? 0;
}

async function getStudyOverview(input, context) {
	const agg = await buildStudyOverviewAggregation(input, context.collections, context.db);
	return context.db.collection(context.collections.study).aggregate(agg).toArray();
}

async function getStudyOverviewCount(input, context) {
	const agg = await buildStudyOverviewCountAggregation(input, context.collections, context.db);
	const result = await context.db.collection(context.collections.study).aggregate(agg).next();
	return result?.count ?? 0;
}

module.exports = {
	buildStudyOverviewAggregation,
	buildStudyOverviewCountAggregation,
	buildStudyPatientCountAggregation,
	buildStudyPatientTableAggregation,
	filterAstToParticipationMatch,
	getStudyOverview,
	getStudyOverviewCount,
	getStudyPatientCount,
	getStudyPatientTable,
	matchingPatientIDs,
	matchingStudyKeys,
	parseAstFilter
};
