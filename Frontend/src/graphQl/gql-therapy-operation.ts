import { dataUrl, graphqlFetch } from './gql-url'
import { withFixedFilter } from './scoped-filter';

export const operationTherapyFilter = JSON.stringify({
  key: 'generalType', type: 'EQUALS', system: 'therapy', value: 'operation'
});
const localeOptions:Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
};


export const getTherapyOperationTable = (
	continueFromID: string | undefined | null,
	limit: number,
	filter: string | null
) => {

  return graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        query getTherapyOperationTable ($continueFromID: String, $limit: Int, $filter:String) {
        getAllTherapies(continueFromID: $continueFromID, limit: $limit, filter:$filter) {
          _id,
          therapyID,
          patID,
          tumorID,
          therapyOccurrenceDate,
          therapyDaysSinceDiagnosis,
          ops {
            ops
          },
          resectionType,
          metastasisResection,
          localRState,
          globalRState,
          emergencySurgery,
          surgeon
          }
      }`,
      //subType,
      //revisionSurgery,
      variables: {
        "continueFromID": continueFromID,
        "limit": limit,
        "filter": withFixedFilter(filter, operationTherapyFilter)
      }
    }),
  })
  .then(resp => resp.json())
  .then(result => {
    result.data.getAllTherapies.forEach(element => {
      if (element.therapyOccurrenceDate) {
        element.therapyOccurrenceDate = new Date(element.therapyOccurrenceDate).toLocaleDateString('de-DE', localeOptions);
      }
    });
    return result.data.getAllTherapies;
  });
};

export const getTherapyOperationOpsCodeTable = (continueFromID: string | undefined | null, limit: number, filter: string | null) => graphqlFetch(dataUrl, {
  method: 'POST',
  headers: {
      'Content-Type': 'application/json'
  },
  body: JSON.stringify({
      query: `
        query opscount($filter: String) {
          getTherapyOperationOPSTable(filter: $filter) {
            category {
              code
              count
              text
            }
            code {
              category
              code
              count
              text
            }
          }
        }`,
      variables: {
        filter
      }
  }),
})
.then(resp => resp.json())
.then(result => {
  return result.data.getTherapyOperationOPSTable;
});
