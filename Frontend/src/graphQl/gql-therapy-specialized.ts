import { dataUrl, graphqlFetch } from './gql-url';

export type SpecializedTherapyType = 'nuclear' | 'other';

export function therapyTypeFilter(generalType: SpecializedTherapyType): string {
	return JSON.stringify({
		key: 'generalType',
		type: 'EQUALS',
		system: 'therapy',
		value: generalType
	});
}

type TherapyRow = Record<string, unknown> & {
	therapyOccurrenceDate?: number | string | null;
	therapyEndDate?: number | string | null;
};

const dateOptions: Intl.DateTimeFormatOptions = {
	day: '2-digit',
	month: '2-digit',
	year: 'numeric'
};

// Keep the standard cursor signature: GenericTable adds server paging, sorting,
// column filters and export requests through graphqlFetch.
export async function getSpecializedTherapyTable(
	continueFromID: string | undefined | null,
	limit: number,
	filter: string | null
): Promise<TherapyRow[]> {
	const response = await graphqlFetch(dataUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			query: `
				query getSpecializedTherapyTable($continueFromID: String, $limit: Int, $filter: String) {
					getAllTherapies(continueFromID: $continueFromID, limit: $limit, filter: $filter) {
						_id therapyID patID tumorID generalType therapyOccurrenceDate therapyEndDate therapyDaysSinceDiagnosis
						subType subTypeCode
						radioNuclid radioNuclidCode radiopharmaceutical radiopharmaceuticalCode
					}
				}
			`,
			variables: { continueFromID, limit, filter }
		})
	});
	if (!response.ok) throw new Error(`Therapy request failed (${response.status})`);
	const result = await response.json();
	if (result.errors?.length || !Array.isArray(result.data?.getAllTherapies)) {
		throw new Error('Therapy query failed');
	}
	return result.data.getAllTherapies.map((row: TherapyRow) => {
		const formatted = { ...row };
		for (const field of ['therapyOccurrenceDate', 'therapyEndDate'] as const) {
			if (row[field] != null) {
				const date = new Date(row[field]);
				formatted[field] = Number.isNaN(date.getTime())
					? null
					: date.toLocaleDateString('de-DE', dateOptions);
			}
		}
		return formatted;
	});
}
