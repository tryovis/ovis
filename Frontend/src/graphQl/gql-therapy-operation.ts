import { dataUrl, graphqlFetch } from './gql-url'
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

  let userFilter = filter ? JSON.parse(filter) : null;

  let fixedOperationFilter = {
    "operand": "AND",
    "children": [
      {
        "key": "generalType",
        "type": "EQUALS",
        "system": "therapy",
        "value": "operation"
      }
    ]
  };

  // Check if the userFilter has an empty "children" array
  if (userFilter && userFilter.children && userFilter.children.length > 0) {
    // If userFilter is not empty, combine it with the fixed operation filter
    fixedOperationFilter.children.push(userFilter);
  }


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
        "filter": JSON.stringify(fixedOperationFilter) // Convert the combined or fixed filter back to a string
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
