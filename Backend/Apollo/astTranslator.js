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
	const instant = date.getTime();
	date.setUTCHours(0, 0, 0, 0);
	if (instant !== date.getTime()) date.setUTCDate(date.getUTCDate() + 1);
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
		if (!['EQUALS', 'BETWEEN'].includes(node?.type)) return null;
		return objectArrayPath(system, cleanKey(node?.key), unwoundArrays)?.prefix ?? null;
	}
	if (['NOR', 'XOR'].includes(node.operand)) return null;
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
	if (node.children.length === 1 && node.operand !== 'NOR')
		return localQuery(node.children[0], system, options);
	if (canonicalNegatedGroup(node)) {
		return combineLogicalClauses(
			'AND',
			node.children.map((child) => leafQuery(child, options))
		);
	}
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
		// A scalar sibling must not disable same-element matching for array-field siblings.
		const byArray = new Map();
		const separate = [];
		for (const child of conjunctionTerms(node)) {
			const arrayPrefix = directObjectArrayPrefix(child, system, options.unwoundArrays);
			if (!arrayPrefix) separate.push(child);
			else {
				if (!byArray.has(arrayPrefix)) byArray.set(arrayPrefix, []);
				byArray.get(arrayPrefix).push(child);
			}
		}
		if ([...byArray.values()].some((children) => children.length > 1)) {
			const groups = [
				...separate,
				...[...byArray.values()].map((children) =>
					children.length === 1 ? children[0] : { operand: 'AND', children }
				)
			];
			return combineLogicalClauses(
				'AND',
				groups.map((child) => localQuery(child, system, options))
			);
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
	if (!['AND', 'OR'].includes(node.operand)) return false;
	const types = new Set(node.children.map((child) => child.type));
	if (types.size !== 1 || !['NEQUALS', 'NBETWEEN'].includes(node.children[0].type)) {
		return false;
	}
	const keys = new Set(node.children.map((child) => cleanKey(child.key)));
	return keys.size === 1;
}

function negativeLeaf(node) {
	return !Array.isArray(node?.children) && ['NEQUALS', 'NBETWEEN'].includes(node?.type);
}

const MAX_FILTER_BRANCHES = 256;
const MAX_FILTER_QUERY_NODES = 20000;

function filterComplexityError() {
	const error = new Error('Filter is too complex. Reduce nested OR/XOR combinations.');
	error.code = 'FILTER_TOO_COMPLEX';
	error.extensions = { code: 'BAD_USER_INPUT' };
	return error;
}

// Distribute mixed-system alternatives before binding same-system conditions to one record.
// A field's own OR remains atomic: it can be evaluated efficiently in one Mongo predicate.
function normalizeFilterLogic(ast) {
	let visited = 0;
	const visit = (node, depth = 0) => {
		if (++visited > MAX_FILTER_QUERY_NODES || depth > 64) throw filterComplexityError();
		if (!Array.isArray(node?.children) || canonicalNegatedGroup(node)) return node;
		const children = node.children.map((child) => visit(child, depth + 1));
		// Neutral wrappers inside a negative field group must not erase its tumor-wide exclusion.
		const negativeGroupChildren = children.map((child) => {
			while (child.children?.length === 1 && ['AND', 'OR', 'XOR'].includes(child.operand))
				child = child.children[0];
			return child;
		});
		if (canonicalNegatedGroup({ ...node, children: negativeGroupChildren }))
			return { ...node, children: negativeGroupChildren };
		if (children.length === 1 && ['AND', 'OR', 'XOR'].includes(node.operand)) return children[0];
		if (
			node.operand === 'NOR' &&
			children.length === 1 &&
			children[0].operand === 'NOR' &&
			children[0].children.length === 1
		)
			return children[0].children[0];
		if (node.operand !== 'AND') return { ...node, children };
		const terms = children.flatMap((child) =>
			child.operand === 'AND' && !canonicalNegatedGroup(child) ? child.children : [child]
		);
		let branches = [[]];
		let distributed = false;
		for (const term of terms) {
			const mixed = !singleLeafSystem(term);
			const alternatives =
				mixed && term.operand === 'OR' && !canonicalNegatedGroup(term)
					? term.children
					: mixed && term.operand === 'XOR'
					? term.children.map((selected, index) => ({
							operand: 'AND',
							children: [
								selected,
								...term.children
									.filter((_child, other) => other !== index)
									.map((other) => ({ operand: 'NOR', children: [other] }))
							]
					  }))
					: [term];
			if (alternatives !== undefined && alternatives.length !== 1) distributed = true;
			if (branches.length * alternatives.length > MAX_FILTER_BRANCHES)
				throw filterComplexityError();
			branches = branches.flatMap((branch) =>
				alternatives.map((alternative) => [...branch, alternative])
			);
		}
		if (!distributed) return { ...node, children: terms };
		return {
			operand: 'OR',
			children: branches.map((branch) => visit({ operand: 'AND', children: branch }, depth + 1))
		};
	};
	const normalized = visit(ast);
	const estimate = (node) => {
		if (++visited > MAX_FILTER_QUERY_NODES) throw filterComplexityError();
		if (!Array.isArray(node?.children)) return { positive: 1, negative: 1 };
		const costs = node.children.map(estimate);
		const positiveSum = costs.reduce((total, value) => total + value.positive, 0);
		const negativeSum = costs.reduce((total, value) => total + value.negative, 0);
		let positive = 1 + (node.operand === 'NOR' ? negativeSum : positiveSum);
		let negative = 1 + (node.operand === 'NOR' ? positiveSum : negativeSum);
		if (node.operand === 'XOR') {
			positive = 1 + costs.length + positiveSum + Math.max(0, costs.length - 1) * negativeSum;
			negative = 2 + costs.length + positiveSum + negativeSum + positive;
		}
		if (Math.max(positive, negative) > MAX_FILTER_QUERY_NODES) throw filterComplexityError();
		return { positive, negative };
	};
	estimate(normalized);
	return normalized;
}

function requestIdentity(options, value) {
	options.identities ??= new WeakMap();
	if (!options.identities.has(value)) {
		options.identityCounter = (options.identityCounter ?? 0) + 1;
		options.identities.set(value, options.identityCounter);
	}
	return options.identities.get(value);
}

function memoizedTranslation(options, kind, node, universe, flags, compute) {
	options.translations ??= new Map();
	const key = `${kind}:${requestIdentity(options, node)}:${requestIdentity(
		options,
		universe
	)}:${flags}`;
	if (!options.translations.has(key)) options.translations.set(key, compute());
	return options.translations.get(key);
}

// Merge conjunctive wrappers introduced by combining an assigned filter with the user's filter.
// Retain value-exclusion groups: their foreign-system meaning is a tumor-level complement.
function conjunctionTerms(node) {
	if (canonicalNegatedGroup(node)) return [node];
	if (
		Array.isArray(node?.children) &&
		node.children.length === 1 &&
		['AND', 'OR'].includes(node.operand)
	) {
		return conjunctionTerms(node.children[0]);
	}
	if (node?.operand === 'AND') return node.children.flatMap(conjunctionTerms);
	return [node];
}

function groupConjunctionBySystem(node) {
	const grouped = new Map();
	const mixed = [];
	for (const child of conjunctionTerms(node)) {
		const childSystem = singleLeafSystem(child);
		if (!childSystem) mixed.push(child);
		else {
			if (!grouped.has(childSystem)) grouped.set(childSystem, []);
			grouped.get(childSystem).push(child);
		}
	}
	return [
		...mixed,
		...[...grouped.values()].map((children) =>
			children.length === 1 ? children[0] : { operand: 'AND', children }
		)
	];
}

const flattenIDs = (values) => (values ?? []).flat(Infinity).filter((value) => value != null);

function projectedConjunction(node) {
	if (node?.operand !== 'AND' || canonicalNegatedGroup(node)) return null;
	const terms = conjunctionTerms(node);
	const projected = terms.filter(
		(term) =>
			negativeLeaf(term) || canonicalNegatedGroup(term) || ['NOR', 'XOR'].includes(term.operand)
	);
	if (projected.length === 0) return null;
	const local = terms.filter((term) => !projected.includes(term));
	return [...projected, ...(local.length > 0 ? [{ operand: 'AND', children: local }] : [])];
}

async function distinctIDs(db, collection, query = {}, options = {}) {
	return distinctValues(db, collection, 'tumorID', query, options);
}

async function distinctValues(db, collection, field, query = {}, options = {}) {
	options.distinctResults ??= new Map();
	const key = JSON.stringify([collection, field, query]);
	if (!options.distinctResults.has(key)) {
		options.distinctResults.set(
			key,
			Promise.resolve(db.collection(collection).distinct(field, query)).then((values) => [
				...new Set(flattenIDs(values))
			])
		);
	}
	return options.distinctResults.get(key);
}

async function linkedSourceTumorIDs(db, system, query = {}, options = {}) {
	let patIDs;
	if (system === 'patient') {
		patIDs = await distinctValues(db, 'patient', 'patID', query, options);
		const direct = await distinctIDs(db, 'patient', query, options);
		const linked = await distinctIDs(db, 'diagnosis', { patID: { $in: patIDs } }, options);
		return new Set([...direct, ...linked]);
	}
	if (system === 'study') {
		const studyKeys = await distinctValues(db, 'study', 'studyKey', query, options);
		patIDs = await distinctValues(
			db,
			'studyPatient',
			'patID',
			{
				studyKey: { $in: studyKeys }
			},
			options
		);
	} else {
		patIDs = await distinctValues(db, 'studyPatient', 'patID', query, options);
	}
	return new Set(
		await distinctValues(
			db,
			'diagnosis',
			'tumorID',
			{
				patID: { $in: patIDs }
			},
			options
		)
	);
}

// A missing field on a known patient/tumor may match an empty/negative filter.
// An event with no corresponding identity must not acquire cohort membership that way.
async function sourceUniverse(db, system, universe, options) {
	if (!['patient', 'diagnosis'].includes(system)) return universe;
	options.sourceScopes ??= new Map();
	const scopeKey = `${system}:${requestIdentity(options, universe)}`;
	if (options.sourceScopes.has(scopeKey)) return options.sourceScopes.get(scopeKey);
	options.identityUniverses ??= new Map();
	if (!options.identityUniverses.has(system)) {
		const known =
			system === 'patient'
				? await linkedSourceTumorIDs(db, system, {}, options)
				: new Set(await distinctIDs(db, 'diagnosis', {}, options));
		options.identityUniverses.set(system, known);
	}
	const known = options.identityUniverses.get(system);
	const scoped = new Set([...universe].filter((id) => known.has(id)));
	options.sourceScopes.set(scopeKey, scoped);
	options.sourceScopes.set(`${system}:${requestIdentity(options, scoped)}`, scoped);
	return scoped;
}

async function matchingLinkedCanonicalNegation(db, system, node, universe, options) {
	const type = node.children[0].type;
	const positiveType = type === 'NEQUALS' ? 'EQUALS' : 'BETWEEN';
	const positiveChildren = node.children.map((child) => ({ ...child, type: positiveType }));
	const emptyChildren = positiveChildren.filter(
		(child) => child.value === '-' || child.value === null
	);
	const forbiddenChildren = positiveChildren.filter(
		(child) => child.value !== '-' && child.value !== null
	);

	if (type === 'NEQUALS' && emptyChildren.length > 0) {
		const presentQuery = combineLogicalClauses(
			'AND',
			emptyChildren.map((child) => leafQuery({ ...child, type: 'NEQUALS' }, options))
		);
		const present = await linkedSourceTumorIDs(db, system, presentQuery, options);
		const forbidden = forbiddenChildren.length
			? await linkedSourceTumorIDs(
					db,
					system,
					combineLogicalClauses(
						'OR',
						forbiddenChildren.map((child) => positiveLeafQuery(child, options))
					),
					options
			  )
			: new Set();
		return new Set([...present].filter((id) => universe.has(id) && !forbidden.has(id)));
	}

	const forbidden = forbiddenChildren.length
		? await linkedSourceTumorIDs(
				db,
				system,
				combineLogicalClauses(
					'OR',
					forbiddenChildren.map((child) => positiveLeafQuery(child, options))
				),
				options
		  )
		: new Set();
	return new Set([...universe].filter((id) => !forbidden.has(id)));
}

async function matchingLinkedTumorIDs(db, system, node, universe, options) {
	return memoizedTranslation(options, 'linked', node, universe, system, () =>
		matchingLinkedTumorIDsUncached(db, system, node, universe, options)
	);
}

async function matchingLinkedTumorIDsUncached(db, system, node, universe, options) {
	if (negativeLeaf(node) || canonicalNegatedGroup(node)) {
		const group = negativeLeaf(node) ? { operand: 'OR', children: [node] } : node;
		return matchingLinkedCanonicalNegation(db, system, group, universe, options);
	}
	const projected = projectedConjunction(node);
	if (projected) {
		const sets = [];
		for (const child of projected)
			sets.push(await matchingLinkedTumorIDs(db, system, child, universe, options));
		return setOperation('AND', sets, universe);
	}
	if (Array.isArray(node?.children) && node.children.length === 1 && node.operand !== 'NOR') {
		return matchingLinkedTumorIDs(db, system, node.children[0], universe, options);
	}
	if (Array.isArray(node?.children) && node.operand !== 'AND') {
		const childSets = [];
		for (const child of node.children) {
			childSets.push(await matchingLinkedTumorIDs(db, system, child, universe, options));
		}
		return setOperation(node.operand, childSets, universe);
	}

	const matching = await linkedSourceTumorIDs(
		db,
		system,
		localQuery(node, system, options),
		options
	);
	if (missingNodeResult(node)) {
		const present = await linkedSourceTumorIDs(db, system, {}, options);
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
		(leaf.type === 'EQUALS' && (leaf.value === '-' || leaf.value === null)) ||
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
	const type = node.children[0].type;
	const positiveType = type === 'NEQUALS' ? 'EQUALS' : 'BETWEEN';
	const positiveChildren = node.children.map((child) => ({ ...child, type: positiveType }));
	const emptyChildren = positiveChildren.filter(
		(child) => child.value === '-' || child.value === null
	);
	const forbiddenChildren = positiveChildren.filter(
		(child) => child.value !== '-' && child.value !== null
	);

	if (type === 'NEQUALS' && emptyChildren.length > 0) {
		const presentQuery = combineLogicalClauses(
			'AND',
			emptyChildren.map((child) => leafQuery({ ...child, type: 'NEQUALS' }, options))
		);
		const present = new Set(await distinctIDs(db, system, presentQuery, options));
		const forbidden = forbiddenChildren.length
			? new Set(
					await distinctIDs(
						db,
						system,
						combineLogicalClauses(
							'OR',
							forbiddenChildren.map((child) => positiveLeafQuery(child, options))
						),
						options
					)
			  )
			: new Set();
		return new Set([...present].filter((id) => universe.has(id) && !forbidden.has(id)));
	}

	const forbidden = forbiddenChildren.length
		? new Set(
				await distinctIDs(
					db,
					system,
					combineLogicalClauses(
						'OR',
						forbiddenChildren.map((child) => positiveLeafQuery(child, options))
					),
					options
				)
		  )
		: new Set();
	return new Set([...universe].filter((id) => !forbidden.has(id)));
}

// Project a same-system subtree onto the target collection's tumor universe. Set operations are
// intentional here: they preserve complements for tumors that have no source-system document.
async function matchingTumorIDs(db, system, node, universe, options = {}) {
	return memoizedTranslation(options, 'source', node, universe, system, () =>
		matchingTumorIDsUncached(db, system, node, universe, options)
	);
}

async function matchingTumorIDsUncached(db, system, node, universe, options) {
	universe = await sourceUniverse(db, system, universe, options);
	if (['study', 'studyPatient', 'patient'].includes(system)) {
		return matchingLinkedTumorIDs(db, system, node, universe, options);
	}
	if (negativeLeaf(node) || canonicalNegatedGroup(node)) {
		const group = negativeLeaf(node) ? { operand: 'OR', children: [node] } : node;
		return matchingCanonicalNegation(db, system, group, universe, options);
	}
	const projected = projectedConjunction(node);
	if (projected) {
		const sets = [];
		for (const child of projected)
			sets.push(await matchingTumorIDs(db, system, child, universe, options));
		return setOperation('AND', sets, universe);
	}
	if (Array.isArray(node?.children) && node.children.length === 1 && node.operand !== 'NOR') {
		return matchingTumorIDs(db, system, node.children[0], universe, options);
	}
	if (Array.isArray(node?.children) && node.operand !== 'AND') {
		const childSets = [];
		for (const child of node.children) {
			childSets.push(await matchingTumorIDs(db, system, child, universe, options));
		}
		return setOperation(node.operand, childSets, universe);
	}

	const matching = new Set(
		await distinctIDs(db, system, localQuery(node, system, options), options)
	);
	if (missingNodeResult(node)) {
		const present = new Set(await distinctIDs(db, system, {}, options));
		for (const id of universe) if (!present.has(id)) matching.add(id);
	}
	return new Set([...matching].filter((id) => universe.has(id)));
}

async function matchingMixedTumorIDs(db, node, universe, options = {}, negated = false) {
	return memoizedTranslation(options, 'mixed', node, universe, negated, () =>
		matchingMixedTumorIDsUncached(db, node, universe, options, negated)
	);
}

async function matchingMixedTumorIDsUncached(db, node, universe, options, negated) {
	const system = singleLeafSystem(node);
	if (system) {
		const matches = await matchingTumorIDs(db, system, node, universe, options);
		if (!negated) return matches;
		const known = await sourceUniverse(db, system, universe, options);
		return new Set([...known].filter((id) => !matches.has(id)));
	}
	if (!Array.isArray(node?.children)) return new Set();

	const children = node.operand === 'AND' ? groupConjunctionBySystem(node) : node.children;
	const childNegated = node.operand === 'NOR' ? !negated : negated;
	const operand =
		node.operand === 'NOR'
			? negated
				? 'OR'
				: 'AND'
			: negated && node.operand === 'AND'
			? 'OR'
			: negated && node.operand === 'OR'
			? 'AND'
			: node.operand;
	const childSets = [];
	for (const child of children) {
		childSets.push(
			await matchingMixedTumorIDs(
				db,
				child,
				universe,
				options,
				node.operand === 'XOR' ? false : childNegated
			)
		);
	}
	if (node.operand !== 'XOR') return setOperation(operand, childSets, universe);
	const negativeSets = [];
	for (const child of children)
		negativeSets.push(await matchingMixedTumorIDs(db, child, universe, options, true));
	return new Set(
		[...universe].filter((id) => {
			const known = childSets.every((set, index) => set.has(id) || negativeSets[index].has(id));
			const exactlyOne = childSets.filter((set) => set.has(id)).length === 1;
			return known && (negated ? !exactlyOne : exactlyOne);
		})
	);
}

// Keep local clauses document-scoped and reduce foreign clauses to matching tumor IDs.
async function targetQuery(db, node, targetSystem, universe, options = {}, negated = false) {
	return memoizedTranslation(options, 'target', node, universe, `${targetSystem}:${negated}`, () =>
		targetQueryUncached(db, node, targetSystem, universe, options, negated)
	);
}

async function targetQueryUncached(db, node, targetSystem, universe, options, negated) {
	const system = singleLeafSystem(node);
	if (system === targetSystem) {
		const local = localQuery(node, targetSystem, options);
		return negated ? combineLogicalClauses('NOR', [local]) : local;
	}
	if (system) {
		const ids = await matchingMixedTumorIDs(db, node, universe, options, negated);
		return { tumorID: { $in: [...ids] } };
	}
	if (!Array.isArray(node?.children)) return { $expr: { $eq: [1, 0] } };

	const children = node.operand === 'AND' ? groupConjunctionBySystem(node) : node.children;
	const childNegated = node.operand === 'NOR' ? !negated : negated;
	const operand =
		node.operand === 'NOR'
			? negated
				? 'OR'
				: 'AND'
			: negated && node.operand === 'AND'
			? 'OR'
			: negated && node.operand === 'OR'
			? 'AND'
			: node.operand;
	const clauses = [];
	for (const child of children) {
		clauses.push(
			await targetQuery(
				db,
				child,
				targetSystem,
				universe,
				options,
				node.operand === 'XOR' ? false : childNegated
			)
		);
	}
	if (node.operand !== 'XOR') return combineLogicalClauses(operand, clauses);
	const negativeClauses = [];
	for (const child of children)
		negativeClauses.push(await targetQuery(db, child, targetSystem, universe, options, true));
	const exactlyOne = combineLogicalClauses(
		'OR',
		clauses.map((clause, index) =>
			combineLogicalClauses('AND', [
				clause,
				...negativeClauses.filter((_other, otherIndex) => otherIndex !== index)
			])
		)
	);
	if (!negated) return exactlyOne;
	return combineLogicalClauses('AND', [
		...clauses.map((clause, index) =>
			combineLogicalClauses('OR', [clause, negativeClauses[index]])
		),
		combineLogicalClauses('NOR', [exactlyOne])
	]);
}

async function patientQuery(db, node, universe, options = {}) {
	const patientClauseForTumors = async (ids) => {
		const tumorIDs = [...ids];
		const patIDs = await distinctValues(
			db,
			'diagnosis',
			'patID',
			{
				tumorID: { $in: tumorIDs }
			},
			options
		);
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

	// Evaluate the full mixed expression against one tumor before projecting back to patients.
	// Intersecting patient-ID sets here would let different tumors satisfy different AND terms.
	const ids = await matchingMixedTumorIDs(db, node, universe, options);
	const linkedPatients = await patientClauseForTumors(ids);
	if (everyLeaf(node, (leaf) => leaf.system !== 'patient')) return linkedPatients;

	const withoutTumor = await targetQuery(db, node, 'patient', new Set(), options);
	const diagnosisPatientIDs = await distinctValues(db, 'diagnosis', 'patID', {}, options);
	return combineLogicalClauses('OR', [
		linkedPatients,
		combineLogicalClauses('AND', [
			{ tumorID: { $nin: [...universe] } },
			{ patID: { $nin: diagnosisPatientIDs } },
			withoutTumor
		])
	]);
}

const literal = (value) => ({ $literal: value });

function booleanCondition(operand, conditions) {
	if (conditions.length === 1 && operand !== 'NOR') return conditions[0];
	if (operand === 'AND') return conditions.length ? { $and: conditions } : true;
	if (operand === 'OR') return conditions.length ? { $or: conditions } : false;
	if (operand === 'NOR') return { $not: [booleanCondition('OR', conditions)] };
	if (operand === 'XOR')
		return {
			$eq: [
				{
					$add: conditions.length
						? conditions.map((condition) => ({ $cond: [condition, 1, 0] }))
						: [0]
				},
				1
			]
		};
	throw new Error(`Unknown logical operator: ${operand}`);
}

// The projection compiler accepts only predicates produced by localQuery/targetQuery.
// It preserves Mongo query equality (including null/missing and array membership),
// range type bracketing and same-element $elemMatch rather than inventing a second AST policy.
function queryCondition(query, system, options, root = '$', counter = { value: 0 }) {
	const any = (ref, condition) => {
		const name = `entry${counter.value++}`;
		return {
			$anyElementTrue: [
				{
					$map: {
						input: { $cond: [{ $isArray: ref }, ref, []] },
						as: name,
						in: condition(`$$${name}`)
					}
				}
			]
		};
	};
	const compare = (ref, operator, value) => {
		const equal = (item) => ({
			$eq: [value === null ? { $ifNull: [item, null] } : item, literal(value)]
		});
		if (operator === '$eq') return booleanCondition('OR', [equal(ref), any(ref, equal)]);
		if (operator === '$in') {
			if (!value.length) return false;
			const name = `choices${counter.value++}`;
			const acceptsMissing = value.includes(null);
			const member = (item) => ({
				$in: [acceptsMissing ? { $ifNull: [item, null] } : item, `$$${name}`]
			});
			// Foreign cohort gates can contain tens of thousands of IDs. Store that
			// list once; expanding one expression per ID can exceed Mongo's BSON limit.
			return {
				$let: {
					vars: { [name]: literal(value) },
					in: booleanCondition('OR', [member(ref), any(ref, member)])
				}
			};
		}
		if (operator === '$nin') return { $not: [compare(ref, '$in', value)] };
		if (operator === '$exists') return { [value ? '$ne' : '$eq']: [{ $type: ref }, 'missing'] };
		if (operator === '$size')
			return { $cond: [{ $isArray: ref }, { $eq: [{ $size: ref }, value] }, false] };
		if (operator === '$elemMatch')
			return any(ref, (item) => queryCondition(value, system, options, item, counter));
		if (['$gt', '$gte', '$lt', '$lte'].includes(operator)) {
			const type = value instanceof Date ? 'date' : typeof value;
			const scalar = (item) =>
				booleanCondition('AND', [
					type === 'number'
						? { $isNumber: item }
						: { $eq: [{ $type: item }, type === 'boolean' ? 'bool' : type] },
					{ [operator]: [item, literal(value)] }
				]);
			return booleanCondition('OR', [scalar(ref), any(ref, scalar)]);
		}
		throw new Error(`Unsupported projection operator: ${operator}`);
	};
	const field = (ref, condition) =>
		booleanCondition(
			'AND',
			Object.entries(condition).map(([operator, value]) => compare(ref, operator, value))
		);
	return booleanCondition(
		'AND',
		Object.entries(query).map(([key, condition]) => {
			if (['$and', '$or', '$nor'].includes(key))
				return booleanCondition(
					key.slice(1).toUpperCase(),
					condition.map((child) => queryCondition(child, system, options, root, counter))
				);
			if (key === '$expr') return condition;
			if (key.startsWith('$')) return compare(root, key, condition);
			const ref = root === '$' ? `$${key}` : `${root}.${key}`;
			const path = root === '$' ? objectArrayPath(system, key, options.unwoundArrays) : null;
			if (!path) return field(ref, condition);
			const arrayRef = `$${path.prefix}`;
			// A dotted field is missing when no array entry has that field. Mongo treats
			// an empty array differently from an existing entry with a missing subfield:
			// dotted equality with null matches [{}], null and absence, but not [].
			if ('$exists' in condition) {
				const exists = any(arrayRef, (item) =>
					compare(`${item}.${path.relativePath}`, '$exists', true)
				);
				return {
					$cond: [
						{ $isArray: arrayRef },
						condition.$exists ? exists : { $not: [exists] },
						compare(ref, '$exists', condition.$exists)
					]
				};
			}
			return {
				$cond: [
					{ $isArray: arrayRef },
					{
						$cond: [
							{ $eq: [{ $size: arrayRef }, 0] },
							Object.keys(condition).every((operator) => operator === '$nin'),
							any(arrayRef, (item) => field(`${item}.${path.relativePath}`, condition))
						]
					},
					field(ref, condition)
				]
			};
		})
	);
}

// Match documents first, then retain the array entries that satisfy the complete
// Boolean filter. Other branches are evaluated on the unchanged source document;
// evaluating every leaf sequentially would silently turn OR/NOR/XOR into AND.
async function arrayFilterStages(db, node, targetSystem, universe, options) {
	const prefixes = new Set();
	const paths = new WeakMap();
	const collect = (item) => {
		if (Array.isArray(item?.children)) item.children.forEach(collect);
		else if (item.system === targetSystem) {
			const path = objectArrayPath(targetSystem, cleanKey(item.key), options.unwoundArrays);
			if (path) {
				paths.set(item, path);
				prefixes.add(path.prefix);
			}
		}
	};
	collect(node);
	if (!prefixes.size) return [];
	const rowConditions = new WeakMap();
	const rowCondition = async (item) => {
		if (!rowConditions.has(item))
			rowConditions.set(
				item,
				(async () => {
					const query = await targetQuery(db, item, targetSystem, universe, options);
					return queryCondition(query, targetSystem, options);
				})()
			);
		return rowConditions.get(item);
	};
	const contains = (item, prefix) =>
		Array.isArray(item?.children)
			? item.children.some((child) => contains(child, prefix))
			: paths.get(item)?.prefix === prefix;
	const condition = async (item, prefix) => {
		if (!contains(item, prefix)) return rowCondition(item);
		if (!Array.isArray(item?.children)) {
			const relative = { ...item, key: paths.get(item).relativePath };
			return queryCondition(leafQuery(relative, options), targetSystem, options, '$$it');
		}
		return booleanCondition(
			canonicalNegatedGroup(item) ? 'AND' : item.operand,
			await Promise.all(item.children.map((child) => condition(child, prefix)))
		);
	};
	const fields = {};
	for (const prefix of prefixes)
		fields[prefix] = {
			$cond: [
				{ $isArray: `$${prefix}` },
				{ $filter: { input: `$${prefix}`, as: 'it', cond: await condition(node, prefix) } },
				`$${prefix}`
			]
		};
	// One stage is essential: trimming one array must not affect the row predicates
	// used while projecting a different array in the same document.
	return [{ $set: fields }];
}

async function filter2match({ value, column, db, unwoundArrays = [] }) {
	if (value === NULL_AST) return [];
	const parsed = parseAstFilter(value);
	if (!parsed) throw new Error('Invalid filter AST');
	const ast = normalizeFilterLogic(parsed);
	const options = { unwoundArrays: new Set(unwoundArrays) };
	const universe = new Set(await distinctIDs(db, column, {}, options));
	if (column === 'patient') {
		for (const id of await distinctIDs(db, 'diagnosis', {}, options)) universe.add(id);
	}
	const match =
		column === 'patient'
			? await patientQuery(db, ast, universe, options)
			: await targetQuery(db, ast, column, universe, options);
	return [{ $match: match }, ...(await arrayFilterStages(db, ast, column, universe, options))];
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
