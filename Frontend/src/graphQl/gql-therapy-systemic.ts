import { dataUrl, graphqlFetch } from './gql-url'
const localeOptions:Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
};


export const getTherapySystemicTable = (
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
          "value": "systemic"
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
            query getTherapySystemicTable ($continueFromID: String, $limit: Int,$filter:String) {
            getAllTherapies(continueFromID: $continueFromID, limit: $limit, filter:$filter) {
        _id,
        therapyID,
        tumorID,
        therapyOccurrenceDate,
        therapyEndDate,
        therapyDaysSinceDiagnosis,
        subType,
        protocol,
        substance{
          substance
        },
        cyclesPlanned,
        cyclesPerformed,
        doseDeviation,

        }
  }`  ,
      // therapyLine,
      // therapyCycle,
      // therapyCycle,
      // intention,
      // surgeryContext
  variables: {
    "continueFromID": continueFromID,
    "limit": limit,
    "filter": JSON.stringify(fixedOperationFilter) // Convert the combined or fixed filter back to a string
      }}),
})
.then(resp => resp.json() )
.then(result => {
  result.data.getAllTherapies.forEach(element => {
      
      if(element.therapyOccurrenceDate) element.therapyOccurrenceDate = new Date(element.therapyOccurrenceDate).toLocaleDateString('de-DE', localeOptions);
      if(element.therapyEndDate) element.therapyEndDate = new Date(element.therapyEndDate).toLocaleDateString('de-DE', localeOptions);
  });
  return result.data.getAllTherapies
})
  }



  export const getTherapySystemicSubstanceTable = (filter: String | null) => graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
     },
    body: JSON.stringify({ 
      query: `
        query getTherapySystemicSubstanceTable ($filter: String) {
          getTherapySystemicSubstanceTable(filter: $filter) {
            count
            ATCCode
            label
          }
        }`,
      variables: {
        filter
      } 
    }),
  })
  .then(resp => resp.json())
  .then(result => result.data.getTherapySystemicSubstanceTable);
  
