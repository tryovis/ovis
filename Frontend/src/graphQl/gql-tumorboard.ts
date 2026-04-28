import { dataUrl, graphqlFetch } from './gql-url'
const localeOptions:Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
};

export const getTumorboardTable = (continueFromID: string | undefined | null, limit: number, filter: String | null) => graphqlFetch(dataUrl, {
  method: 'POST',
  headers: {
      'Content-Type': 'application/json'
  },
  body: JSON.stringify({
      query: `
          query getTumorBoard ($continueFromID: String, $limit: Int, $filter: String) {
            getTumorBoard(continueFromID: $continueFromID, limit: $limit, filter: $filter) {
            _id
            patID
            tumorID
            tumorBoardOccurrenceDate
            tumorBoardDaysSinceDiagnosis
            type
            recommendation
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
result.data.getTumorBoard.forEach(element => {
    if(element.tumorBoardOccurrenceDate) element.tumorBoardOccurrenceDate= new Date(element.tumorBoardOccurrenceDate).toLocaleDateString('de-DE', localeOptions);
});
return result.data.getTumorBoard
})
