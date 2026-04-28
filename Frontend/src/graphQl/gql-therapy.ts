import { dataUrl, graphqlFetch } from './gql-url'
const localeOptions:Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
};


  export const getTherapyTable = (continueFromID: string | undefined | null, limit: number, filter: String | null) => graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        query: `
            query getTherapyTable ($continueFromID: String, $limit: Int, $filter:String) {
            getAllTherapies(continueFromID: $continueFromID, limit: $limit, filter:$filter) {
          _id,
          therapyID,
					tumorID,
					therapyOccurrenceDate,
					therapyDaysSinceDiagnosis,
					generalType,
					intention,
          surgeryContext,
          ops{
            ops
          },
          localRState,
          subType,
          protocol,
          substance{
            substance
          }
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
  result.data.getAllTherapies.forEach(element => {
      
      if(element.progressOccurrenceDate) element.progressOccurrenceDate = new Date(element.progressOccurrenceDate).toLocaleDateString('de-DE', localeOptions);
  });
  return result.data.getAllTherapies
})

