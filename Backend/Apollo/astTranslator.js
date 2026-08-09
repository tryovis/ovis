const { combineLogicalClauses, parseAstFilter } = require('./astUtils');

const NULL_AST = '{"operand":"OR","children":[]}';
const NULL_VALUES = ['-', '', ' ', null];

// Field shape belongs to a system. A global field-name list cannot distinguish, for example,
// the scalar therapy.ECOG from the diagnosis ECOG array.
const FIELD_METADATA = {
	diagnosis: {
		primitiveArrays: new Set(['ECOG'])
	},
	followUp: {
		primitiveArrays: new Set(['progressDate', 'therapyEndDate', 'therapyStartDate'])
	},
	therapy: {
		objectArrays: new Set(['complication', 'ops', 'radiation', 'substance']),
		primitiveArrays: new Set(['metastasisResection', 'surgeon'])
	}
};

const cleanKey = (key) => String(key ?? '').replace(/^!/, '');

const parseBooleanString = (value) =>
	value === 'true' || value === 'false' ? value === 'true' : value;

const isNullBound = (value) => value == null || value === '';

function roundToNextUTCMidnight(timestamp) {
	if (isNullBound(timestamp)) return timestamp;
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return timestamp;
	date.setUTCHours(0, 0, 0, 0);
	if (Number(timestamp) % 86400000 !== 0) date.setUTCDate(date.getUTCDate() + 1);
	return date;
}

function normalizeRangeBound(system, key, value) {
	if (isNullBound(value)) return value;
	if (key.toLowerCase().includes('date')) return roundToNextUTCMidnight(value);
	if (system === 'study' && ['start', 'firstPatInPlanned'].includes(key)) {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? value : date;
	}
	return value;
}

function normalizeEqualityValue(system, key, value) {
	if (value === '-' || value == null) return value;
	const isDateField =
		key.toLowerCase().includes('date') ||
		(system === 'study' && ['start', 'firstPatInPlanned'].includes(key));
	if (!isDateField) return value;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : date;
}

const metadataFor = (system) => FIELD_METADATA[system] ?? {};

function objectArrayPath(system, key, unwoundArrays = new Set()) {
	const [prefix, ...rest] = key.split('.');
	if (rest.length === 0 || unwoundArrays.has(prefix)) return null;
	return metadataFor(system).objectArrays?.has(prefix)
		? { prefix, relativePath: rest.join('.') }
		: null;
}

function isPrimitiveArray(system, key) {
	return metadataFor(system).primitiveArrays?.has(key) ?? false;
}

function emptyValueQuery(key) {
	return {
		$or: [{ [key]: { $exists: false } }, { [key]: { $in: NULL_VALUES } }, { [key]: { $size: 0 } }]
	};
}

function rangeForLeaf(leaf) {
	const key = cleanKey(leaf.key);
	let { min = null, max = null } = leaf.value ?? {};
	min = normalizeRangeBound(leaf.system, key, min);
	max = normalizeRangeBound(leaf.system, key, max);
	const range = {};
	if (!isNullBound(min)) range.$gte = min;
	if (!isNullBound(max)) range.$lte = max;
	return range;
}

function positiveLeafQuery(leaf, options = {}) {
	const key = cleanKey(leaf.key);
	const value = normalizeEqualityValue(leaf.system, key, parseBooleanString(leaf.value));

	if (leaf.type === 'EQUALS') {
		return value === '-' ? emptyValueQuery(key) : { [key]: { $eq: value } };
	}

	if (leaf.type !== 'BETWEEN') {
		throw new Error(`Unsupported positive comparison type: ${leaf.type}`);
	}

	const range = rangeForLeaf(leaf);
	if (Object.keys(range).length === 0) return emptyValueQuery(key);

	const arrayPath = objectArrayPath(leaf.system, key, options.unwoundArrays);
	if (arrayPath) {
		return {
			[arrayPath.prefix]: {
				$elemMatch: { [arrayPath.relativePath]: range }
			}
		};
	}
	if (isPrimitiveArray(leaf.system, key)) return { [key]: { $elemMatch: range } };
	return { [key]: range };
}

function leafQuery(leaf, options = {}) {
	if (leaf.type === 'NEQUALS') {
		return { $nor: [positiveLeafQuery({ ...leaf, type: 'EQUALS' }, options)] };
	}
	if (leaf.type === 'NBETWEEN') {
		return { $nor: [positiveLeafQuery({ ...leaf, type: 'BETWEEN' }, options)] };
	}
	return positiveLeafQuery(leaf, options);
}

function directObjectArrayPrefix(node, system, unwoundArrays) {
	if (!Array.isArray(node?.children)) {
		return objectArrayPath(system, cleanKey(node?.key), unwoundArrays)?.prefix ?? null;
	}
	const prefixes = node.children.map((child) =>
		directObjectArrayPrefix(child, system, unwoundArrays)
	);
	return prefixes[0] && prefixes.every((prefix) => prefix === prefixes[0]) ? prefixes[0] : null;
}

function relativeArrayNode(node, prefix) {
	if (!Array.isArray(node?.children)) {
		const key = cleanKey(node.key);
		const negated = String(node.key ?? '').startsWith('!');
		return { ...node, key: `${negated ? '!' : ''}${key.slice(prefix.length + 1)}` };
	}
	return { ...node, children: node.children.map((child) => relativeArrayNode(child, prefix)) };
}

// Translate an AST subtree that is evaluated against one materialized document.
function localQuery(node, system, options = {}) {
	if (!Array.isArray(node?.children)) return leafQuery(node, options);
	if (node.children.length === 1) return localQuery(node.children[0], system, options);
	if (
		node.operand === 'OR' &&
		node.children.every(
			(child) =>
				!Array.isArray(child?.children) &&
				child.type === 'EQUALS' &&
				child.system === system &&
				cleanKey(child.key) === cleanKey(node.children[0].key) &&
				child.value !== '-'
		)
	) {
		const key = cleanKey(node.children[0].key);
		return {
			[key]: {
				$in: node.children.map((child) =>
					normalizeEqualityValue(system, key, parseBooleanString(child.value))
				)
			}
		};
	}

	if (node.operand === 'AND') {
		const prefix = directObjectArrayPrefix(node, system, options.unwoundArrays);
		if (prefix) {
			const relative = relativeArrayNode(node, prefix);
			return {
				[prefix]: {
					$elemMatch: localQuery(relative, system, {
						...options,
						unwoundArrays: new Set([...(options.unwoundArrays ?? []), prefix])
					})
				}
			};
		}
	}

	return combineLogicalClauses(
		node.operand,
		node.children.map((child) => localQuery(child, system, options))
	);
}

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

function canonicalNegatedGroup(node) {
	if (!Array.isArray(node?.children) || node.children.length === 0) return false;
	const types = new Set(node.children.map((child) => child.type));
	if (types.size !== 1 || !['NEQUALS', 'NBETWEEN'].includes(node.children[0].type)) {
		return false;
	}
	const keys = new Set(node.children.map((child) => cleanKey(child.key)));
	return keys.size === 1;
}

const flattenIDs = (values) => (values ?? []).flat(Infinity).filter((value) => value != null);

async function distinctIDs(collection, query = {}) {
	return [...new Set(flattenIDs(await collection.distinct('tumorID', query)))];
}

async function distinctValues(collection, field, query = {}) {
	return [...new Set(flattenIDs(await collection.distinct(field, query)))];
}

async function linkedStudyTumorIDs(db, system, query = {}) {
	let patIDs;
	if (system === 'study') {
		const studyKeys = await distinctValues(db.collection('study'), 'studyKey', query);
		patIDs = await distinctValues(db.collection('studyPatient'), 'patID', {
			studyKey: { $in: studyKeys }
		});
	} else {
		patIDs = await distinctValues(db.collection('studyPatient'), 'patID', query);
	}
	return new Set(
		await distinctValues(db.collection('diagnosis'), 'tumorID', {
			patID: { $in: patIDs }
		})
	);
}

async function matchingLinkedCanonicalNegation(db, system, node, universe, options) {
	const type = node.children[0].type;
	const positiveType = type === 'NEQUALS' ? 'EQUALS' : 'BETWEEN';
	const positiveChildren = node.children.map((child) => ({ ...child, type: positiveType }));
	const emptyChildren = positiveChildren.filter((child) => child.value === '-');
	const forbiddenChildren = positiveChildren.filter((child) => child.value !== '-');

	if (type === 'NEQUALS' && emptyChildren.length > 0) {
		const presentQuery = combineLogicalClauses(
			'AND',
			emptyChildren.map((child) => leafQuery({ ...child, type: 'NEQUALS' }, options))
		);
		const present = await linkedStudyTumorIDs(db, system, presentQuery);
		const forbidden = forbiddenChildren.length
			? await linkedStudyTumorIDs(
					db,
					system,
					combineLogicalClauses(
						'OR',
						forbiddenChildren.map((child) => positiveLeafQuery(child, options))
					)
			  )
			: new Set();
		return new Set([...present].filter((id) => universe.has(id) && !forbidden.has(id)));
	}

	const forbidden = forbiddenChildren.length
		? await linkedStudyTumorIDs(
				db,
				system,
				combineLogicalClauses(
					'OR',
					forbiddenChildren.map((child) => positiveLeafQuery(child, options))
				)
		  )
		: new Set();
	return new Set([...universe].filter((id) => !forbidden.has(id)));
}

async function matchingLinkedStudyTumorIDs(db, system, node, universe, options) {
	if (canonicalNegatedGroup(node)) {
		return matchingLinkedCanonicalNegation(db, system, node, universe, options);
	}
	if (Array.isArray(node?.children) && node.children.length === 1) {
		return matchingLinkedStudyTumorIDs(db, system, node.children[0], universe, options);
	}
	if (Array.isArray(node?.children) && node.operand !== 'AND') {
		const childSets = [];
		for (const child of node.children) {
			childSets.push(await matchingLinkedStudyTumorIDs(db, system, child, universe, options));
		}
		return setOperation(node.operand, childSets, universe);
	}

	const matching = await linkedStudyTumorIDs(db, system, localQuery(node, system, options));
	if (missingNodeResult(node)) {
		const present = await linkedStudyTumorIDs(db, system);
		for (const id of universe) if (!present.has(id)) matching.add(id);
	}
	return new Set([...matching].filter((id) => universe.has(id)));
}

function setOperation(operand, childSets, universe) {
	const result = new Set();
	for (const id of universe) {
		const matches = childSets.map((set) => set.has(id));
		const keep =
			operand === 'AND'
				? matches.every(Boolean)
				: operand === 'OR'
				? matches.some(Boolean)
				: operand === 'NOR'
				? matches.every((match) => !match)
				: operand === 'XOR'
				? matches.filter(Boolean).length === 1
				: null;
		if (keep == null) throw new Error(`Unknown logical operator: ${operand}`);
		if (keep) result.add(id);
	}
	return result;
}

function missingLeafResult(leaf) {
	const emptyPositive =
		(leaf.type === 'EQUALS' && leaf.value === '-') ||
		(leaf.type === 'BETWEEN' && Object.keys(rangeForLeaf(leaf)).length === 0);
	if (leaf.type === 'NEQUALS' || leaf.type === 'NBETWEEN') {
		return !missingLeafResult({
			...leaf,
			type: leaf.type === 'NEQUALS' ? 'EQUALS' : 'BETWEEN'
		});
	}
	return emptyPositive;
}

function missingNodeResult(node) {
	if (!Array.isArray(node?.children)) return missingLeafResult(node);
	const values = node.children.map(missingNodeResult);
	if (node.operand === 'AND') return values.every(Boolean);
	if (node.operand === 'OR') return values.some(Boolean);
	if (node.operand === 'NOR') return values.every((value) => !value);
	if (node.operand === 'XOR') return values.filter(Boolean).length === 1;
	throw new Error(`Unknown logical operator: ${node.operand}`);
}

async function matchingCanonicalNegation(db, system, node, universe, options) {
	const source = db.collection(system);
	const type = node.children[0].type;
	const positiveType = type === 'NEQUALS' ? 'EQUALS' : 'BETWEEN';
	const positiveChildren = node.children.map((child) => ({ ...child, type: positiveType }));
	const emptyChildren = positiveChildren.filter((child) => child.value === '-');
	const forbiddenChildren = positiveChildren.filter((child) => child.value !== '-');

	if (type === 'NEQUALS' && emptyChildren.length > 0) {
		const presentQuery = combineLogicalClauses(
			'AND',
			emptyChildren.map((child) => leafQuery({ ...child, type: 'NEQUALS' }, options))
		);
		const present = new Set(await distinctIDs(source, presentQuery));
		const forbidden = forbiddenChildren.length
			? new Set(
					await distinctIDs(
						source,
						combineLogicalClauses(
							'OR',
							forbiddenChildren.map((child) => positiveLeafQuery(child, options))
						)
					)
			  )
			: new Set();
		return new Set([...present].filter((id) => universe.has(id) && !forbidden.has(id)));
	}

	const forbidden = forbiddenChildren.length
		? new Set(
				await distinctIDs(
					source,
					combineLogicalClauses(
						'OR',
						forbiddenChildren.map((child) => positiveLeafQuery(child, options))
					)
				)
		  )
		: new Set();
	return new Set([...universe].filter((id) => !forbidden.has(id)));
}

// Project a same-system subtree onto the target collection's tumor universe. Set operations are
// intentional here: they preserve complements for tumors that have no source-system document.
async function matchingTumorIDs(db, system, node, universe, options = {}) {
	if (system === 'study' || system === 'studyPatient') {
		return matchingLinkedStudyTumorIDs(db, system, node, universe, options);
	}
	if (canonicalNegatedGroup(node)) {
		return matchingCanonicalNegation(db, system, node, universe, options);
	}
	if (Array.isArray(node?.children) && node.children.length === 1) {
		return matchingTumorIDs(db, system, node.children[0], universe, options);
	}
	if (Array.isArray(node?.children) && node.operand !== 'AND') {
		const childSets = [];
		for (const child of node.children) {
			childSets.push(await matchingTumorIDs(db, system, child, universe, options));
		}
		return setOperation(node.operand, childSets, universe);
	}

	const source = db.collection(system);
	const matching = new Set(await distinctIDs(source, localQuery(node, system, options)));
	if (missingNodeResult(node)) {
		const present = new Set(await distinctIDs(source));
		for (const id of universe) if (!present.has(id)) matching.add(id);
	}
	return new Set([...matching].filter((id) => universe.has(id)));
}

async function matchingMixedTumorIDs(db, node, universe, options = {}) {
	const system = singleLeafSystem(node);
	if (system) return matchingTumorIDs(db, system, node, universe, options);
	if (!Array.isArray(node?.children)) return new Set();

	let children = node.children;
	if (node.operand === 'AND') {
		const grouped = new Map();
		const mixed = [];
		for (const child of children) {
			const childSystem = singleLeafSystem(child);
			if (!childSystem) mixed.push(child);
			else {
				if (!grouped.has(childSystem)) grouped.set(childSystem, []);
				grouped.get(childSystem).push(child);
			}
		}
		children = [
			...mixed,
			...[...grouped.values()].map((group) =>
				group.length === 1 ? group[0] : { operand: 'AND', children: group }
			)
		];
	}

	const childSets = [];
	for (const child of children) {
		childSets.push(await matchingMixedTumorIDs(db, child, universe, options));
	}
	return setOperation(node.operand, childSets, universe);
}

// Keep local clauses document-scoped and reduce foreign clauses to matching tumor IDs.
async function targetQuery(db, node, targetSystem, universe, options = {}) {
	const system = singleLeafSystem(node);
	if (system === targetSystem) return localQuery(node, targetSystem, options);
	if (system) {
		const ids = await matchingTumorIDs(db, system, node, universe, options);
		return { tumorID: { $in: [...ids] } };
	}
	if (!Array.isArray(node?.children)) return { $expr: { $eq: [1, 0] } };

	const clauses = [];
	for (const child of node.children) {
		clauses.push(await targetQuery(db, child, targetSystem, universe, options));
	}
	return combineLogicalClauses(node.operand, clauses);
}

async function patientQuery(db, node, universe, options = {}) {
	const patientClauseForTumors = async (ids) => {
		const tumorIDs = [...ids];
		const patIDs = await db.collection('diagnosis').distinct('patID', {
			tumorID: { $in: tumorIDs }
		});
		return combineLogicalClauses('OR', [
			{ tumorID: { $in: tumorIDs } },
			{ patID: { $in: flattenIDs(patIDs) } }
		]);
	};

	const system = singleLeafSystem(node);
	if (system === 'patient') return localQuery(node, 'patient', options);
	if (system) {
		const ids = await matchingTumorIDs(db, system, node, universe, options);
		return patientClauseForTumors(ids);
	}
	if (!Array.isArray(node?.children)) return { $expr: { $eq: [1, 0] } };

	if (everyLeaf(node, (leaf) => leaf.system !== 'patient')) {
		const ids = await matchingMixedTumorIDs(db, node, universe, options);
		return patientClauseForTumors(ids);
	}

	const clauses = [];
	for (const child of node.children) clauses.push(await patientQuery(db, child, universe, options));
	return combineLogicalClauses(node.operand, clauses);
}

function filterCondition(leaf, relativePath) {
	const value = normalizeEqualityValue(
		leaf.system,
		cleanKey(leaf.key),
		parseBooleanString(leaf.value)
	);
	const ref = `$$it.${relativePath}`;
	let positive;
	if (leaf.type === 'EQUALS' || leaf.type === 'NEQUALS') {
		positive = value === '-' ? { $in: [ref, NULL_VALUES] } : { $eq: [ref, value] };
	} else {
		const range = rangeForLeaf(leaf);
		if (Object.keys(range).length === 0) positive = { $in: [ref, NULL_VALUES] };
		else {
			const parts = [];
			if ('$gte' in range) parts.push({ $gte: [ref, range.$gte] });
			if ('$lte' in range) parts.push({ $lte: [ref, range.$lte] });
			positive = parts.length === 1 ? parts[0] : { $and: parts };
		}
	}
	return leaf.type === 'NEQUALS' || leaf.type === 'NBETWEEN' ? { $not: [positive] } : positive;
}

// Matching selects documents; these optional stages only trim displayed object-array entries.
function arrayFilterStages(node, targetSystem, unwoundArrays = new Set()) {
	const stages = [];
	const visit = (item) => {
		if (!Array.isArray(item?.children)) {
			if (item.system !== targetSystem) return;
			const path = objectArrayPath(targetSystem, cleanKey(item.key), unwoundArrays);
			if (!path) return;
			stages.push({
				$set: {
					[path.prefix]: {
						$filter: {
							input: `$${path.prefix}`,
							as: 'it',
							cond: filterCondition(item, path.relativePath)
						}
					}
				}
			});
			return;
		}

		const leaves = item.children.filter((child) => !Array.isArray(child?.children));
		const paths = leaves.map((leaf) =>
			leaf.system === targetSystem
				? objectArrayPath(targetSystem, cleanKey(leaf.key), unwoundArrays)
				: null
		);
		if (
			item.operand === 'OR' &&
			leaves.length === item.children.length &&
			paths[0] &&
			paths.every(
				(path) => path?.prefix === paths[0].prefix && path.relativePath === paths[0].relativePath
			)
		) {
			const conditions = leaves.map((leaf) => filterCondition(leaf, paths[0].relativePath));
			stages.push({
				$set: {
					[paths[0].prefix]: {
						$filter: {
							input: `$${paths[0].prefix}`,
							as: 'it',
							cond: conditions.length === 1 ? conditions[0] : { $or: conditions }
						}
					}
				}
			});
			return;
		}
		item.children.forEach(visit);
	};
	visit(node);
	return stages;
}

async function filter2match({ value, column, db, unwoundArrays = [] }) {
	if (value === NULL_AST) return [];
	const ast = parseAstFilter(value);
	if (!ast) throw new Error('Invalid filter AST');
	const options = { unwoundArrays: new Set(unwoundArrays) };
	const universe = new Set(await distinctIDs(db.collection(column)));
	if (column === 'patient') {
		for (const id of await distinctIDs(db.collection('diagnosis'))) universe.add(id);
	}
	const match =
		column === 'patient'
			? await patientQuery(db, ast, universe, options)
			: await targetQuery(db, ast, column, universe, options);
	return [{ $match: match }, ...arrayFilterStages(ast, column, options.unwoundArrays)];
}

module.exports = {
	filter2match,
	parseFilterAst: parseAstFilter,
	internal: {
		FIELD_METADATA,
		NULL_VALUES,
		localQuery,
		missingNodeResult,
		roundToNextUTCMidnight
	}
};
