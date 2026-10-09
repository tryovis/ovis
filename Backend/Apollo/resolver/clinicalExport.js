const { GraphQLError } = require('graphql');
const { EJSON } = require('bson');
const { aggregationArry } = require('../utils');
const { buildTherapyRadiationAggregation } = require('./therapyRadiationTable');
const { globalParticipationMatch, studyOverviewMembership } = require('./studyPatientTable');

// Deliberately independent of the database inventory: no administration or audit collection.
const EXPORT_COLLECTIONS = Object.freeze({
	patient: 'patient',
	diagnosis: 'diagnosis',
	therapy: 'therapy',
	radiation: 'therapy',
	histology: 'histology',
	tnm: 'tnm',
	progress: 'progress',
	metastasis: 'metastasis',
	tumorBoard: 'tumorBoard',
	consultation: 'consultation',
	status: 'status',
	molecularMarker: 'molecularMarker',
	bioMaterial: 'bioMaterial',
	studyPatient: 'studyPatient',
	supplementary: 'supplementary',
	diagnostic: 'diagnostic',
	study: 'study',
	kaplanMeier: 'kaplanMeier',
	followUp: 'followUp'
});
const IDENTITY_FIELDS = new Set(['firstName', 'lastName']);
const invalid = (message) => new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
const plainObject = (value) =>
	value != null &&
	typeof value === 'object' &&
	(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const hiddenKey = (key, pseudonymized) =>
	pseudonymized && key.split('.').some((part) => IDENTITY_FIELDS.has(part));

/** Redact before serializing any parent object/array, not only the flattened name columns. */
function redact(value, pseudonymized, depth = 0) {
	if (depth > 100) throw invalid('Export document exceeds supported nesting depth');
	if (Array.isArray(value)) return value.map((entry) => redact(entry, pseudonymized, depth + 1));
	if (!plainObject(value)) return value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => !hiddenKey(key, pseudonymized))
			.map(([key, child]) => {
				if (key.includes('.'))
					throw invalid('Literal dotted field names are not supported for export');
				return [key, redact(child, pseudonymized, depth + 1)];
			})
	);
}

function jsonValue(value) {
	if (value == null) return null;
	if (value instanceof Date) return value.getTime();
	if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
	if (typeof value === 'bigint') return value.toString();
	if (Array.isArray(value)) return value.map(jsonValue);
	if (plainObject(value))
		return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, jsonValue(child)]));
	if (value?._bsontype === 'ObjectId') return value.toHexString();
	// Preserve BSON decimals/large integers/binary without rounding or silently losing fields.
	if (value?._bsontype) return EJSON.serialize(value, { relaxed: false });
	return value;
}

function scalar(value) {
	if (value == null) return { value: null, type: null };
	if (value instanceof Date) return { value: value.getTime(), type: 'DATE' };
	if (typeof value === 'number' && Number.isFinite(value)) return { value, type: 'NUMBER' };
	if (typeof value === 'string') return { value, type: 'TEXT' };
	if (typeof value === 'boolean') return { value: String(value), type: 'TEXT' };
	const normalized = jsonValue(value);
	return {
		value: typeof normalized === 'string' ? normalized : JSON.stringify(normalized),
		type: 'TEXT'
	};
}

function nestedPaths(value, prefix = '', result = new Set()) {
	if (Array.isArray(value)) value.forEach((entry) => nestedPaths(entry, prefix, result));
	else if (plainObject(value))
		for (const [key, child] of Object.entries(value)) {
			const path = prefix ? `${prefix}.${key}` : key;
			result.add(path);
			nestedPaths(child, path, result);
		}
	return result;
}

function alignedValue(value, parts) {
	if (Array.isArray(value)) return value.map((entry) => alignedValue(entry, parts));
	if (!parts.length) return jsonValue(value);
	if (!plainObject(value)) return null;
	const [part, ...rest] = parts;
	return alignedValue(value[part], rest);
}

/** Arrays remain one cell and aligned leaf arrays; they never multiply the document rows. */
function flattenDocument(document, pseudonymized) {
	const row = Object.create(null);
	const types = new Map();
	const put = (path, cell) => {
		if (types.has(path)) throw invalid('Ambiguous dotted field in export document');
		row[path] = cell.value;
		types.set(path, cell.type);
	};
	const visit = (value, path) => {
		put(path, scalar(value));
		if (Array.isArray(value)) {
			for (const relative of nestedPaths(value)) {
				put(`${path}.${relative}`, {
					value: JSON.stringify(alignedValue(value, relative.split('.'))),
					type: 'TEXT'
				});
			}
		} else if (plainObject(value)) {
			for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
		}
	};
	for (const [key, value] of Object.entries(redact(document, pseudonymized))) visit(value, key);
	return { row, types };
}

async function exportAggregation(input, context, paged) {
	if (!Object.hasOwn(EXPORT_COLLECTIONS, input.collection))
		throw invalid('Unknown clinical export collection');
	const collection = EXPORT_COLLECTIONS[input.collection];
	const args = {
		filter: input.filter,
		...(paged ? { offset: input.offset, limit: input.limit } : {})
	};
	if (input.collection === 'radiation') {
		return {
			collection,
			stages: await buildTherapyRadiationAggregation(args, context, false, { allFields: true })
		};
	}
	let stages;
	if (input.collection === 'studyPatient') {
		const match = await globalParticipationMatch(args, context.collections, context.db);
		stages = match ? [{ $match: match }] : [];
	} else if (input.collection === 'study') {
		({ stages } = await studyOverviewMembership(args, context.collections, context.db));
	} else {
		return { collection, stages: await aggregationArry(args, collection, context.db) };
	}
	stages.push({ $sort: { _id: -1 } });
	if (paged && input.offset) stages.push({ $skip: input.offset });
	if (paged) stages.push({ $limit: input.limit });
	return { collection, stages };
}

function page(input) {
	const offset = input.offset ?? 0;
	const limit = input.limit ?? 1000;
	if (
		!Number.isSafeInteger(offset) ||
		offset < 0 ||
		offset > 2147483647 ||
		!Number.isSafeInteger(limit) ||
		limit < 1 ||
		limit > 1000
	)
		throw invalid('Invalid clinical export page');
	return { ...input, offset, limit };
}

async function readRows(input, context, paged, consume) {
	const { collection, stages } = await exportAggregation(input, context, paged);
	const cursor = context.db
		.collection(collection)
		.aggregate(stages, { allowDiskUse: true, batchSize: 250 });
	try {
		for await (const document of cursor)
			consume(flattenDocument(document, !!context.security?.user?.pseudonymization));
	} finally {
		await cursor.close();
	}
}

module.exports = {
	Query: {
		getExportFields: async (_parent, input, context) => {
			const fields = new Map();
			// Inspect the entire permitted cohort, not a sample that misses sparse/custom fields.
			await readRows(input, context, false, ({ types }) => {
				for (const [path, type] of types) {
					if (!fields.has(path)) fields.set(path, new Set());
					if (type) fields.get(path).add(type);
				}
			});
			return [...fields]
				.sort(([left], [right]) => left.localeCompare(right, 'en'))
				.map(([id, types]) => ({
					id,
					type: types.has('TEXT')
						? 'TEXT'
						: types.has('DATE') ||
						  ((id.endsWith('Date') ||
								(input.collection === 'study' && ['start', 'firstPatInPlanned'].includes(id))) &&
								types.size <= 1)
						? 'DATE'
						: types.has('NUMBER')
						? 'NUMBER'
						: 'TEXT'
				}));
		},
		getExportRows: async (_parent, input, context) => {
			const rows = [];
			await readRows(page(input), context, true, ({ row }) => rows.push(JSON.stringify(row)));
			return rows;
		}
	}
};
