const { filter2match } = require('../astTranslator');

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

function parseAstFilter(raw) {
	try {
		return JSON.parse(raw.replaceAll(/_(?!3)(?!id)/g, '.'));
	} catch (_e) {
		return null;
	}
}

function keepNonStudyClauses(ast) {
	if (!ast) return null;

	if (Array.isArray(ast.children)) {
		const kids = ast.children.map(keepNonStudyClauses).filter(Boolean);
		if (kids.length === 0) return null;
		return { ...ast, children: kids };
	}

	if (ast.system === 'study') return null;
	return ast;
}

const logicalOp = (op) => {
	switch (op) {
		case 'AND':
			return '$and';
		case 'OR':
			return '$or';
		case 'NOR':
			return '$nor';
		default:
			return null;
	}
};

const astValue = (ast) => JSON.stringify(ast);

const astAsRoot = (ast) => (Array.isArray(ast.children) ? ast : { operand: 'OR', children: [ast] });

const astEveryLeaf = (ast, predicate) => {
	if (!Array.isArray(ast.children)) return predicate(ast);
	return ast.children.every((child) => astEveryLeaf(child, predicate));
};

const mergeMatchStages = (stages) => {
	const matches = stages.map((stage) => stage.$match).filter(Boolean);
	if (matches.length === 0) return null;
	if (matches.length === 1) return matches[0];
	return { $and: matches };
};

async function matchingPatientIDs(ast, collections, db) {
	const patMatchStages = await filter2match({
		value: astValue(astAsRoot(ast)),
		column: collections.patient,
		db
	});

	const patIDsDoc = await db
		.collection(collections.patient)
		.aggregate([...patMatchStages, { $group: { _id: null, ids: { $addToSet: '$patID' } } }])
		.next();

	return patIDsDoc?.ids ?? [];
}

async function filterAstToFlattenedMatch(ast, collections, db) {
	if (!ast) return null;

	if (!Array.isArray(ast.children)) {
		if (ast.system === 'study') {
			const studyStages = await filter2match({
				value: astValue(astAsRoot(ast)),
				column: collections.study,
				db
			});
			return mergeMatchStages(studyStages);
		}

		return { 'studyPatients.patID': { $in: await matchingPatientIDs(ast, collections, db) } };
	}

	if (astEveryLeaf(ast, (leaf) => leaf.system === 'study')) {
		const studyStages = await filter2match({
			value: astValue(ast),
			column: collections.study,
			db
		});
		return mergeMatchStages(studyStages);
	}

	if (astEveryLeaf(ast, (leaf) => leaf.system !== 'study')) {
		return { 'studyPatients.patID': { $in: await matchingPatientIDs(ast, collections, db) } };
	}

	const children = [];
	for (const child of ast.children) {
		const match = await filterAstToFlattenedMatch(child, collections, db);
		if (match) children.push(match);
	}

	if (children.length === 0) return null;
	if (children.length === 1) return children[0];

	if (ast.operand === 'XOR') return { $nor: [{ $nor: children }, { $and: children }] };

	const op = logicalOp(ast.operand);
	if (!op) throw new Error(`Unknown logical operator: ${ast.operand}`);
	return { [op]: children };
}

const isEmptyFilter = (filter) => !filter || filter === emptyFilter || filter === 'null';

async function globalFilterStages(input, collections, db) {
	const agg = [];

	if (!isEmptyFilter(input?.filter)) {
		const fullAst = parseAstFilter(input.filter);
		const match = await filterAstToFlattenedMatch(fullAst, collections, db);
		if (match) agg.push({ $match: match });
	}

	return agg;
}

const flattenStudyPatientsStages = [
	{ $unwind: { path: '$studyPatients' } },
	{
		$project: {
			_id: {
				$concat: [{ $toString: '$_id' }, ':', '$studyPatients.patID']
			},
			studyID: 1,
			shortname: 1,
			patID: '$studyPatients.patID',
			recruitmentDate: '$studyPatients.recruitmentDate'
		}
	}
];

async function buildStudyPatientTableAggregation(input, collections, db) {
	const agg = [{ $unwind: { path: '$studyPatients' } }];
	agg.push(...(await globalFilterStages(input, collections, db)));
	agg.push(flattenStudyPatientsStages[1]);
	agg.push(...columnFilterStages(input?.columnFilters));
	agg.push(sortStage(input ?? {}));
	if (input?.offset) agg.push({ $skip: input.offset });
	if (input?.limit) agg.push({ $limit: input.limit });
	return agg;
}

async function buildStudyPatientCountAggregation(input, collections, db) {
	const agg = [{ $unwind: { path: '$studyPatients' } }];
	agg.push(...(await globalFilterStages(input, collections, db)));
	agg.push(flattenStudyPatientsStages[1]);
	agg.push(...columnFilterStages(input?.columnFilters));
	agg.push({ $count: 'count' });
	return agg;
}

async function getStudyPatientTable(input, context) {
	const agg = await buildStudyPatientTableAggregation(input, context.collections, context.db);
	return context.db.collection(context.collections.study).aggregate(agg).toArray();
}

async function getStudyPatientCount(input, context) {
	const agg = await buildStudyPatientCountAggregation(input, context.collections, context.db);
	const result = await context.db.collection(context.collections.study).aggregate(agg).next();
	return result?.count ?? 0;
}

module.exports = {
	buildStudyPatientCountAggregation,
	buildStudyPatientTableAggregation,
	filterAstToFlattenedMatch,
	getStudyPatientCount,
	getStudyPatientTable,
	keepNonStudyClauses,
	matchingPatientIDs,
	parseAstFilter
};
