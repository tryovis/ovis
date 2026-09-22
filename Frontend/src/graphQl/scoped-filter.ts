type FilterNode = {
	operand?: string;
	children?: FilterNode[];
	key?: string;
	system?: string;
	type?: string;
	value?: unknown;
};

type FixedSelection = {
	key: string;
	system: string;
	value: string | number | boolean | null;
};

/** Keep a view's scope outside the editable cohort filter, including OR groups. */
export function withFixedFilter(filter: string | null, fixedFilter: string | null): string | null {
	if (!fixedFilter) return filter;
	const fixed = JSON.parse(fixedFilter) as FilterNode;
	const active = filter ? (JSON.parse(filter) as FilterNode | null) : null;
	const children = [fixed];
	if (active && !(Array.isArray(active.children) && active.children.length === 0)) {
		children.push(active);
	}
	return JSON.stringify({ operand: 'AND', children });
}

/** Only conjunctive equality scopes can be represented as ordinary Lens selections. */
export function fixedFilterSelections(fixedFilter: string | null): FixedSelection[] {
	if (!fixedFilter) return [];
	const node = JSON.parse(fixedFilter) as FilterNode;
	function leaves(filter: FilterNode): FixedSelection[] {
		if (filter.operand === 'AND') return (filter.children ?? []).flatMap(leaves);
		if (
			filter.key &&
			filter.system &&
			filter.type === 'EQUALS' &&
			(filter.value === null || ['string', 'number', 'boolean'].includes(typeof filter.value))
		) {
			return [
				{ key: filter.key, system: filter.system, value: filter.value as FixedSelection['value'] }
			];
		}
		return [];
	}
	return leaves(node);
}
