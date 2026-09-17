const MISSING = Symbol('missing');
const EMPTY_ARRAY = Symbol('empty-array');

export const NULL_VALUES = ['-', '', ' ', null];

const NULL_VALUE_SET = new Set(NULL_VALUES);

const isNullishValue = (value) =>
	value === MISSING || value === EMPTY_ARRAY || NULL_VALUE_SET.has(value);

const normalizeIdList = (value) => {
	if (Array.isArray(value)) return value.flat(Infinity).filter((item) => item != null);
	return value == null ? [] : [value];
};

const comparable = (value) => (value instanceof Date ? value.getTime() : value);

const equalValue = (left, right) => {
	if (left instanceof Date || right instanceof Date) {
		if (left == null || right == null || typeof left === 'symbol' || typeof right === 'symbol')
			return false;
		const leftTime = new Date(left).getTime();
		const rightTime = new Date(right).getTime();
		return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
	}
	return left === right;
};

export function roundToNextUTCMidnight(timestamp) {
	if (timestamp == null || timestamp === '') return timestamp;
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return timestamp;
	return new Date(Math.ceil(date.getTime() / 86400000) * 86400000);
}

export function normalizeAstKeys(value) {
	const ast = structuredClone(value);
	const visit = (node) => {
		if (!node || typeof node !== 'object') return;
		if (typeof node.key === 'string') {
			const negated = node.key.startsWith('!');
			const rawKey = negated ? node.key.slice(1) : node.key;
			const normalized =
				rawKey.startsWith('ICDO_') || rawKey.startsWith('grading_')
					? rawKey
					: rawKey.replaceAll(/_(?!3)(?!id)/g, '.');
			if (
				node.system === 'study' &&
				(normalized.startsWith('studyPatients.') || normalized === 'recruitmentDate')
			) {
				node.system = 'studyPatient';
				const participationKey = normalized.startsWith('studyPatients.')
					? normalized.slice('studyPatients.'.length)
					: normalized;
				node.key = `${negated ? '!' : ''}${participationKey}`;
			} else {
				node.key = `${negated ? '!' : ''}${normalized}`;
			}
		}
		if (Array.isArray(node.children)) node.children.forEach(visit);
	};
	visit(ast);
	return ast;
}

export function valuesAtPath(document, rawPath) {
	const path = String(rawPath ?? '').replace(/^!/, '');
	const parts = path.split('.').filter(Boolean);

	const visit = (value, index) => {
		if (index === parts.length) {
			if (Array.isArray(value)) {
				if (value.length === 0) return [EMPTY_ARRAY];
				return value.flatMap((item) => (Array.isArray(item) ? visit(item, index) : [item]));
			}
			return [value];
		}

		if (Array.isArray(value)) {
			if (value.length === 0) return [EMPTY_ARRAY];
			return value.flatMap((item) => visit(item, index));
		}

		if (value == null || typeof value !== 'object') return [MISSING];
		const part = parts[index];
		if (!Object.prototype.hasOwnProperty.call(value, part)) return [MISSING];
		return visit(value[part], index + 1);
	};

	return visit(document, 0);
}

function matchesEquals(values, requested) {
	if (requested === '-') return values.some(isNullishValue);
	if (requested === null) return values.some((value) => value === MISSING || value === null);
	return values.some((value) => value !== MISSING && equalValue(value, requested));
}

function matchesBetween(values, rawRange, key, system) {
	let { min = null, max = null } = rawRange ?? {};
	const bothNullish = (min == null || min === '') && (max == null || max === '');
	if (bothNullish) return values.some(isNullishValue);

	if (String(key).toLowerCase().includes('date')) {
		min = roundToNextUTCMidnight(min);
		max = roundToNextUTCMidnight(max);
	} else if (system === 'study' && ['start', 'firstPatInPlanned'].includes(key)) {
		if (min != null && min !== '') min = new Date(min);
		if (max != null && max !== '') max = new Date(max);
	}

	const comparableMin = min == null || min === '' ? null : comparable(min);
	const comparableMax = max == null || max === '' ? null : comparable(max);

	return values.some((value) => {
		if (value === MISSING || isNullishValue(value)) return false;
		const candidate = comparable(value);
		const numericRange = typeof comparableMin === 'number' || typeof comparableMax === 'number';
		if (numericRange && typeof candidate !== 'number') return false;
		if (comparableMin != null && candidate < comparableMin) return false;
		if (comparableMax != null && candidate > comparableMax) return false;
		return true;
	});
}

export function evaluateLeaf(document, leaf) {
	const key = String(leaf.key ?? '').replace(/^!/, '');
	const values = valuesAtPath(document, key);
	const value = leaf.value === 'true' ? true : leaf.value === 'false' ? false : leaf.value;

	switch (leaf.type) {
		case 'EQUALS':
			return matchesEquals(values, value);
		case 'NEQUALS':
			return !matchesEquals(values, value);
		case 'BETWEEN':
			return matchesBetween(values, value, key, leaf.system);
		case 'NBETWEEN':
			return !matchesBetween(values, value, key, leaf.system);
		default:
			throw new Error(`Unsupported comparison type: ${leaf.type}`);
	}
}

function logicalResult(operand, results) {
	switch (operand) {
		case 'AND':
			return results.every(Boolean);
		case 'OR':
			return results.some(Boolean);
		case 'NOR':
			return results.every((result) => !result);
		case 'XOR':
			return results.filter(Boolean).length === 1;
		default:
			throw new Error(`Unsupported logical operand: ${operand}`);
	}
}

// null means that the referenced identity is absent, rather than a known false value.
function knownLogicalResult(operand, results) {
	if (operand === 'AND')
		return results.includes(false) ? false : results.includes(null) ? null : true;
	if (operand === 'OR')
		return results.includes(true) ? true : results.includes(null) ? null : false;
	if (operand === 'NOR') {
		const positive = knownLogicalResult('OR', results);
		return positive == null ? null : !positive;
	}
	if (operand === 'XOR')
		return results.includes(null) ? null : results.filter(Boolean).length === 1;
	throw new Error(`Unsupported logical operand: ${operand}`);
}

function directArrayPrefix(node) {
	node = transparentLogicalNode(node);
	if (Array.isArray(node?.children)) {
		if (['NOR', 'XOR'].includes(node.operand)) return null;
		const prefixes = node.children.map(directArrayPrefix);
		return prefixes.every((prefix) => prefix && prefix === prefixes[0]) ? prefixes[0] : null;
	}
	if (!['EQUALS', 'BETWEEN'].includes(node?.type)) return null;
	const key = String(node?.key ?? '').replace(/^!/, '');
	const dot = key.indexOf('.');
	return dot > 0 ? key.slice(0, dot) : null;
}

function relativeNode(node, prefix) {
	if (!Array.isArray(node?.children)) {
		const cleanKey = String(node.key ?? '').replace(/^!/, '');
		const negated = String(node.key ?? '').startsWith('!');
		return { ...node, key: `${negated ? '!' : ''}${cleanKey.slice(prefix.length + 1)}` };
	}
	return { ...node, children: node.children.map((child) => relativeNode(child, prefix)) };
}

function evaluateSameArrayEntry(document, node) {
	if (node?.operand !== 'AND' || !Array.isArray(node.children) || node.children.length < 2) {
		return null;
	}
	const prefixes = node.children.map(directArrayPrefix);
	if (!prefixes[0] || !prefixes.every((prefix) => prefix === prefixes[0])) return null;
	const array = document?.[prefixes[0]];
	if (!Array.isArray(array)) return null;
	const relative = relativeNode(node, prefixes[0]);
	return array.some(
		(item) => item && typeof item === 'object' && evaluateDocumentNode(item, relative)
	);
}

export function evaluateDocumentNode(document, node) {
	node = transparentLogicalNode(node);
	if (!Array.isArray(node?.children)) return evaluateLeaf(document, node);
	if (canonicalNegatedGroup(node))
		return node.children.every((child) => evaluateLeaf(document, child));
	const sameArrayEntry = evaluateSameArrayEntry(document, node);
	if (sameArrayEntry != null) return sameArrayEntry;
	if (node.operand === 'AND') {
		const arrayTerms = new Map();
		const remaining = [];
		for (const child of conjunctionTerms(node)) {
			const prefix = directArrayPrefix(child);
			if (!prefix || !Array.isArray(document?.[prefix])) remaining.push(child);
			else {
				if (!arrayTerms.has(prefix)) arrayTerms.set(prefix, []);
				arrayTerms.get(prefix).push(child);
			}
		}
		if ([...arrayTerms.values()].some((terms) => terms.length > 1)) {
			return (
				remaining.every((child) => evaluateDocumentNode(document, child)) &&
				[...arrayTerms.values()].every((children) =>
					evaluateDocumentNode(
						document,
						children.length === 1 ? children[0] : { operand: 'AND', children }
					)
				)
			);
		}
	}
	return logicalResult(
		node.operand,
		node.children.map((child) => evaluateDocumentNode(document, child))
	);
}

function singleLeafSystem(node) {
	if (!Array.isArray(node?.children)) return node?.system ?? null;
	let found = null;
	for (const child of node.children) {
		const childSystem = singleLeafSystem(child);
		if (!childSystem) return null;
		if (found == null) found = childSystem;
		if (found !== childSystem) return null;
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
	const keys = new Set(node.children.map((child) => String(child.key ?? '').replace(/^!/, '')));
	const types = new Set(node.children.map((child) => child.type));
	return keys.size === 1 && types.size === 1 && (types.has('NEQUALS') || types.has('NBETWEEN'));
}

function negativeLeaf(node) {
	return !Array.isArray(node?.children) && ['NEQUALS', 'NBETWEEN'].includes(node?.type);
}

// Unary AND/OR/XOR are identities; two unary NORs cancel, also across identity wrappers.
// Keep an exclusion group after reducing its children, even when its negative leaf was wrapped.
function transparentLogicalNode(node) {
	if (!Array.isArray(node?.children) || canonicalNegatedGroup(node)) return node;
	const children = node.children.map(transparentLogicalNode);
	const reduced = { ...node, children };
	const negativeLeaves = children.map((child) => {
		while (child.children?.length === 1 && ['AND', 'OR', 'XOR'].includes(child.operand))
			child = child.children[0];
		return child;
	});
	const exclusion = { ...node, children: negativeLeaves };
	if (canonicalNegatedGroup(exclusion)) return exclusion;
	if (children.length !== 1) return reduced;
	const child = children[0];
	if (['AND', 'OR', 'XOR'].includes(node.operand)) return child;
	if (node.operand === 'NOR' && child.operand === 'NOR' && child.children.length === 1)
		return child.children[0];
	return reduced;
}

// Parentheses around conjunctions do not permit their predicates to match different events.
function conjunctionTerms(node) {
	node = transparentLogicalNode(node);
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

function groupedConjunction(node) {
	const bySystem = new Map();
	const result = [];
	for (const term of conjunctionTerms(node)) {
		const system = singleLeafSystem(term);
		if (!system) result.push(term);
		else {
			if (!bySystem.has(system)) bySystem.set(system, []);
			bySystem.get(system).push(term);
		}
	}
	for (const terms of bySystem.values())
		result.push(terms.length === 1 ? terms[0] : { operand: 'AND', children: terms });
	return result;
}

// Evaluate a choice inside a conjunction one branch at a time, so a selected event
// must witness every positive condition in that branch. This oracle does not use
// the production normalizer or the generated Mongo predicates.
function conjunctiveChoices(node) {
	if (node?.operand !== 'AND' || canonicalNegatedGroup(node)) return null;
	const terms = conjunctionTerms(node);
	const index = terms.findIndex(
		(term) => !singleLeafSystem(term) && ['OR', 'XOR'].includes(term.operand)
	);
	if (index === -1) return null;
	const choice = terms[index];
	return choice.children.map((selected, selectedIndex) => ({
		operand: 'AND',
		children: [
			...terms.filter((_term, termIndex) => termIndex !== index),
			selected,
			...(choice.operand === 'XOR'
				? choice.children
						.filter((_child, childIndex) => childIndex !== selectedIndex)
						.map((other) => ({ operand: 'NOR', children: [other] }))
				: [])
		]
	}));
}

const setOperation = (operand, childSets, universe) => {
	const contains = (set, value) => set.has(value);
	const result = new Set();
	for (const value of universe) {
		if (
			logicalResult(
				operand,
				childSets.map((set) => contains(set, value))
			)
		)
			result.add(value);
	}
	return result;
};

export class ReferenceModel {
	constructor(collections) {
		this.collections = collections;
		this.docsByTumor = new Map();
		this.patientByPatID = new Map();
		this.studyByKey = new Map();
		this.tumorIDsByPatID = new Map();
		this.tumorUniverse = new Set();
		this.tumorMatchCache = new Map();

		for (const patient of collections.patient ?? []) {
			this.patientByPatID.set(patient.patID, patient);
		}
		for (const diagnosis of collections.diagnosis ?? []) {
			if (!this.tumorIDsByPatID.has(diagnosis.patID)) {
				this.tumorIDsByPatID.set(diagnosis.patID, new Set());
			}
			for (const tumorID of normalizeIdList(diagnosis.tumorID)) {
				this.tumorIDsByPatID.get(diagnosis.patID).add(tumorID);
			}
		}
		for (const study of collections.study ?? []) {
			this.studyByKey.set(study.studyKey ?? String(study._id), study);
		}

		for (const [system, documents] of Object.entries(collections)) {
			const index = new Map();
			for (const document of documents) {
				for (const tumorID of this.linkedDocumentTumorIDs(system, document)) {
					this.tumorUniverse.add(tumorID);
					if (!index.has(tumorID)) index.set(tumorID, []);
					index.get(tumorID).push(document);
				}
			}
			this.docsByTumor.set(system, index);
		}
	}

	linkedDocumentTumorIDs(system, document) {
		if (system === 'patient') {
			return [
				...new Set([
					...normalizeIdList(document.tumorID),
					...(this.tumorIDsByPatID.get(document.patID) ?? [])
				])
			];
		}
		if (system === 'studyPatient') {
			return [...(this.tumorIDsByPatID.get(document.patID) ?? [])];
		}
		if (system === 'study') {
			const key = document.studyKey ?? String(document._id);
			const tumorIDs = new Set();
			for (const participation of this.collections.studyPatient ?? []) {
				if (participation.studyKey !== key) continue;
				for (const tumorID of this.tumorIDsByPatID.get(participation.patID) ?? []) {
					tumorIDs.add(tumorID);
				}
			}
			return [...tumorIDs];
		}
		return normalizeIdList(document?.tumorID);
	}

	documentTumorIDs(document) {
		return normalizeIdList(document?.tumorID);
	}

	sourceUniverse(system) {
		return ['patient', 'diagnosis'].includes(system)
			? new Set(this.docsByTumor.get(system)?.keys() ?? [])
			: this.tumorUniverse;
	}

	matchingTumors(node, negated = false) {
		node = transparentLogicalNode(node);
		const cacheKey = `mixed:${negated}:${JSON.stringify(node)}`;
		if (this.tumorMatchCache.has(cacheKey)) return this.tumorMatchCache.get(cacheKey);
		const choices = conjunctiveChoices(node);
		if (choices) {
			const sets = choices.map((choice) => this.matchingTumors(choice, negated));
			const result = setOperation(negated ? 'AND' : 'OR', sets, this.tumorUniverse);
			this.tumorMatchCache.set(cacheKey, result);
			return result;
		}
		const system = singleLeafSystem(node);
		if (system) {
			const matches = this.matchingTumorsForSystem(system, node);
			const result = negated
				? new Set([...this.sourceUniverse(system)].filter((id) => !matches.has(id)))
				: matches;
			this.tumorMatchCache.set(cacheKey, result);
			return result;
		}
		if (!Array.isArray(node?.children)) {
			const result = new Set();
			this.tumorMatchCache.set(cacheKey, result);
			return result;
		}
		const children = node.operand === 'AND' ? groupedConjunction(node) : node.children;
		const trueSets = children.map((child) => this.matchingTumors(child));
		const falseSets = children.map((child) => this.matchingTumors(child, true));
		const result = new Set(
			[...this.tumorUniverse].filter((id) => {
				const truth = knownLogicalResult(
					node.operand,
					trueSets.map((set, index) =>
						set.has(id) ? true : falseSets[index].has(id) ? false : null
					)
				);
				return truth === !negated;
			})
		);
		this.tumorMatchCache.set(cacheKey, result);
		return result;
	}

	matchingTumorsForSystem(system, node) {
		node = transparentLogicalNode(node);
		if (negativeLeaf(node)) node = { operand: 'OR', children: [node] };
		const cacheKey = `${system}:${JSON.stringify(node)}`;
		if (this.tumorMatchCache.has(cacheKey)) return this.tumorMatchCache.get(cacheKey);
		const universe = this.sourceUniverse(system);
		if (node?.operand === 'AND' && !canonicalNegatedGroup(node)) {
			const terms = conjunctionTerms(node);
			const projected = terms.filter(
				(term) =>
					negativeLeaf(term) || canonicalNegatedGroup(term) || ['NOR', 'XOR'].includes(term.operand)
			);
			if (projected.length > 0) {
				const local = terms.filter((term) => !projected.includes(term));
				const parts = [
					...projected,
					...(local.length ? [{ operand: 'AND', children: local }] : [])
				];
				const result = setOperation(
					'AND',
					parts.map((part) => this.matchingTumorsForSystem(system, part)),
					universe
				);
				this.tumorMatchCache.set(cacheKey, result);
				return result;
			}
		}
		if (
			Array.isArray(node?.children) &&
			node.children.length === 1 &&
			node.operand !== 'NOR' &&
			!canonicalNegatedGroup(node)
		) {
			const result = this.matchingTumorsForSystem(system, node.children[0]);
			this.tumorMatchCache.set(cacheKey, result);
			return result;
		}
		const documents = this.collections[system] ?? [];
		const index = this.docsByTumor.get(system) ?? new Map();
		const result = new Set();

		if (canonicalNegatedGroup(node)) {
			const type = node.children[0].type;
			for (const tumorID of universe) {
				const tumorDocuments = index.get(tumorID) ?? [];
				if (
					type === 'NEQUALS' &&
					node.children.some((child) => child.value === '-' || child.value === null)
				) {
					const nonMissingLeaves = node.children.filter(
						(child) => child.value === '-' || child.value === null
					);
					const excludedLeaves = node.children.filter(
						(child) => child.value !== '-' && child.value !== null
					);
					const hasPresentValue = tumorDocuments.some((document) =>
						nonMissingLeaves.every((leaf) => evaluateLeaf(document, leaf))
					);
					const hasExcludedValue = tumorDocuments.some((document) =>
						excludedLeaves.some((leaf) => !evaluateLeaf(document, leaf))
					);
					if (hasPresentValue && !hasExcludedValue) result.add(tumorID);
					continue;
				}

				const hasForbiddenValue = tumorDocuments.some((document) =>
					node.children.some((leaf) => !evaluateLeaf(document, leaf))
				);
				if (!hasForbiddenValue) result.add(tumorID);
			}
			this.tumorMatchCache.set(cacheKey, result);
			return result;
		}

		if (Array.isArray(node?.children) && node.operand !== 'AND') {
			const childSets = node.children.map((child) => this.matchingTumorsForSystem(system, child));
			const combined = setOperation(node.operand, childSets, universe);
			this.tumorMatchCache.set(cacheKey, combined);
			return combined;
		}

		for (const document of documents) {
			if (!evaluateDocumentNode(document, node)) continue;
			for (const tumorID of this.linkedDocumentTumorIDs(system, document)) result.add(tumorID);
		}

		if (evaluateDocumentNode({}, node)) {
			for (const tumorID of universe) {
				if (!index.has(tumorID)) result.add(tumorID);
			}
		}

		this.tumorMatchCache.set(cacheKey, result);
		return result;
	}

	evaluateTargetDocument(document, targetSystem, node) {
		return this.evaluateTargetTruth(document, targetSystem, node) === true;
	}

	evaluateTargetTruth(document, targetSystem, node) {
		node = transparentLogicalNode(node);
		const choices = conjunctiveChoices(node);
		if (choices)
			return knownLogicalResult(
				'OR',
				choices.map((choice) => this.evaluateTargetTruth(document, targetSystem, choice))
			);
		const system = singleLeafSystem(node);
		if (system === targetSystem) return evaluateDocumentNode(document, node);
		if (system) {
			const matching = this.matchingTumorsForSystem(system, node);
			const ids = this.documentTumorIDs(document);
			if (ids.some((tumorID) => matching.has(tumorID))) return true;
			return ids.some((id) => this.sourceUniverse(system).has(id)) ? false : null;
		}
		if (!Array.isArray(node?.children)) return false;
		return knownLogicalResult(
			node.operand,
			(node.operand === 'AND' ? groupedConjunction(node) : node.children).map((child) =>
				this.evaluateTargetTruth(document, targetSystem, child)
			)
		);
	}

	evaluatePatient(patient, node) {
		const system = singleLeafSystem(node);
		if (system === 'patient') return evaluateDocumentNode(patient, node);
		const tumors = this.linkedDocumentTumorIDs('patient', patient);
		if (tumors.length > 0) {
			const matching = this.matchingTumors(node);
			return tumors.some((tumorID) => matching.has(tumorID));
		}
		// Patients without a diagnosis may still satisfy a local branch of a mixed OR.
		return this.evaluateTargetDocument(patient, 'patient', node);
	}

	studyPatientRows() {
		const rows = [];
		for (const studyPatient of this.collections.studyPatient ?? []) {
			rows.push({
				id: String(studyPatient._id),
				study: this.studyByKey.get(studyPatient.studyKey),
				studyPatient,
				patient: this.patientByPatID.get(studyPatient.patID)
			});
		}
		if (rows.length > 0) return rows;

		// Compatibility fallback for fixtures created before studyPatient was materialized.
		for (const study of this.collections.study ?? []) {
			for (let index = 0; index < (study.studyPatients ?? []).length; index += 1) {
				const studyPatient = study.studyPatients[index];
				rows.push({
					id: `${study._id}:${index}:${studyPatient.patID}`,
					study,
					studyPatient,
					patient: this.patientByPatID.get(studyPatient.patID)
				});
			}
		}
		return rows;
	}

	evaluateStudyPatient(row, node) {
		node = transparentLogicalNode(node);
		const system = singleLeafSystem(node);
		if (system === 'study') return row.study ? evaluateDocumentNode(row.study, node) : false;
		if (system === 'studyPatient') return evaluateDocumentNode(row.studyPatient, node);
		if (system) return row.patient ? this.evaluatePatient(row.patient, node) : false;

		const leaves = [];
		const collectLeaves = (item) => {
			if (!Array.isArray(item?.children)) leaves.push(item);
			else item.children.forEach(collectLeaves);
		};
		collectLeaves(node);

		if (
			leaves.length > 0 &&
			leaves.every((leaf) => !['study', 'studyPatient'].includes(leaf.system))
		) {
			return row.patient ? this.evaluatePatient(row.patient, node) : false;
		}

		if (node.operand === 'AND') {
			const patientScoped = node.children.filter((child) =>
				everyLeaf(child, (leaf) => !['study', 'studyPatient'].includes(leaf.system))
			);
			const participationScoped = node.children.filter((child) => !patientScoped.includes(child));
			const results = participationScoped.map((child) => this.evaluateStudyPatient(row, child));
			if (patientScoped.length > 0) {
				results.push(
					row.patient
						? this.evaluatePatient(row.patient, { operand: 'AND', children: patientScoped })
						: false
				);
			}
			return results.every(Boolean);
		}

		return logicalResult(
			node.operand,
			node.children.map((child) => this.evaluateStudyPatient(row, child))
		);
	}
}

export const internal = { MISSING, canonicalNegatedGroup, singleLeafSystem };
