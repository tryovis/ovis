/**
 * @typedef {{ min: number; max: number }} RangeValue
 * @typedef {{ key: string; type: 'BETWEEN'; system: string; value: RangeValue }} BetweenLeaf
 * @typedef {{ key: string; type: 'EQUALS'; system?: string; value: string }} EqualsLeaf
 * @typedef {{ key?: string; operand?: 'AND' | 'OR'; children?: AstNode[]; type?: string; system?: string; value?: unknown }} AstNode
 */

/**
 * @param {number | string} min
 * @param {number | string} max
 * @param {AstNode | null | undefined} currentAst
 * @param {string=} collection
 * @param {string=} fieldName
 * @returns {AstNode | null | undefined}
 */
export function addNumberInterval(min, max, currentAst, collection, fieldName) {
	const minValue = Number(min);
	const maxValue = Number(max);

	if (!currentAst || typeof currentAst !== 'object') {
		console.warn('addNumberInterval: currentAst ist leer/kein Objekt:', currentAst);
		return currentAst;
	}

	const resolvedCollection = collection || 'diagnosis';
	const resolvedFieldName = fieldName || 'ageAtDiagnosis';

	/** @type {AstNode} */
	const ast = JSON.parse(JSON.stringify(currentAst));

	/** @param {number} lo @param {number} hi @returns {BetweenLeaf} */
	const makeBetweenLeaf = (lo, hi) => ({
		key: resolvedFieldName,
		type: 'BETWEEN',
		system: resolvedCollection,
		value: { min: lo, max: hi }
	});

	/** @param {number} lo @param {number} hi @returns {AstNode} */
	const makeFieldNode = (lo, hi) => ({
		key: resolvedFieldName,
		operand: 'OR',
		children: [makeBetweenLeaf(lo, hi)]
	});

	/** @param {unknown} value @returns {number | null} */
	const toNumberOrNull = (value) => {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	};

	/** @param {AstNode} andNode */
	const processAnd = (andNode) => {
		if (!Array.isArray(andNode.children)) return;

		/** @type {number[]} */
		const fieldNodesIdx = [];
		andNode.children.forEach((child, idx) => {
			if (
				child?.key === resolvedFieldName &&
				child?.operand === 'OR' &&
				Array.isArray(child.children)
			) {
				fieldNodesIdx.push(idx);
			}
		});

		/** @type {number[]} */
		const mins = [];
		/** @type {number[]} */
		const maxs = [];
		for (const idx of fieldNodesIdx) {
			const node = andNode.children[idx];
			for (const leaf of node.children || []) {
				if (
					leaf?.key === resolvedFieldName &&
					leaf?.type === 'BETWEEN' &&
					leaf?.system === resolvedCollection &&
					leaf?.value &&
					typeof leaf.value === 'object'
				) {
					const rangeValue = /** @type {RangeValue} */ (leaf.value);
					const lo = toNumberOrNull(rangeValue.min);
					const hi = toNumberOrNull(rangeValue.max);
					if (lo !== null) mins.push(lo);
					if (hi !== null) maxs.push(hi);
				}
			}
		}

		mins.push(minValue);
		maxs.push(maxValue);

		const mergedMin = Math.min(...mins);
		const mergedMax = Math.max(...maxs);

		if (fieldNodesIdx.length === 0) {
			andNode.children.push(makeFieldNode(mergedMin, mergedMax));
		} else {
			const firstIdx = fieldNodesIdx[0];
			if (andNode.children[firstIdx]) {
				andNode.children[firstIdx].children = [makeBetweenLeaf(mergedMin, mergedMax)];
			}
			for (let i = fieldNodesIdx.length - 1; i >= 1; i--) {
				andNode.children.splice(fieldNodesIdx[i], 1);
			}
		}
	};

	/** @param {AstNode} node */
	const traverse = (node) => {
		if (node.operand === 'OR' && Array.isArray(node.children) && node.children.length === 0) {
			node.children.push({
				operand: 'AND',
				children: [makeFieldNode(minValue, maxValue)]
			});
			return;
		}

		if (node.operand === 'OR' && Array.isArray(node.children)) {
			node.children.forEach((child) => {
				if (child?.operand === 'AND') {
					processAnd(child);
				} else if (child) {
					traverse(child);
				}
			});
			return;
		}

		if (Array.isArray(node.children)) node.children.forEach(traverse);
	};

	traverse(ast);

	return ast;
}

/**
 * Fügt viele Patient-IDs (patID) in einem Schritt in ein bestehendes AST ein.
 *
 * Die AST-Form wird NICHT verändert. Es wird lediglich in bestehenden AND-Knoten
 * ein (ggf. neuer) patID-OR-Knoten ergänzt bzw. erweitert.
 *
 * Beispiel-Form innerhalb eines AND-Knotens:
 * {
 *   key: 'patID',
 *   operand: 'OR',
 *   children: [
 *     { key:'patID', type:'EQUALS', system:'patient', value:'123' },
 *     ...
 *   ]
 * }
 */
/**
 * @param {string | string[]} patIDs
 * @param {AstNode | null | undefined} currentAst
 * @param {string=} collection
 * @param {string=} fieldName
 * @returns {AstNode | null | undefined}
 */
export function addPatIDs(patIDs, currentAst, collection, fieldName) {
	if (!currentAst || typeof currentAst !== 'object') {
		console.warn('addPatIDs: currentAst ist leer/kein Objekt:', currentAst);
		return currentAst;
	}

	const resolvedCollection = collection || 'patient';
	const resolvedFieldName = fieldName || 'patID';

	const inputList = Array.isArray(patIDs) ? patIDs : [patIDs];
	/** @type {string[]} */
	const normalized = [];
	const seen = new Set();
	for (const value of inputList) {
		const normalizedValue = String(value ?? '').trim();
		if (!normalizedValue || seen.has(normalizedValue)) continue;
		seen.add(normalizedValue);
		normalized.push(normalizedValue);
	}

	if (normalized.length === 0) return currentAst;

	/** @type {AstNode} */
	const ast = JSON.parse(JSON.stringify(currentAst));

	/** @param {string} value @returns {EqualsLeaf} */
	const makeEqualsLeaf = (value) => ({
		key: resolvedFieldName,
		type: 'EQUALS',
		system: resolvedCollection,
		value
	});

	/** @param {string[]} values @returns {AstNode} */
	const makeFieldNode = (values) => ({
		key: resolvedFieldName,
		operand: 'OR',
		children: values.map(makeEqualsLeaf)
	});

	/** @param {AstNode} andNode */
	const processAnd = (andNode) => {
		if (!Array.isArray(andNode.children)) return;

		/** @type {number[]} */
		const fieldNodesIdx = [];
		andNode.children.forEach((child, idx) => {
			if (
				child?.key === resolvedFieldName &&
				child?.operand === 'OR' &&
				Array.isArray(child.children)
			) {
				fieldNodesIdx.push(idx);
			}
		});

		/** @type {string[]} */
		const merged = [];
		const mergedSet = new Set();
		/** @type {AstNode[]} */
		const passthroughLeaves = [];

		/** @param {unknown} value */
		const addVal = (value) => {
			const normalizedValue = String(value ?? '').trim();
			if (!normalizedValue || mergedSet.has(normalizedValue)) return;
			mergedSet.add(normalizedValue);
			merged.push(normalizedValue);
		};

		for (const idx of fieldNodesIdx) {
			const node = andNode.children[idx];
			for (const leaf of node.children || []) {
				if (
					leaf?.key === resolvedFieldName &&
					leaf?.type === 'EQUALS' &&
					(leaf.system == null || leaf.system === resolvedCollection)
				) {
					addVal(leaf.value);
				} else if (leaf) {
					passthroughLeaves.push(leaf);
				}
			}
		}

		for (const id of normalized) addVal(id);

		if (fieldNodesIdx.length === 0) {
			andNode.children.push(makeFieldNode(merged));
		} else {
			const firstIdx = fieldNodesIdx[0];
			if (andNode.children[firstIdx]) {
				andNode.children[firstIdx].children = [...passthroughLeaves, ...merged.map(makeEqualsLeaf)];
			}
			for (let i = fieldNodesIdx.length - 1; i >= 1; i--) {
				andNode.children.splice(fieldNodesIdx[i], 1);
			}
		}
	};

	/** @param {AstNode} node */
	const traverse = (node) => {
		if (node.operand === 'OR' && Array.isArray(node.children) && node.children.length === 0) {
			node.children.push({
				operand: 'AND',
				children: [makeFieldNode(normalized)]
			});
			return;
		}

		if (node.operand === 'OR' && Array.isArray(node.children)) {
			node.children.forEach((child) => {
				if (child?.operand === 'AND') {
					processAnd(child);
				} else if (child) {
					traverse(child);
				}
			});
			return;
		}

		if (Array.isArray(node.children)) node.children.forEach(traverse);
	};

	traverse(ast);

	return ast;
}
