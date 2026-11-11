const FLAT_UNDERSCORE_PREFIXES = ['ICDO_', 'grading_'];

// Lens stores one equality per selected ID. Keep the editable/saved format at the
// boundary, but evaluate this particular OR as one membership predicate.
function compactPatientIdGroup(node) {
	if (node?.operand !== 'OR' || !Array.isArray(node.children) || node.children.length < 2)
		return null;
	if (
		!node.children.every(
			(child) =>
				child?.system === 'patient' &&
				child.key === 'patID' &&
				child.type === 'EQUALS' &&
				!('children' in child) &&
				typeof child.value === 'string'
		)
	)
		return null;

	const ids = new Set(node.children.map((child) => child.value));
	const includesMissing = ids.delete('-');
	const membership = { system: 'patient', key: 'patID', type: 'PATIENT_IDS', value: [...ids] };
	if (!includesMissing) return membership;
	// The catalogue uses '-' to select missing or empty fields.
	const missing = { system: 'patient', key: 'patID', type: 'EQUALS', value: '-' };
	return ids.size ? { operand: 'OR', children: [membership, missing] } : missing;
}

function normalizeAstKey(key) {
	if (typeof key !== 'string') return key;
	const negated = key.startsWith('!');
	const rawKey = negated ? key.slice(1) : key;
	const normalized = FLAT_UNDERSCORE_PREFIXES.some((prefix) => rawKey.startsWith(prefix))
		? rawKey
		: rawKey.replaceAll(/_(?!3)(?!id)/g, '.');
	return `${negated ? '!' : ''}${normalized}`;
}

function normalizeAstKeys(ast) {
	const visit = (node) => {
		if (!node || typeof node !== 'object') return;
		if (typeof node.key === 'string') {
			node.key = normalizeAstKey(node.key);
			const negated = node.key.startsWith('!');
			const rawKey = negated ? node.key.slice(1) : node.key;
			if (
				node.system === 'study' &&
				(rawKey.startsWith('studyPatients.') || rawKey === 'recruitmentDate')
			) {
				node.system = 'studyPatient';
				const participationKey = rawKey.startsWith('studyPatients.')
					? rawKey.slice('studyPatients.'.length)
					: rawKey;
				node.key = `${negated ? '!' : ''}${participationKey}`;
			}
		}
		if (Array.isArray(node.children)) node.children.forEach(visit);
	};
	visit(ast);
	return ast;
}

function parseAstFilter(raw) {
	try {
		return normalizeAstKeys(JSON.parse(raw));
	} catch (_error) {
		return null;
	}
}

function exactOne(clauses) {
	if (clauses.length === 0) return { $expr: { $eq: [1, 0] } };
	if (clauses.length === 1) return clauses[0];
	return {
		$or: clauses.map((clause, index) => ({
			$and: [clause, { $nor: clauses.filter((_other, otherIndex) => otherIndex !== index) }]
		}))
	};
}

function combineLogicalClauses(operand, clauses) {
	if (clauses.length === 1 && operand !== 'NOR') return clauses[0];
	switch (operand) {
		case 'AND':
			return clauses.length === 0 ? {} : { $and: clauses };
		case 'OR':
			return clauses.length === 0 ? { $expr: { $eq: [1, 0] } } : { $or: clauses };
		case 'NOR':
			return clauses.length === 0 ? {} : { $nor: clauses };
		case 'XOR':
			return exactOne(clauses);
		default:
			throw new Error(`Unknown logical operator: ${operand}`);
	}
}

module.exports = {
	combineLogicalClauses,
	compactPatientIdGroup,
	normalizeAstKey,
	normalizeAstKeys,
	parseAstFilter
};
