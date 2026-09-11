import { dataUrl, graphqlFetch } from './gql-url'
const localeOptions:Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
};

export const getStudyPatientChart = async (filter: string | null) => {
  const response = await graphqlFetch(dataUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `
        query getStudyPatientChart($filter: String) {
          getStudyPatientChart(filter: $filter) {
            shortname
            studyPatients
          }
        }
      `,
      variables: { filter }
    })
  });
  if (!response.ok) throw new Error(`Study chart request failed (${response.status})`);
  const result = await response.json();
  if (result.errors?.length || !Array.isArray(result.data?.getStudyPatientChart)) {
    throw new Error('Study chart query failed');
  }
  return result.data.getStudyPatientChart;
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
          getStudyPatientTable(continueFromID: $continueFromID, limit: $limit, filter: $filter) {
            _id
            studyID
            shortname
            patID
            recruitmentDate
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
    result.data.getStudyPatientTable.forEach(element => {
      if(element.recruitmentDate) element.recruitmentDate = new Date(element.recruitmentDate).toLocaleDateString('de-DE', localeOptions);
    });
    return result.data.getStudyPatientTable;
  });


