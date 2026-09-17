import { formatDateForInput, parseDateInput } from './filterDateInput.js';

const OPERATORS = new Set(['EQUALS', 'NEQUALS', 'BETWEEN', 'NBETWEEN']);
const FIELD_KEY = /^!?[A-Za-z_][A-Za-z0-9_.]*$/;
const SYSTEM = /^[A-Za-z_][A-Za-z0-9_]*$/;
const baseKey = (key) => String(key ?? '').replace(/^!/, '');
const fieldId = (key, system) => `${baseKey(key)}(${system})`;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

/** Index catalogue fields once. Positive/negative catalogue entries share metadata. */
export function createFieldIndex(catalogue) {
	const fields = new Map();
	for (const category of Array.isArray(catalogue) ? catalogue : []) {
		for (const field of Array.isArray(category?.childCategories) ? category.childCategories : []) {
			if (!FIELD_KEY.test(field?.key ?? '') || !SYSTEM.test(field?.system ?? '')) continue;
			if (!OPERATORS.has(field.type)) continue;
			const id = fieldId(field.key, field.system);
			if (fields.has(id) && field.key.startsWith('!')) continue;
			fields.set(id, {
				...field,
				key: baseKey(field.key),
				type:
					field.type === 'NEQUALS' ? 'EQUALS' : field.type === 'NBETWEEN' ? 'BETWEEN' : field.type
			});
		}
	}
	return fields;
}

/** A datalist is editable text: incomplete or unknown field names are ordinary invalid input. */
export function parseEditorField(value, fieldIndex) {
	if (typeof value !== 'string') return null;
	const match = /^(!?[A-Za-z_][A-Za-z0-9_.]*)\(([A-Za-z_][A-Za-z0-9_]*)\)$/.exec(value.trim());
	if (!match) return null;
	const [, key, system] = match;
	const field = fieldIndex?.get(fieldId(key, system));
	if (!field) return null;
	return {
		...field,
		key,
		system,
		type: key.startsWith('!') ? `N${field.type}` : field.type
	};
}

/** Metadata also identifies dates named "start"; older catalogues fall back to the field name. */
export function isDateField(node, fieldIndex) {
	const field = fieldIndex?.get(fieldId(node?.key, node?.system));
	if (field?.fieldType) return field.fieldType === 'date';
	return baseKey(node?.key).toLowerCase().includes('date');
}

/** Check before rendering: the editor cannot faithfully represent arbitrary nested logic. */
export function isEditableAst(ast) {
	const logical = (node, operand, allowEmpty = false) =>
		isObject(node) &&
		node.operand === operand &&
		Array.isArray(node.children) &&
		!hasOwn(node, 'value') &&
		(allowEmpty || node.children.length > 0);
	if (!logical(ast, 'OR', true)) return false;
	return ast.children.every(
		(andGroup) =>
			logical(andGroup, 'AND') &&
			andGroup.children.every((orGroup) => {
				if (!logical(orGroup, 'OR')) return false;
				const first = orGroup.children[0];
				return orGroup.children.every(
					(node) =>
						isObject(node) &&
						!hasOwn(node, 'children') &&
						!hasOwn(node, 'operand') &&
						typeof node.key === 'string' &&
						typeof node.system === 'string' &&
						OPERATORS.has(node.type) &&
						hasOwn(node, 'value') &&
						node.key === first.key &&
						node.system === first.system &&
						node.type === first.type
				);
			})
	);
}

function dateBound(value) {
	if (typeof value === 'number' && !Number.isFinite(value)) return null;
	if (typeof value !== 'number' && typeof value !== 'string') return null;
	if (typeof value === 'string') {
		if (!value.trim()) return null;
		// Date constructors otherwise normalize impossible dates such as February 30.
		const calendarPart = /^(\d{4,}-\d{2}-\d{2})(?:$|T)/.exec(value);
		if (calendarPart && parseDateInput(calendarPart[1]) === null) return null;
		if (calendarPart && calendarPart[1] === value) return parseDateInput(value);
	}
	return parseDateInput(formatDateForInput(value));
}

function numericBound(value) {
	if (typeof value !== 'number' && typeof value !== 'string') return null;
	if (typeof value === 'string' && value.trim() === '') return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

/**
 * Validate every page and group before saving. Suggestions are not an allow-list:
 * empty strings, false, zero and values absent from the current cohort are valid filters.
 * This editor represents OR -> AND -> same-field OR groups; reject other shapes
 * instead of letting Lens discard predicates during conversion.
 */
export function validateEditorAst(ast, fieldIndex) {
	const errors = [];
	const inconsistentFields = [];
	const invalidNodes = new Set();
	const fail = (node, path, message, leaf = false) => {
		errors.push({ node, path, message });
		if (leaf && !invalidNodes.has(node)) {
			invalidNodes.add(node);
			inconsistentFields.push(node);
		}
	};
	const group = (node, operand, path, allowEmpty = false) => {
		if (
			!isObject(node) ||
			node.operand !== operand ||
			!Array.isArray(node.children) ||
			hasOwn(node, 'value') ||
			(!allowEmpty && node.children.length === 0)
		) {
			fail(
				node,
				path,
				`Expected ${operand} group${allowEmpty ? '' : ' with at least one condition'}.`
			);
			return false;
		}
		return true;
	};

	if (group(ast, 'OR', [], true)) {
		ast.children.forEach((andGroup, andIndex) => {
			const andPath = [andIndex];
			if (!group(andGroup, 'AND', andPath)) return;
			andGroup.children.forEach((orGroup, orIndex) => {
				const orPath = [...andPath, orIndex];
				if (!group(orGroup, 'OR', orPath)) return;
				let rowIdentity;
				orGroup.children.forEach((node, valueIndex) => {
					const path = [...orPath, valueIndex];
					const invalid = (message) => fail(node, path, message, true);
					if (!isObject(node) || hasOwn(node, 'children') || hasOwn(node, 'operand')) {
						invalid('Expected a field condition; nested groups cannot be edited here.');
						return;
					}
					const field = parseEditorField(`${node.key}(${node.system})`, fieldIndex);
					if (!field) invalid('Select a known field and collection.');
					if (!OPERATORS.has(node.type)) invalid('Unknown comparison operator.');
					const identity = JSON.stringify([node.key, node.system, node.type]);
					if (valueIndex === 0) rowIdentity = identity;
					else if (identity !== rowIdentity) {
						invalid('Values in one row must use the same field, collection and operator.');
					}
					const range = node.type === 'BETWEEN' || node.type === 'NBETWEEN';
					if (range) {
						if (!isObject(node.value) || !hasOwn(node.value, 'min') || !hasOwn(node.value, 'max')) {
							invalid('Provide both range bounds; use null for an open or missing bound.');
							return;
						}
						const convert = isDateField(node, fieldIndex) ? dateBound : numericBound;
						const { min, max } = node.value;
						const low = min === null ? null : convert(min);
						const high = max === null ? null : convert(max);
						if ((min !== null && low === null) || (max !== null && high === null)) {
							invalid('Enter a valid finite number or date for each populated bound.');
						} else if (low !== null && high !== null && low > high) {
							invalid('The lower bound must not exceed the upper bound.');
						}
					} else if (
						!hasOwn(node, 'value') ||
						!(
							node.value === null ||
							typeof node.value === 'string' ||
							typeof node.value === 'boolean' ||
							(typeof node.value === 'number' && Number.isFinite(node.value))
						)
					) {
						invalid('Use a scalar value; add separate values with OR for an array selection.');
					}
				});
			});
		});
	}
	return { valid: errors.length === 0, errors, inconsistentFields };
}

/** Preserve all filter predicates and scalar types, excluding only editor pagination. */
export function serializeEditorAst(ast) {
	return JSON.stringify(ast, (key, value) => (key === '_page' ? undefined : value));
}

/** Adding a value retains the exact operator (including negation) of its existing row. */
export function createEditorValue(first) {
	return {
		key: first.key,
		system: first.system,
		type: first.type,
		value: first.type === 'BETWEEN' || first.type === 'NBETWEEN' ? { min: null, max: null } : ''
	};
}
