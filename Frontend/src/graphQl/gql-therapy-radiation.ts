import { dataUrl, graphqlFetch } from './gql-url'
const localeOptions:Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
};


  export const getTherapyRadiationTable = (continueFromID: string | undefined | null, limit: number, filter: String | null) => {
    
    return graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        query: `
      
            query getTherapyRadiationTable($continueFromID: String, $limit: Int, $filter: String) {
            getTherapyRadiationTable(continueFromID: $continueFromID, limit: $limit, filter: $filter) {
              _id
              therapyID
              tumorID
              therapyOccurrenceDate
              therapyDaysSinceDiagnosis
              combination
              radiation_totalDose: totalDose
              totalDoseUnit
              radiation_type: type
              radiation_brachyType: brachyType
              radiation_tech: tech
              radiation_radioType: radioType
              radiation_radioNuclid: radioNuclid
              radiation_radioTarget: radioTarget
              radiation_singleDose: singleDose
              radiation_singleDoseUnit: singleDoseUnit
              radiation_subArea: subArea
              radiation_boost: boost
              radiation_side: side
              radiation_tumor: tumor
              radiation_metastasis: metastasis
              radiation_lymphNodes: lymphNodes
              radiation_breath: breath
              radiation_stereo: stereo
              radiation_performance: performance
              radiation_duration: duration
              radiation_areaDetailed: areaDetailed
            }
         }`,
         variables: {
           "continueFromID": continueFromID,
           "limit": limit,
           filter
      
         }
  } ),
})
.then(resp => resp.json() )
.then(result => {
  result.data.getTherapyRadiationTable.forEach(element => {
      
      if(element.therapyOccurrenceDate) element.therapyOccurrenceDate = new Date(element.therapyOccurrenceDate).toLocaleDateString('de-DE', localeOptions);
      //if(element.therapyEndDate) element.therapyEndDate = new Date(element.therapyEndDate).toLocaleDateString('de-DE', localeOptions);
  });
  return result.data.getTherapyRadiationTable
})
}


export const getTherapyRadiationMap = (level:string, filter: String) => { 

  return graphqlFetch(dataUrl, {
  method: 'POST',
  headers: {
      'Content-Type': 'application/json'
   },
  body: JSON.stringify({ query: `query 
      getTherapyRadiationMap ($level: radiationMapping, $filter: String) {
        getTherapyRadiationMap(level: $level, filter: $filter) {
            label,
            count,
            description
          }
      }`,
  variables: { 
    level,
    filter
   }
  }),
})
.then(resp => resp.json() )
.then(result => result.data.getTherapyRadiationMap )
}