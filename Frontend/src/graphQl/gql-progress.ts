import { dataUrl, graphqlFetch } from './gql-url'
const localeOptions:Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
};


  export const getProgressTable = (continueFromID: string | undefined | null, limit: number, filter: String | null) => graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        query: `
            query getProgressTable ($continueFromID: String, $limit: Int, $filter: String) {
            getCourses(continueFromID: $continueFromID, limit: $limit, filter: $filter) {
              _id
              patID
              tumorID
              progressOccurrenceDate
              progressDaysSinceDiagnosis
              overallAssessment
              tumorState
              lymphNodeState
              metastasisState
              progressReason
              progressSource
              reportID
              vitalState
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
  result.data.getCourses.forEach(element => {
      if(element.progressOccurrenceDate) element.progressOccurrenceDate = new Date(element.progressOccurrenceDate).toLocaleDateString('de-DE', localeOptions);
  });
  return result.data.getCourses
})



