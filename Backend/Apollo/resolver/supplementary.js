const { getCategoryGroupedRes } = require('../groupResult.js');

module.exports = {
	Query: {
		getSupplementaryChart: (_parent, { filter }, context) =>
			getCategoryGroupedRes(context.db, context.collections.supplementary, filter),

		getMolecularMarkerChart: (_parent, { filter }, context) =>
			getCategoryGroupedRes(context.db, context.collections.molecularmarker, filter),

		getBioMaterialChart: (_parent, { filter }, context) =>
			getCategoryGroupedRes(context.db, context.collections.bioMaterial, filter),

		getStatusChart: (_parent, { filter }, context) =>
			getCategoryGroupedRes(context.db, context.collections.status, filter)
	}
};
