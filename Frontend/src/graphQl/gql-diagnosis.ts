import { createCachedRequest } from './request-cache.js';
import { dataUrl, graphqlFetch } from './gql-url'
const localeOptions:Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
};

type DiagnosisBarChartQuery = {
  genderWise: boolean;
  group: string;
  abscissa: string;
};

type DiagnosisBarChartGroup = {
  count: number[];
  gender: string | null;
  label: string | null;
  description: string | null;
};

type DiagnosisBarChartResult = {
  category: (string | null)[];
  groups: DiagnosisBarChartGroup[];
};

  export const getDiagnosisHistologyTable = (continueFromID: string | undefined | null, limit: number, filter: string) => graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        query: `
            query getDiagnosisHistologyTable ($continueFromID: String, $limit: Int, $filter: String) {
              getDiagnosisHistologyTable(continueFromID: $continueFromID, limit: $limit, filter:$filter) {
      
        _id
        patID
        tumorID
        ICDO_histologyCode
        ICDO_histologyCodeText
        ICDO_grading
        ICDO_source
        ICDO_histologyDate
        ICDO_Nb
        ICDO_Nu
        ICDO_sNb
        ICDO_sNu
        ICDO_mixedTumor
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
  result.data.getDiagnosisHistologyTable.forEach(element => {
      if(element.ICDO_histologyDate) element.ICDO_histologyDate = new Date(element.ICDO_histologyDate).toLocaleDateString('de-DE', localeOptions);
  });
  return result.data.getDiagnosisHistologyTable
})

export const getDiagnosisDiagnosticTable = (continueFromID: string | undefined | null, limit: number, filter: string) => graphqlFetch(dataUrl, {
  method: 'POST',
  headers: {
      'Content-Type': 'application/json'
  },
  body: JSON.stringify({
      query: `
          query getDiagnosisDiagnosticTable($continueFromID: String,$limit: Int, $filter: String) {
            getDiagnosisDiagnosticTable( continueFromID: $continueFromID,limit: $limit, filter: $filter) {
              _id
              patID
              tumorID
              investigationMethod
              diagnosticOccurrenceDate
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
result.data.getDiagnosisDiagnosticTable.forEach(element => {
    if(element.diagnosticOccurrenceDate) element.diagnosticOccurrenceDate = new Date(element.diagnosticOccurrenceDate).toLocaleDateString('de-DE', localeOptions);
});
return result.data.getDiagnosisDiagnosticTable
})

const getDiagnosisBarChartCacheKey = (group: DiagnosisBarChartQuery, filter: string) =>
  JSON.stringify({ group, filter });

const cloneDiagnosisBarChartResult = (result: DiagnosisBarChartResult): DiagnosisBarChartResult => ({
  category: [...result.category],
  groups: result.groups.map((group) => ({
    ...group,
    count: [...group.count]
  }))
});

const getDiagnosisBarChartRequest = createCachedRequest(
  (_cacheKey: string, group: DiagnosisBarChartQuery, filter: string) =>
  graphqlFetch(dataUrl, {
  method: 'POST',
  headers: {
      'Content-Type': 'application/json'
   },
  body: JSON.stringify({ query: `query Query($getTumorsGroupedBy: iGroup!, $filter: String) {
    getTumors(groupedBy: $getTumorsGroupedBy, filter: $filter) {
      category
      groups {
        count
        gender
        label
        description
      }
    }
  }
  `,
    variables: {
      "getTumorsGroupedBy": group,
      filter
    }
   },
   
   
   
   ),
})
.then(resp => resp.json() )
.then((result: { data: { getTumors: DiagnosisBarChartResult } }) => result.data.getTumors)
);

export const getDiagnosisBarChart = (group: DiagnosisBarChartQuery, filter: string) =>
  getDiagnosisBarChartRequest(getDiagnosisBarChartCacheKey(group, filter), group, filter)
    .then(cloneDiagnosisBarChartResult)
