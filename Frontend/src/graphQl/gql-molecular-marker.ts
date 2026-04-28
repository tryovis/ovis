import { dataUrl, graphqlFetch } from './gql-url'
const localeOptions:Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
};


export const getMolecularMarkerTable = (continueFromID: string | undefined | null, limit: number, filter: String | null) => graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        query: `
            query getMolecularMarkerTable ($continueFromID: String, $limit: Int, $filter: String) {
            getMolecularMarker(continueFromID: $continueFromID, limit: $limit, filter: $filter) {
              _id
              patID
              tumorID
              molecularMarkerOccurrenceDate
              type
              exon
              status
              miscellaneous
              method
              project
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
  result.data.getMolecularMarker.forEach(element => {
      if(element.molecularMarkerOccurrenceDate) element.molecularMarkerOccurrenceDate = new Date(element.molecularMarkerOccurrenceDate).toLocaleDateString('de-DE', localeOptions);
  });
  return result.data.getMolecularMarker
  })

  export const getMolecularMarkerChart = (filter: string) => graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        query: `
        query($filter: String!) {
          getMolecularMarkerChart(filter: $filter) {
            category
            groups {
              label
              count
            }
          }
        }
        `,
        variables: {
          filter
        }
    }),
  })
  .then(resp => resp.json())
  .then(result => result.data.getMolecularMarkerChart);