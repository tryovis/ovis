import { dataUrl, graphqlFetch } from './gql-url'
const localeOptions:Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
};




  export const getSupplementaryChart = (filter: string) => graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        query: `
        query($filter: String!) {
          getSupplementaryChart(filter: $filter) {
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
  .then(result => result.data.getSupplementaryChart);


export const getSupplementaryTable = (continueFromID: string | undefined | null, limit: number, filter: String | null) => graphqlFetch(dataUrl, {
  method: 'POST',
  headers: {
      'Content-Type': 'application/json'
  },
  body: JSON.stringify({
      query: `
          query getSupplementaryTable ($continueFromID: String, $limit: Int, $filter: String) {
          getSupplementary(continueFromID: $continueFromID, limit: $limit, filter: $filter) {
            _id
            patID
            tumorID
            supplementaryOccurrenceDate
            type
            status
  }
}`,
        // therapyID
variables: {
  "continueFromID": continueFromID,
  "limit": limit,
  filter
} }),
})
.then(resp => resp.json() )
.then(result => {
result.data.getSupplementary.forEach(element => {
    if(element.supplementaryOccurrenceDate) element.supplementaryOccurrenceDate = new Date(element.supplementaryOccurrenceDate).toLocaleDateString('de-DE', localeOptions);
});
return result.data.getSupplementary
})