import { dataUrl, graphqlFetch } from './gql-url'
const localeOptions:Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
};

export const getPatientCohortOverviewTable = (continueFromID: string | undefined | null, limit: number, filter: String | null) => graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
            query getPatientCohortOverviewTable ($continueFromID: String, $limit: Int, $filter: String) {
            getAllPatient(continueFromID: $continueFromID, limit: $limit, filter: $filter) {
                _id
                patID
                firstName
                lastName
                gender
                birthDate
                postalCode
                area
                countryCode
                vitalDate
                vitalState
                }
            }` ,
            variables: {
              "continueFromID": continueFromID,
              "limit": limit,
              filter
            }
        }),
    })
    .then(resp => resp.json() )
    .then(result => {
        result.data.getAllPatient.forEach(element => {
            
            if(element.deathDate) element.deathDate = new Date(element.deathDate).toLocaleDateString('de-DE', localeOptions);
            if(element.birthDate) element.birthDate = new Date(element.birthDate).toLocaleDateString('de-DE', localeOptions);
            if(element.vitalDate) element.vitalDate = new Date(element.vitalDate).toLocaleDateString('de-DE', localeOptions);  
        });
        return result.data.getAllPatient
    })




export const getPatientCohortHistoryTable = (continueFromID: string | undefined | null, limit: number, filter: String | null) => graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        query: `
            query getPatientCohortHistoryTable ($continueFromID: String, $limit: Int, $filter: String) {
            getPatientCohortHistoryTable(continueFromID: $continueFromID, limit: $limit, filter: $filter) {
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
      filter
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


export const getPatientCohortGenderChart = (filter: string) =>
  graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        query($filter: String) {
          getPatientCohortGenderChart(filter: $filter) {
            count
            label
          }
        }
      `,
      variables: {
        filter,
      },
    }),
  })
    .then((resp) => {
      if (!resp.ok) {
        throw new Error(`Error fetching data: ${resp.statusText}`);
      }
      return resp.json();
    })
    .then((result) => result.data.getPatientCohortGenderChart);

export const getPatientCohortAgeChart = (filter: string) =>
  graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        query($filter: String) {
          getPatientCohortAgeChart(filter: $filter) {
            ageAtDiagnosis
            count
          }
        }
      `,
      variables: {
        filter,
      },
    }),
  })
    .then((resp) => {
      if (!resp.ok) {
        throw new Error(`Error fetching data: ${resp.statusText}`);
      }
      return resp.json();
    })
    .then((result) => result.data.getPatientCohortAgeChart);


export const getPatientCohortDeathChart = (filter: string) => 
  graphqlFetch(dataUrl, {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
      },
      body: JSON.stringify({
          query: `
              query($filter: String) {
                  getPatientCohortDeathChart(filter: $filter) {
                      count
                      label
                  }
              }
          `,
          variables: {
              filter,
          },
      }),
  })
  .then((resp) => {
      if (!resp.ok) {
          throw new Error(`Error fetching data: ${resp.statusText}`);
      }
      return resp.json();
  })
  .then((result) => result.data.getPatientCohortDeathChart);



export const getPatientCohortMapChart = (level: string, filter: String) => graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
     },
    body: JSON.stringify({ query: `query getPatientCohortMapChart($level: cityMapping, $filter:String) {
        getPatientCohortMapChart(level: $level, filter: $filter) {
          label
          description
          count
        }
      }
    `,
      variables: {
        level,
        filter
      }
     },
     
     
     
     ),
  })
  .then(resp => resp.json() )
  .then(result => result.data.getPatientCohortMapChart)

 
export const getPatientCohortOverviewCCPTable = (continueFromID: string | undefined | null, limit: number, filter: String | null) => graphqlFetch(dataUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: `
          query getPatientCohortOverviewCCPTable ($continueFromID: String, $limit: Int, $filter: String) {
          getAllPatient(continueFromID: $continueFromID, limit: $limit, filter: $filter) {
              _id
              patID
              gender
              birthDate
              vitalDate
              vitalState
              }
          }` ,
          variables: {
            "continueFromID": continueFromID,
            "limit": limit,
            filter
          }
      }),
  })
  .then(resp => resp.json() )
  .then(result => {
      result.data.getAllPatient.forEach(element => {
          
          if(element.deathDate) element.deathDate = new Date(element.deathDate).toLocaleDateString('de-DE', localeOptions);
          if(element.birthDate) element.birthDate = new Date(element.birthDate).toLocaleDateString('de-DE', localeOptions);
          if(element.vitalDate) element.vitalDate = new Date(element.vitalDate).toLocaleDateString('de-DE', localeOptions);  
      });
      return result.data.getAllPatient
  })

  export const getPatientCohortOverviewPseudoTable = (continueFromID: string | undefined | null, limit: number, filter: String | null) => graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
            query getPatientCohortOverviewPseudoTable ($continueFromID: String, $limit: Int, $filter: String) {
            getAllPatient(continueFromID: $continueFromID, limit: $limit, filter: $filter) {
                _id
                patID
                gender
                birthDate
                postalCode
                area
                countryCode
                vitalDate
                vitalState
                }
            }` ,
            variables: {
              "continueFromID": continueFromID,
              "limit": limit,
              filter
            }
        }),
    })
    .then(resp => resp.json() )
    .then(result => {
        result.data.getAllPatient.forEach(element => {
            
            if(element.deathDate) element.deathDate = new Date(element.deathDate).toLocaleDateString('de-DE', localeOptions);
            if(element.birthDate) element.birthDate = new Date(element.birthDate).toLocaleDateString('de-DE', localeOptions);
            if(element.vitalDate) element.vitalDate = new Date(element.vitalDate).toLocaleDateString('de-DE', localeOptions);  
        });
        return result.data.getAllPatient
    })

