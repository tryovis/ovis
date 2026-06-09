import { dataUrl, graphqlFetch } from './gql-url'
const localeOptions:Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
};

export const getPatientSingleHeader = (patID: string) => graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        query: `
        query getPatientSingleHeader($patID: String!) {
                getPatientSingleHeader(patID: $patID) {
                  _id
                  patID
                  firstName
                  lastName
                  gender
                  birthDate
                  postalCode
                  countryCode
                  area
                  vitalDate
                  deathDate 
                  vitalState
                  ageAtDiagnosis
                  diagnosis
            }
           }`,
    variables: {
      "patID": patID
    } 
    }),
})
.then(resp => resp.json() )
.then(result => {
    result.data.getPatientSingleHeader.birthDate = new Date(result.data.getPatientSingleHeader.birthDate).toLocaleDateString('de-DE', localeOptions);
    result.data.getPatientSingleHeader.vitalDate = new Date(result.data.getPatientSingleHeader.vitalDate).toLocaleDateString('de-DE', localeOptions);
    return result.data.getPatientSingleHeader
})



    export const getPatientSingleHistoryTable = (continueFromID: string | undefined | null, limit: number) => graphqlFetch(dataUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            query: `
                query getPatientCohortHistoryTable ($continueFromID: String, $limit: Int, $filter:String) {
                    getPatientCohortHistoryTable(continueFromID: $continueFromID, limit: $limit, filter:$filter) {
                    _id
                    patID
                    tumorID
                    diagnosisDate
                    ICD {
                      ICD10
                    }
                    ICDO {
                      localizationCode
                      histologyCode
                    }
                    ageAtDiagnosis
                    reportID
                }
            }`,
        variables: {
          "continueFromID": continueFromID,
          "limit": limit,
          "filter": '{ "column": "patID",  "value": { "operator": "&", "elements": [{ "value": "-327817088", "expression": "=" }] }}'
        } 
        }),
    })
    .then(resp => resp.json() )
    .then(result => {
        result.data.getPatientCohortHistoryTable.forEach(element => {
            if(element.diagnosisDate) element.diagnosisDate = new Date(element.diagnosisDate).toLocaleDateString('de-DE', localeOptions);
        });
        return result.data.getPatientCohortHistoryTable
    })

    export const getPatientSingleTNMTable = (continueFromID: string | undefined | null, limit: number) => graphqlFetch(dataUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: `
            query getTNMMetastases($continueFromID: String, $limit: Int, $filter:String) {
              getTnmMetastases(continueFromID: $continueFromID, limit: $limit, filter:$filter) {
                tnmOccurrenceDate
                L
                M
                N
                Nb
                Pn
                Nu
                RClass
                S
                T
                tumorID
                UICC
                V
                version
                _id
                a
                multipleT
                preN
                preM
                preT
                sN
                r
                y
                type
                total
                sNu
                sNb
                patID
              }
            }
          `,
          variables: {
            "continueFromID": continueFromID,
            "limit": limit,
            "filter": '{ "column": "patID",  "value": { "operator": "&", "elements": [{ "value": "-327817088", "expression": "=" }] }}'
          }
        }),
      })
        .then(resp => resp.json())
        .then(result => {
                result.data.getTnmMetastases.forEach(element => {    
         if(element.progressOccurrenceDate) element.progressOccurrenceDate = new Date(element.progressOccurrenceDate).toLocaleDateString('de-DE', localeOptions);
        });
          return result.data.getTnmMetastases;
        });


        export const getPatientOverview = (patID: string) => graphqlFetch(dataUrl, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({
              query: `
              query getPatientOverview($patID: String!) {
                getPatientOverview(patID: $patID) {
                  x
                  y
                  label
                        }
                 }`,
          variables: {
            "patID": patID
          } 
          }),
      })
      .then(resp => resp.json() )
      .then(result => {
          result.data.getPatientOverview.x = new Date(result.data.getPatientOverview.x).toLocaleDateString('de-DE', localeOptions);
         // result.data.getPatientSingleHeader.VitalDate = new Date(result.data.getPatientSingleHeader.VitalDate).toLocaleDateString('de-DE', localeOptions);
          return result.data.getPatientOverview
      })
      