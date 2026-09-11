import { dataUrl, graphqlFetch } from './gql-url';

export const getSurvivalKaplanMeierChart = (kpType: any, stratification: any, filter: String) =>
	graphqlFetch(dataUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			query: `query  getKaplanMeier($getKpType: kpType!,$getStratification: stratification!, $source: kpcol, $filter:String){
            getSurvivalKaplanMeierChart(type: $getKpType, strat: $getStratification, source: $source, filter:$filter) {
              tumorID
              dateDiff
              status
              groupe
            } 
          }`,
			variables: {
				getKpType: kpType,
				getStratification: stratification,
				source: 'prp',
				filter: filter
			}
		})
	})
		.then((resp) => resp.json())
		.then((result) => result.data.getSurvivalKaplanMeierChart);

export const getSurvivalFollowUpAssessment = (
	from: any,
	till: any,
	includeTherapy: any,
	includeVital: any,
	filter: String
) =>
	graphqlFetch(dataUrl, {
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
				from: from,
				till: till,
				includeTherapy: includeTherapy,
				includeVital: includeVital,
				filter: filter
			}
		})
	})
		.then((resp) => resp.json())
		.then((result) => result.data.getSurvivalFollowUpAssessment);

export type CoxCovariate =
	| 'age'
	| 'gender'
	| 'uicc'
	| 'tStage'
	| 'nStage'
	| 'mStage'
	| 'grading'
	| 'ecog'
	| 'diagnosisYear'
	| 'synchronousMetastasis';

export type CoxRegressionStatus = 'OK' | 'WARNING' | 'INSUFFICIENT_DATA' | 'ERROR';

export type CoxCoefficient = {
	covariate: CoxCovariate;
	term: string;
	level: string | null;
	reference: string | null;
	isReference: boolean;
	hazardRatio: number | null;
	confidenceLow: number | null;
	confidenceHigh: number | null;
	standardError: number | null;
	pValue: number | null;
};

export type CoxPhDiagnostic = {
	term: string;
	chiSquare: number | null;
	degreesOfFreedom: number | null;
	pValue: number | null;
	global: boolean;
};

export type CoxCovariateAvailability = {
	covariate: CoxCovariate;
	available: number;
	missing: number;
	percentage: number;
	levels: Array<{ value: string; count: number }>;
};

export type CoxRegressionResult = {
	status: CoxRegressionStatus;
	message: string | null;
	endpoint: 'overallSurvival';
	selectedCovariates: CoxCovariate[];
	matchingDiagnoses: number;
	indexPatients: number;
	endpointEligible: number;
	completeCases: number;
	events: number;
	censored: number;
	omittedCases: number;
	degreesOfFreedom: number;
	concordance: number | null;
	likelihoodRatioPValue: number | null;
	modelFormula: string | null;
	stratifiedByEntity: boolean;
	coefficients: CoxCoefficient[];
	phDiagnostics: CoxPhDiagnostic[];
	availability: CoxCovariateAvailability[];
	warnings: string[];
	exclusions: {
		missingSurvival: number;
		invalidTime: number;
		invalidEvent: number;
	};
};

export async function getSurvivalCoxRegression(
	covariates: CoxCovariate[],
	filter: string,
	signal?: AbortSignal
): Promise<CoxRegressionResult> {
	const response = await graphqlFetch(dataUrl, {
		signal,
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			query: `query getSurvivalCoxRegression($covariates: [CoxCovariate!]!, $filter: String) {
        getSurvivalCoxRegression(covariates: $covariates, filter: $filter) {
          status
          message
          endpoint
          selectedCovariates
          matchingDiagnoses
          indexPatients
          endpointEligible
          completeCases
          events
          censored
          omittedCases
          degreesOfFreedom
          concordance
          likelihoodRatioPValue
          modelFormula
          stratifiedByEntity
          coefficients {
            covariate
            term
            level
            reference
            isReference
            hazardRatio
            confidenceLow
            confidenceHigh
            standardError
            pValue
          }
          phDiagnostics {
            term
            chiSquare
            degreesOfFreedom
            pValue
            global
          }
          availability {
            covariate
            available
            missing
            percentage
            levels { value count }
          }
          warnings
          exclusions { missingSurvival invalidTime invalidEvent }
        }
      }`,
			variables: { covariates, filter }
		})
	});
	if (!response.ok) {
		if (response.status === 504 || response.status === 408) throw new Error('COX_TIMEOUT');
		throw new Error(`Cox regression request failed with HTTP ${response.status}.`);
	}
	const payload = await response.json();
	if (payload.errors?.length) {
		if (
			payload.errors.some(
				(error: { extensions?: { code?: string } }) => error.extensions?.code === 'COX_TIMEOUT'
			)
		) {
			throw new Error('COX_TIMEOUT');
		}
		throw new Error(payload.errors.map((error: { message: string }) => error.message).join('\n'));
	}
	if (!payload.data?.getSurvivalCoxRegression) {
		throw new Error('The Cox regression response is empty.');
	}
	return payload.data.getSurvivalCoxRegression;
}
