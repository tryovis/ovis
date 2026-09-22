const { filter2match } = require('../astTranslator');
const { combineLogicalClauses, parseAstFilter } = require('../astUtils');
const { columnFilterStages, normalizeColumnFilters } = require('../tableColumnSearch');

const sortOrder = { newest: -1 };
const tableSortOrder = { asc: 1, desc: -1 };
const emptyFilter = '{"operand":"OR","children":[]}';

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

const isParticipationLeaf = (leaf) => ['study', 'studyPatient'].includes(leaf.system);
const participationAtom = Symbol('participationAtom');
const MAX_PARTICIPATION_FILTER_BRANCHES = 256;

function participationComplexityError() {
	const error = new Error('Filter is too complex. Reduce nested study filter combinations.');
	error.code = 'FILTER_TOO_COMPLEX';
	error.extensions = { code: 'BAD_USER_INPUT' };
	return error;
}

/** A study predicate belongs to this participation's study, not any study of its patient. */
async function participationOnlyMatch(ast, collections, db) {
	const system = singleLeafSystem(ast);
	if (system === 'study') {
		return { studyKey: { $in: await matchingStudyKeys(ast, collections, db) } };
	}
	if (system === 'studyPatient') {
		return collectionMatch(ast, collections.studyPatient, db);
	}
	if (!Array.isArray(ast.children)) return { $expr: { $eq: [1, 0] } };
	const children = [];
	for (const child of ast.children) {
		children.push(await participationOnlyMatch(child, collections, db));
	}
	return combineLogicalClauses(ast.operand, children);
}

function replaceParticipationAtom(node, selected, value) {
	if (node?.[participationAtom] === selected) return value;
	if (!Array.isArray(node?.children)) return node;
	if (node.children.length === 0) return ['AND', 'NOR'].includes(node.operand);
	const children = node.children.map((child) => replaceParticipationAtom(child, selected, value));
	if (children.every((child, index) => child === node.children[index])) return node;
	const remaining = children.filter((child) => typeof child !== 'boolean');
	const trueCount = children.filter((child) => child === true).length;
	const falseCount = children.length - remaining.length - trueCount;
	if (node.operand === 'AND') {
		if (falseCount) return false;
		if (!remaining.length) return true;
	} else if (node.operand === 'OR') {
		if (trueCount) return true;
		if (!remaining.length) return false;
		// Removing a row predicate must not invent a canonical multi-value exclusion group.
		// This false subtree keeps a mixed OR of negative clinical clauses a logical OR.
		// Unlike OR([]), it also means false if a later decision lifts it to the AST root.
		if (remaining.length > 1 && falseCount)
			remaining.push({ operand: 'NOR', children: [{ operand: 'AND', children: [] }] });
	} else if (node.operand === 'NOR') {
		if (trueCount) return false;
		if (!remaining.length) return true;
		return { operand: 'NOR', children: remaining };
	} else if (node.operand === 'XOR') {
		if (trueCount > 1) return false;
		if (!remaining.length) return trueCount === 1;
		if (trueCount === 1) return { operand: 'NOR', children: remaining };
	} else {
		throw new Error(`Unknown logical operator: ${node.operand}`);
	}
	return remaining.length === 1 ? remaining[0] : { ...node, children: remaining };
}

function firstParticipationAtom(node) {
	if (node?.[participationAtom] !== undefined) return node[participationAtom];
	for (const child of node?.children ?? []) {
		const found = firstParticipationAtom(child);
		if (found !== undefined) return found;
	}
	return undefined;
}

/**
 * Fix each row's study/participation predicates before evaluating the entire clinical AST.
 * Projecting separate clinical branches to patients would allow different tumors to satisfy
 * an access lock and a requested filter. Pure clinical subtrees remain intact, including
 * canonical exclusion groups. The bound is checked before any clinical queries are issued.
 */
function participationFilterCases(ast) {
	const atoms = [];
	const atomIndexes = new Map();
	const visit = (node) => {
		if (everyLeaf(node, isParticipationLeaf)) {
			const key = JSON.stringify(node);
			if (!atomIndexes.has(key)) {
				atomIndexes.set(key, atoms.length);
				atoms.push(node);
			}
			return { [participationAtom]: atomIndexes.get(key) };
		}
		if (everyLeaf(node, (leaf) => !isParticipationLeaf(leaf))) return node;
		return { ...node, children: node.children.map(visit) };
	};
	const cases = [];
	let terminalBranches = 0;
	const split = (node, choices) => {
		const selected = firstParticipationAtom(node);
		if (selected === undefined) {
			if (++terminalBranches > MAX_PARTICIPATION_FILTER_BRANCHES)
				throw participationComplexityError();
			if (node !== false) cases.push({ clinical: node, choices });
			return;
		}
		for (const value of [true, false]) {
			split(replaceParticipationAtom(node, selected, value), [...choices, { selected, value }]);
		}
	};
	split(visit(ast), []);
	return { atoms, cases };
}

/** Translate any global AST into a query on one materialized participation row. */
async function filterAstToParticipationMatch(ast, collections, db) {
	if (!ast) return null;
	if (everyLeaf(ast, isParticipationLeaf)) return participationOnlyMatch(ast, collections, db);
	if (everyLeaf(ast, (leaf) => !isParticipationLeaf(leaf))) {
		return { patID: { $in: await matchingPatientIDs(ast, collections, db) } };
	}
	const { atoms, cases } = participationFilterCases(ast);
	const rowMatches = [];
	for (const atom of atoms) rowMatches.push(await participationOnlyMatch(atom, collections, db));
	const clinicalMatches = new Map();
	const alternatives = [];
	for (const { clinical, choices } of cases) {
		const clauses = choices.map(({ selected, value }) =>
			value ? rowMatches[selected] : { $nor: [rowMatches[selected]] }
		);
		if (clinical !== true) {
			const key = astValue(clinical);
			if (!clinicalMatches.has(key)) {
				clinicalMatches.set(key, {
					patID: { $in: await matchingPatientIDs(clinical, collections, db) }
				});
			}
			clauses.push(clinicalMatches.get(key));
		}
		alternatives.push(combineLogicalClauses('AND', clauses));
	}
	return combineLogicalClauses('OR', alternatives);
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

function studyParticipationStages(participationMatch, emptyStudyKeys, collections) {
	const stages = [];
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

async function studyOverviewRowStages(input, collections, db) {
	const { stages, participationMatch, emptyStudyKeys } = await studyOverviewMembership(
		input,
		collections,
		db
	);
	return [...stages, ...studyParticipationStages(participationMatch, emptyStudyKeys, collections)];
}

async function buildStudyOverviewAggregation(input, collections, db) {
	// Metadata sorting/filtering can select the visible studies before loading
	// their participations. Patient counts and derived columns still need the join first.
	const pageBeforeParticipationLookup =
		!(input?.project ?? []).length &&
		input?.sortField !== 'studyPatients' &&
		!input?.sortField?.startsWith('studyPatients.') &&
		!normalizeColumnFilters(input?.columnFilters).some(({ field }) =>
			field.startsWith('studyPatients')
		);
	let stages;
	let participationStages = [];
	if (pageBeforeParticipationLookup) {
		const membership = await studyOverviewMembership(input, collections, db);
		stages = membership.stages;
		participationStages = studyParticipationStages(
			membership.participationMatch,
			membership.emptyStudyKeys,
			collections
		);
	} else {
		stages = await studyOverviewRowStages(input, collections, db);
	}
	stages.push(...(input?.project ?? []));
	stages.push(...columnFilterStages(input?.columnFilters, collections.study));
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
	stages.push(...participationStages);
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
	stages.push(...columnFilterStages(input?.columnFilters, collections.study));
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

async function getStudyCategoryChart(input, context) {
	// Study metadata no longer carries tumor IDs. Select studies through the
	// participation collection, just as the overview and its count do.
	const { stages } = await studyOverviewMembership(input, context.collections, context.db);
	stages.push({
		$group: { _id: { label: `$${input.selectedType}` }, count: { $count: {} } }
	});
	const rows = await context.db.collection(context.collections.study).aggregate(stages).toArray();
	return {
		label: rows.map((row) => row._id.label),
		count: rows.map((row) => row.count)
	};
}

async function getStudyPatientChart(input, context) {
	const { stages, participationMatch } = await studyOverviewMembership(
		input,
		context.collections,
		context.db
	);
	const countStages = participationMatch ? [{ $match: participationMatch }] : [];
	countStages.push({ $group: { _id: '$studyKey', count: { $sum: 1 } } });
	const [studies, participationCounts] = await Promise.all([
		context.db
			.collection(context.collections.study)
			.aggregate([
				...stages,
				{ $sort: { _id: sortOrder.newest } },
				{ $project: { _id: 0, studyKey: 1, shortname: 1 } }
			])
			.toArray(),
		context.db.collection(context.collections.studyPatient).aggregate(countStages).toArray()
	]);
	const countsByStudy = new Map(participationCounts.map(({ _id, count }) => [_id, count]));
	return studies.map(({ studyKey, shortname }) => ({
		shortname,
		studyPatients: countsByStudy.get(studyKey) ?? 0
	}));
}

module.exports = {
	buildStudyOverviewAggregation,
	buildStudyOverviewCountAggregation,
	buildStudyPatientCountAggregation,
	buildStudyPatientTableAggregation,
	filterAstToParticipationMatch,
	getStudyCategoryChart,
	getStudyOverview,
	getStudyOverviewCount,
	getStudyPatientChart,
	getStudyPatientCount,
	getStudyPatientTable,
	matchingPatientIDs,
	matchingStudyKeys,
	parseAstFilter
};
