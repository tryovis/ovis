import { dataUrl, graphqlFetch } from './gql-url'
const localeOptions:Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
};

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
                "field": field.replace("_", "."),
                "collection": collection
            }
        }),
    })
    .then(resp => resp.json())
    .then(result => {
        const options = result.data.getValueOptions || [];
        //console.log(`Filtered options for ${field}(${collection}):`, options);
        return options.filter(option => option !== null);
    })
    .catch(error => {
        console.error("Error fetching value options:", error);
        return []; // Gebe ein leeres Array im Fehlerfall zurück
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
        }),
    })
    .then(resp => resp.json())
    .then(result => {
        // Verarbeite die Ergebnisse aus der dbmeta-Query
        const options = result.data.dbmeta || [];
        console.log(`Received dbMeta options:`, options);
        // Filtere die Optionen, um sicherzustellen, dass keine null-Werte zurückkommen
        return options.filter(option => option.field !== null && option.collection !== null);
    })
    .catch(error => {
        console.error("Error fetching dbMeta options:", error);
        return []; // Gebe ein leeres Array im Fehlerfall zurück
    });
};
