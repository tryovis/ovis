import { dataUrl, graphqlFetch } from './gql-url'

export const getSurvivalKaplanMeierChart= (kpType: any, stratification: any, filter:String) => graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
     },
    body: JSON.stringify({ query: `query  getKaplanMeier($getKpType: kpType!,$getStratification: stratification!, $source: kpcol, $filter:String){
            getSurvivalKaplanMeierChart(type: $getKpType, strat: $getStratification, source: $source, filter:$filter) {
              tumorID
              dateDiff
              status
              groupe
            } 
          }`,
          variables: {
              "getKpType": kpType,
              "getStratification": stratification,
              "source": "prp",
              "filter": filter
          }
    }),
})
.then(resp => resp.json() )
.then(result => result.data.getSurvivalKaplanMeierChart)

export const getSurvivalFollowUpAssessment = (from: any, till: any, includeTherapy: any, includeVital: any, filter: String) => graphqlFetch(dataUrl, {
  method: 'POST',
  headers: {
      'Content-Type': 'application/json'
   },
  body: JSON.stringify({ 
    query: `query getSurvivalFollowUpAssessment($from: String!, $till: String!, $includeTherapy: Boolean, $includeVital: Boolean, $filter: String) {
      getSurvivalFollowUpAssessment(from: $from, till: $till, includeTherapy: $includeTherapy, includeVital: $includeVital, filter: $filter) {
        followup {
          denominator
          numerator
          percentage
        }
        year
      } 
    }`,
    variables: {
      "from": from,
      "till": till,
      "includeTherapy": includeTherapy,
      "includeVital": includeVital,
      "filter": filter
    }
  }),
})
.then(resp => resp.json())
.then(result => result.data.getSurvivalFollowUpAssessment);
