import { dataUrl, graphqlFetch } from './gql-url'
const localeOptions:Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
};


export const getTNMOverviewTable = (continueFromID: string | undefined | null, limit: number, filter: String | null) => graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        query getTNMMetastases($continueFromID: String, $limit: Int, $filter: String) {
          getTnmMetastases(continueFromID: $continueFromID, limit: $limit, filter: $filter) {
            _id
            tumorID
            tnmOccurrenceDate
            version
            type
            a
            r
            y
            preT
            T
            multipleT
            preN
            N
            Nb
            Nu
            preM
            M
            total
            RClass
            L
            V
            Pn
            S
            UICC

          }
        }
      `,
            // sN
            // sNu
            // sNb
      variables: {
        "continueFromID": continueFromID,
        "limit": limit,
        filter
      }
    }),
  })
    .then(resp => resp.json())
    .then(result => {
            result.data.getTnmMetastases.forEach(element => {    
     if(element.tnmOccurrenceDate) element.tnmOccurrenceDate = new Date(element.tnmOccurrenceDate).toLocaleDateString('de-DE', localeOptions);
    });
      return result.data.getTnmMetastases;
    });

export const getTNM3DChart = (T:string,N:string,M:string,tnmOccurrenceDate:string,type:string, filter:string) => graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
     },
    body: JSON.stringify({ query: `query 
        getTNM3DChart ($getTnmCountGroup: tnmGrouping!, $filter:String) {
            getTnmCount(group: $getTnmCountGroup, filter:$filter) {
                T
                N
                M
                count
            }
        }`,
    variables: {
        "getTnmCountGroup":{
        T,
        N,
        M,
        tnmOccurrenceDate,
        type
        }, filter
    }
    }),
})
.then(resp => resp.json() )
.then(result => result.data.getTnmCount )


export const getTNMMetastasisTable = (continueFromID: string | undefined | null, limit: number,filter: String | null) => graphqlFetch(dataUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: `
      query getTNMMetastasisTable($continueFromID: String, $limit: Int, $filter:String) {
        getTNMMetastasisTable(continueFromID: $continueFromID, limit: $limit, filter:$filter) {
          _id
          tumorID
          metastasisDate
          metastasisLocation
          type
          spread
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
          result.data.getTNMMetastasisTable.forEach(element => {    
   if(element.metastasisDate) element.metastasisDate = new Date(element.metastasisDate).toLocaleDateString('de-DE', localeOptions);
  });
    return result.data.getTNMMetastasisTable;
  });


  export const getTNMBodyMap = (art:string, filter: string) => graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
     },
    body: JSON.stringify({ query: `query 
        getTnmBodyMap ($art: art, $filter: String) {
          getTnmBodyMap(art: $art, filter:$filter) {
              label,
              count
            }
        }`,
    variables: { 
      art,
      filter
    }
    }),
})
.then(resp => resp.json() )
.then(result => result.data.getTnmBodyMap )