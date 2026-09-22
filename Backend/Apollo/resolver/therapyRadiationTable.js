const { aggregationArry, countAggregationArry } = require('../utils');

const radiationFields = [
	'type',
	'brachyType',
	'radioTarget',
	'boost',
	'totalDose',
	'totalDoseUnit',
	'tech',
	'radioType',
	'radioNuclid',
	'singleDose',
	'singleDoseUnit',
	'subArea',
	'supArea',
	'side',
	'tumor',
	'metastasis',
	'lymphNodes',
	'performance',
	'duration',
	'breath',
	'stereo',
	'areaGrouped',
	'areaDetailed'
];

const flatRadiationField = (field) =>
	typeof field === 'string' ? field.replace(/^(!?)radiation[_.]/, '$1') : field;

function radiationFilter(filter) {
	if (!filter) return filter;
	let ast;
	try {
		ast = JSON.parse(filter);
	} catch (_error) {
		// Keep invalid input for the common AST validator to reject.
		return filter;
	}
	const visit = (node) => {
		if (!node || typeof node !== 'object') return;
		if (node.system === 'therapy') node.key = flatRadiationField(node.key);
		if (Array.isArray(node.children)) node.children.forEach(visit);
	};
	visit(ast);
	return JSON.stringify(ast);
}

async function buildTherapyRadiationAggregation(input, context, count = false) {
	const args = {
		...input,
		filter: radiationFilter(input.filter),
		sortField: flatRadiationField(input.sortField),
		columnFilters: input.columnFilters?.map((column) => ({
			...column,
			field: flatRadiationField(column.field)
		}))
	};
	const build = count ? countAggregationArry : aggregationArry;
	return [
		{ $match: { generalType: 'radiation' } },
		{ $unwind: { path: '$radiation', preserveNullAndEmptyArrays: true } },
		{
			$set: Object.fromEntries(radiationFields.map((field) => [field, `$radiation.${field}`]))
		},
		{ $unset: 'radiation' },
		// Apply the complete cohort and row filters to the same flattened rows for
		// both queries. Missing details still form one row; multiple details form several.
		...(await build(args, context.collections.therapy, context.db))
	];
}

async function getTherapyRadiationCount(input, context) {
	const result = await context.db
		.collection(context.collections.therapy)
		.aggregate(await buildTherapyRadiationAggregation(input, context, true))
		.next();
	return result?.count ?? 0;
}

module.exports = { buildTherapyRadiationAggregation, getTherapyRadiationCount };
