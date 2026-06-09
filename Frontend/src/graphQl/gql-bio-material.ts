import { dataUrl, graphqlFetch } from './gql-url'
const localeOptions:Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
};

export const getBioMaterialTable= (continueFromID: string | undefined | null, limit: number, filter: String | null) => graphqlFetch(dataUrl, {
  method: 'POST',
  headers: {
      'Content-Type': 'application/json'
  },
  body: JSON.stringify({
      query: `
          query getBioMaterial ($continueFromID: String, $limit: Int, $filter: String) {
            getBioMaterial(continueFromID: $continueFromID, limit: $limit, filter: $filter) {
              _id
              patID
              tumorID
              bioMaterialOccurrenceDate
              type
              status
              project
              reference
              amount
              }
          }` ,
          variables: {
            "continueFromID": continueFromID,
            "limit": limit,
            filter
          } }),
          })
          .then(resp => resp.json() )
          .then(result => {
            result.data.getBioMaterial.forEach(element => {
                if(element.bioMaterialOccurrenceDate) element.bioMaterialOccurrenceDate = new Date(element.bioMaterialOccurrenceDate).toLocaleDateString('de-DE', localeOptions);
            });
          return result.data.getBioMaterial
      })
