import { dataUrl, graphqlFetch } from './gql-url';

type TherapyGeneralRow = {
	therapyOccurrenceDate?: string;
	therapyEndDate?: string;
};

const localeOptions: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
};


export const getTherapyGeneralTable = (
	continueFromID: string | undefined | null,
	limit: number,
	filter: string | null
) =>
	graphqlFetch(dataUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        query: `
            query getTherapyGeneralTable ($continueFromID: String, $limit: Int, $filter:String) {
            getAllTherapies(continueFromID: $continueFromID, limit: $limit, filter:$filter) {
          _id,
          therapyID,
          patID,
					tumorID,
          generalType,
					therapyOccurrenceDate,
          therapyEndDate,
					therapyDaysSinceDiagnosis,
					intention,
          surgeryContext,
          complication {
            grade
            complication
          },
          terminationReason,
          status,
          internal,
					organizationalUnit,
					reportID
        }
  }` ,
  variables: {
    "continueFromID": continueFromID,
    "limit": limit,
    filter
  } }),
})
	.then((resp) => resp.json())
	.then((result) => {
		result.data.getAllTherapies.forEach((element: TherapyGeneralRow) => {
			if (element.therapyOccurrenceDate)
				element.therapyOccurrenceDate = new Date(element.therapyOccurrenceDate).toLocaleDateString(
					'de-DE',
					localeOptions
				);
			if (element.therapyEndDate)
				element.therapyEndDate = new Date(element.therapyEndDate).toLocaleDateString(
					'de-DE',
					localeOptions
				);
		});
		return result.data.getAllTherapies;
	});



export const getTherapyGeneralComplicationChart = (filter: string) => {
  filter = filter.replaceAll("complication_", "complication.")
  return graphqlFetch(dataUrl, {
  method: 'POST',
  headers: {
      'Content-Type': 'application/json'
  },
  body: JSON.stringify({
      query: `
      query($filter: String!) {
        getTherapyGeneralComplicationChart(filter: $filter) {
          category
          groups {
            label
            count
            description
            category
            code
          }
        }
      }
      `,
      variables: {
        filter
      }
  }),
})
.then(resp => resp.json())
.then(result => result.data.getTherapyGeneralComplicationChart);
}