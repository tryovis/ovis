import { fixedFilterSelections } from '../../graphQl/scoped-filter';
import {
	addChartQueryItem,
	isQueryItemRedundantWithAssignedFilter,
	type QueryItem
} from '../../tableFilterItems';

type QueryPasser = Parameters<typeof addChartQueryItem>[0];
let selectionId = 0;

/** Carry the displayed scope into a selection, without widening existing OR branches. */
export function applyFixedFilterSelection(
	dataPasser: QueryPasser | null,
	fixedFilter: string | null,
	assignedFilter?: unknown
): boolean {
	if (!dataPasser || !fixedFilter) return true;
	const scopes = fixedFilterSelections(fixedFilter);
	const original = dataPasser.getQueryAPI();
	let groups = (original.length ? original : [[]]).map((group) =>
		group.map((row) => ({ ...row, values: [...row.values] }))
	);
	// Compute the complete scalar intersection before mutating Lens. Its insertion
	// merges equal field rows, so contradictory duplicate rows are not a safe AND.
	for (const scope of scopes) {
		groups = groups
			.filter(
				(group) =>
					!group.some((row) => {
						if (row.system !== scope.system || row.key.replace(/^!/, '') !== scope.key)
							return false;
						const containsScope = row.values.some(({ value }) => Object.is(value, scope.value));
						return (
							(row.type === 'EQUALS' && row.values.length > 0 && !containsScope) ||
							(row.type === 'NEQUALS' && containsScope)
						);
					})
			)
			.map((group) =>
				group.map((row) =>
					row.system === scope.system &&
					row.key === scope.key &&
					row.type === 'EQUALS' &&
					row.values.length > 0
						? { ...row, values: row.values.filter(({ value }) => Object.is(value, scope.value)) }
						: row
				)
			);
		if (groups.length === 0) return false;
	}
	dataPasser.setQueryStoreAPI(groups);
	for (const scope of scopes) {
		const item: QueryItem = {
			id: '-',
			key: scope.key,
			name: `${scope.system}:${scope.key}:EQUALS`,
			type: 'EQUALS',
			system: scope.system,
			values: [{ name: String(scope.value ?? ''), value: scope.value, queryBindId: '-' }]
		};
		if (isQueryItemRedundantWithAssignedFilter(item, assignedFilter)) continue;
		addChartQueryItem(dataPasser, item, assignedFilter);
		const metadata =
			dataPasser
				.getQueryAPI()[0]
				?.find(
					(row) => row.key === scope.key && row.system === scope.system && row.type === 'EQUALS'
				) ?? item;
		dataPasser.setQueryStoreAPI(
			dataPasser.getQueryAPI().map((group) => {
				if (
					group.some(
						(row) =>
							row.key === scope.key &&
							row.system === scope.system &&
							row.type === 'EQUALS' &&
							row.values.length > 0
					)
				)
					return group;
				const id = `ovis-scope-${Date.now()}-${++selectionId}`;
				return [
					...group,
					{
						...metadata,
						id,
						values: [{ name: String(scope.value ?? ''), value: scope.value, queryBindId: id }]
					}
				];
			})
		);
	}
	return true;
}
