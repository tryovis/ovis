import { dataUrl, graphqlFetch } from './gql-url'
const localeOptions:Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
};

export const getStudyOverviewTable = (continueFromID: string | undefined | null, limit: number, filter: String | null) => graphqlFetch(dataUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: `
          query getStudyOverviewTable ($continueFromID: String, $limit: Int, $filter: String) {
          getAllStudies(continueFromID: $continueFromID, limit: $limit, filter: $filter) {
            _id
            studyID
            shortname
            status
            start
            firstPatInPlanned
            phase
            eudract
            organisationFull
            organisationShort
            studyPatients {
              patID
            }
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
      result.data.getAllStudies.forEach(element => {
          if(element.start) element.start = new Date(element.start).toLocaleDateString('de-DE', localeOptions);
          if(element.firstPatInPlanned) element.firstPatInPlanned = new Date(element.firstPatInPlanned).toLocaleDateString('de-DE', localeOptions); 
      });
      return result.data.getAllStudies
  })

  export const getStudyPatientTable = (continueFromID: string | undefined | null, limit: number, filter: String | null) => graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        query getStudyPatientTable($continueFromID: String, $limit: Int, $filter: String) {
          getAllStudies(continueFromID: $continueFromID, limit: $limit, filter: $filter) {
            _id
            studyID
            shortname
            studyPatients {
              patID
              recruitmentDate
            }
          }
        }
      `,
      variables: {
        "continueFromID": continueFromID,
        "limit": limit,
        filter
      }
    }),
  })
  .then(resp => resp.json())
  .then(result => {
    const studyPatientEntries = [];
    result.data.getAllStudies.forEach(study => {
      study.studyPatients.forEach(patient => {
        studyPatientEntries.push({
          _id: study._id, 
          studyID: study.studyID,
          shortname: study.shortname,
          patID: patient.patID,
          recruitmentDate: new Date(patient.recruitmentDate).toLocaleDateString('de-DE', localeOptions)
        });
      });
    });
    return studyPatientEntries;
  });



