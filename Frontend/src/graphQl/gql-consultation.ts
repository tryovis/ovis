import { dataUrl, graphqlFetch } from './gql-url'
const localeOptions:Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
};

export const getConsultationTable= (continueFromID: string | undefined | null, limit: number, filter: String | null) => graphqlFetch(dataUrl, {
  method: 'POST',
  headers: {
      'Content-Type': 'application/json'
  },
  body: JSON.stringify({
      query: `
          query getConsultation ($continueFromID: String, $limit: Int, $filter: String) {
            getConsultation(continueFromID: $continueFromID, limit: $limit, filter: $filter) {
              _id
              patID
              tumorID
              consultationOccurrenceDate
              consultationDaysSinceDiagnosis
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
            result.data.getConsultation.forEach(element => {
                if(element.consultationOccurrenceDate) element.consultationOccurrenceDate = new Date(element.consultationOccurrenceDate).toLocaleDateString('de-DE', localeOptions);
            });
          return result.data.getConsultation
      })
