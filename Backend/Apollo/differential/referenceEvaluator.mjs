const MISSING = Symbol('missing');

export const NULL_VALUES = ['-', '', ' ', null];

const NULL_VALUE_SET = new Set(NULL_VALUES);

const isNullishValue = (value) => value === MISSING || NULL_VALUE_SET.has(value);

const normalizeIdList = (value) => {
	if (Array.isArray(value)) return value.flat(Infinity).filter((item) => item != null);
	return value == null ? [] : [value];
};

const comparable = (value) => (value instanceof Date ? value.getTime() : value);

const equalValue = (left, right) => {
	if (left instanceof Date || right instanceof Date) {
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
	date.setUTCHours(0, 0, 0, 0);
	if (Number(timestamp) % 86400000 !== 0) date.setUTCDate(date.getUTCDate() + 1);
	return date;
}

export function normalizeAstKeys(value) {
	const ast = structuredClone(value);
	const visit = (node) => {
		if (!node || typeof node !== 'object') return;
		if (typeof node.key === 'string') {
			const negated = node.key.startsWith('!');
			const rawKey = negated ? node.key.slice(1) : node.key;
			const normalized = rawKey.startsWith('ICDO_')
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
				if (value.length === 0) return [MISSING];
				return value.flatMap((item) => (Array.isArray(item) ? visit(item, index) : [item]));
			}
			return [value];
		}

		if (Array.isArray(value)) {
			if (value.length === 0) return [MISSING];
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
	return values.some((value) => value !== MISSING && equalValue(value, requested));
}

function matchesBetween(values, rawRange, key) {
	let { min = null, max = null } = rawRange ?? {};
	const bothNullish = (min == null || min === '') && (max == null || max === '');
	if (bothNullish) return values.some(isNullishValue);

	if (String(key).toLowerCase().includes('date')) {
		min = roundToNextUTCMidnight(min);
		max = roundToNextUTCMidnight(max);
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
			return matchesBetween(values, value, key);
		case 'NBETWEEN':
			return !matchesBetween(values, value, key);
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

function directArrayPrefix(node) {
	if (Array.isArray(node?.children)) {
		const prefixes = node.children.map(directArrayPrefix);
		return prefixes.every((prefix) => prefix && prefix === prefixes[0]) ? prefixes[0] : null;
	}
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
	if (!Array.isArray(array) || !array.some((item) => item && typeof item === 'object')) return null;
	const relative = relativeNode(node, prefixes[0]);
	return array.some((item) => evaluateDocumentNode(item, relative));
}

export function evaluateDocumentNode(document, node) {
	if (!Array.isArray(node?.children)) return evaluateLeaf(document, node);
	const sameArrayEntry = evaluateSameArrayEntry(document, node);
	if (sameArrayEntry != null) return sameArrayEntry;
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
	const key = String(node.key ?? node.children[0]?.key ?? '');
	if (
		!key.startsWith('!') &&
		!node.children.every((child) => String(child.key ?? '').startsWith('!'))
	) {
		return false;
	}
	const types = new Set(node.children.map((child) => child.type));
	return types.size === 1 && (types.has('NEQUALS') || types.has('NBETWEEN'));
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

	matchingTumors(node) {
		const cacheKey = `mixed:${JSON.stringify(node)}`;
		if (this.tumorMatchCache.has(cacheKey)) return this.tumorMatchCache.get(cacheKey);
		const system = singleLeafSystem(node);
		if (system) {
			const result = this.matchingTumorsForSystem(system, node);
			this.tumorMatchCache.set(cacheKey, result);
			return result;
		}
		if (!Array.isArray(node?.children)) {
			const result = new Set();
			this.tumorMatchCache.set(cacheKey, result);
			return result;
		}
		let childSets;
		if (node.operand === 'AND') {
			const grouped = new Map();
			const ungrouped = [];
			for (const child of node.children) {
				const childSystem = singleLeafSystem(child);
				if (!childSystem) {
					ungrouped.push(child);
					continue;
				}
				if (!grouped.has(childSystem)) grouped.set(childSystem, []);
				grouped.get(childSystem).push(child);
			}
			childSets = ungrouped.map((child) => this.matchingTumors(child));
			for (const [childSystem, children] of grouped.entries()) {
				childSets.push(
					children.length === 1
						? this.matchingTumors(children[0])
						: this.matchingTumorsForSystem(childSystem, { operand: 'AND', children })
				);
			}
		} else {
			childSets = node.children.map((child) => this.matchingTumors(child));
		}
		const result = setOperation(node.operand, childSets, this.tumorUniverse);
		this.tumorMatchCache.set(cacheKey, result);
		return result;
	}

	matchingTumorsForSystem(system, node) {
		const cacheKey = `${system}:${JSON.stringify(node)}`;
		if (this.tumorMatchCache.has(cacheKey)) return this.tumorMatchCache.get(cacheKey);
		if (
			Array.isArray(node?.children) &&
			node.children.length === 1 &&
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
			for (const tumorID of this.tumorUniverse) {
				const tumorDocuments = index.get(tumorID) ?? [];
				if (type === 'NEQUALS' && node.children.some((child) => child.value === '-')) {
					const nonMissingLeaves = node.children.filter((child) => child.value === '-');
					const excludedLeaves = node.children.filter((child) => child.value !== '-');
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
			const combined = setOperation(node.operand, childSets, this.tumorUniverse);
			this.tumorMatchCache.set(cacheKey, combined);
			return combined;
		}

		for (const document of documents) {
			if (!evaluateDocumentNode(document, node)) continue;
			for (const tumorID of this.linkedDocumentTumorIDs(system, document)) result.add(tumorID);
		}

		if (evaluateDocumentNode({}, node)) {
			for (const tumorID of this.tumorUniverse) {
				if (!index.has(tumorID)) result.add(tumorID);
			}
		}

		this.tumorMatchCache.set(cacheKey, result);
		return result;
	}

	evaluateTargetDocument(document, targetSystem, node) {
		const system = singleLeafSystem(node);
		if (system === targetSystem) return evaluateDocumentNode(document, node);
		if (system) {
			const matching = this.matchingTumorsForSystem(system, node);
			return this.documentTumorIDs(document).some((tumorID) => matching.has(tumorID));
		}
		if (!Array.isArray(node?.children)) return false;
		return logicalResult(
			node.operand,
			node.children.map((child) => this.evaluateTargetDocument(document, targetSystem, child))
		);
	}

	evaluatePatient(patient, node) {
		const system = singleLeafSystem(node);
		if (system === 'patient') return evaluateDocumentNode(patient, node);
		if (system) {
			const matching = this.matchingTumorsForSystem(system, node);
			return this.documentTumorIDs(patient).some((tumorID) => matching.has(tumorID));
		}

		const leaves = [];
		const collectLeaves = (item) => {
			if (!Array.isArray(item?.children)) leaves.push(item);
			else item.children.forEach(collectLeaves);
		};
		collectLeaves(node);
		if (leaves.length > 0 && leaves.every((leaf) => leaf.system !== 'patient')) {
			const matching = this.matchingTumors(node);
			return this.documentTumorIDs(patient).some((tumorID) => matching.has(tumorID));
		}

		return logicalResult(
			node.operand,
			node.children.map((child) => this.evaluatePatient(patient, child))
		);
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
