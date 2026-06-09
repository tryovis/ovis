import { dataUrl, graphqlFetch } from './gql-url'
const localeOptions:Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
};

export const getCategoryChart = (selectedType:string, collection:string, filter:String) => {
  filter = filter.replaceAll('"', '\\"');
  
  return graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
     },
    body: JSON.stringify({ query: `query
    {
      getCategoryChart(
        selectedType: ${selectedType},
        collection: ${collection},
        filter: "${filter}"
      ) {
        label,
        count
      }
    }` }),
  })
  .then(resp => resp.json() )
  .then(result => result.data.getCategoryChart)
}
  
  export const getTimeChart = (collection:string, group:string,datediff:boolean,eventsUsed:string,timePeriod:string, filter:String) => {
    

    filter = filter.replaceAll('"', '\\"');

    return graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
     },
    body: JSON.stringify({ query: `query
    {
      getTimeChart(
        collection: ${collection}
        group: ${group}
        datediff: ${datediff}
        eventsUsed: ${eventsUsed}
        timePeriod: ${timePeriod}
        filter: "${filter}"
      ) {
        count
        date
        label
        tumorid
      }
    }` }),
  })
  .then(resp => resp.json() )
  .then(result => result.data.getTimeChart)
}





export const getHeadlineOverview = (collection: String, filter: String | null) => {
    
  return graphqlFetch(dataUrl, {
  method: 'POST',
  headers: {
      'Content-Type': 'application/json'
  },
  body: JSON.stringify({
      query: `
    
        query getQuicktoolsCountOverview($collection: [collection]!, $filter: String) {
          getQuicktoolsCountOverview(collection: $collection, filter: $filter) {
            collection
            count
          }
       }`,
       variables: {
         "collection": collection,
         filter
    
       }
} ),
})
.then(resp => resp.json() )
.then(result => {
;
return result.data.getQuicktoolsCountOverview
})
}

export const getLastMetaData = () => {
  return graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `
        query {
          getLastMetaData {
            executedAt
          }
        }
      `
    })
  })
  .then(resp => resp.json())
  .then(result => result.data.getLastMetaData)
}