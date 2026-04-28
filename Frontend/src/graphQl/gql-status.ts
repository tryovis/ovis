import { dataUrl, graphqlFetch } from './gql-url'
const localeOptions:Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
};

export const getStatusTable = (continueFromID: string | undefined | null, limit: number, filter: String | null) => graphqlFetch(dataUrl, {
  method: 'POST',
  headers: {
      'Content-Type': 'application/json'
  },
  body: JSON.stringify({
      query: `
          query getStatus ($continueFromID: String, $limit: Int, $filter: String) {
            getStatus(continueFromID: $continueFromID, limit: $limit, filter: $filter) {
            _id
            patID
            tumorID
            statusOccurrenceDate
            statusDaysSinceDiagnosis
            type
            status
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
result.data.getStatus.forEach(element => {
    if(element.statusOccurrenceDate) element.statusOccurrenceDate= new Date(element.statusOccurrenceDate).toLocaleDateString('de-DE', localeOptions);
});
return result.data.getStatus
})
