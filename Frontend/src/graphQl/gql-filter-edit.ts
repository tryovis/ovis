import { dataUrl, graphqlFetch } from './gql-url';
const localeOptions: Intl.DateTimeFormatOptions = {
	day: '2-digit',
	month: '2-digit',
	year: 'numeric'
};

// Match the AST translator's catalogue-to-database field mapping. In particular,
// _id and the flat ICDO_/grading_ fields are not nested document paths.
function valueOptionsField(field: string): string {
	const key = field.replace(/^!/, '');
	return key.startsWith('ICDO_') || key.startsWith('grading_')
		? key
		: key.replaceAll(/_(?!3)(?!id)/g, '.');
}

export const getValueOptions = (field: string, collection: string): Promise<string[]> => {
	return graphqlFetch(dataUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			query: `
                query Query($field: String, $collection: String) {
                    getValueOptions(field: $field, collection: $collection)
                }`,
			variables: {
				field: valueOptionsField(field),
				collection: collection
			}
		})
	})
		.then((resp) => {
			if (!resp.ok) throw new Error('Value options unavailable');
			return resp.json();
		})
		.then((result) => {
			if (result.errors?.length || !Array.isArray(result.data?.getValueOptions)) {
				throw new Error('Value options unavailable');
			}
			const options = result.data.getValueOptions;
			//console.log(`Filtered options for ${field}(${collection}):`, options);
			return options.filter((option) => option !== null);
		});
};

export const getDBMeta = (): Promise<string[]> => {
	return graphqlFetch(dataUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			query: `
                query Dbmeta {
                    dbmeta {
                        field
                        collection
                    }
                }`
		})
	})
		.then((resp) => resp.json())
		.then((result) => {
			// Verarbeite die Ergebnisse aus der dbmeta-Query
			const options = result.data.dbmeta || [];
			console.log(`Received dbMeta options:`, options);
			// Filtere die Optionen, um sicherzustellen, dass keine null-Werte zurückkommen
			return options.filter((option) => option.field !== null && option.collection !== null);
		})
		.catch((error) => {
			console.error('Error fetching dbMeta options:', error);
			return []; // Gebe ein leeres Array im Fehlerfall zurück
		});
};
