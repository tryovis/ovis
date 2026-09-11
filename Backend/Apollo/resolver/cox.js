const { filter2match } = require('../astTranslator');
const { DEFAULT_BASELINE_WINDOW, loadCoxDataset, normalizeCovariates } = require('./coxData');
const { fitCoxModel } = require('./coxService');
const { COX_TIMEOUT_MS, coxTimeoutError, createCoxDeadline } = require('./coxDeadline');

const EMPTY_FILTER = JSON.stringify({ operand: 'OR', children: [] });

const positiveInteger = (value, fallback) => {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const baselineWindow = () => ({
	beforeDays: positiveInteger(
		process.env.COX_BASELINE_DAYS_BEFORE,
		DEFAULT_BASELINE_WINDOW.beforeDays
	),
	afterDays: positiveInteger(process.env.COX_BASELINE_DAYS_AFTER, DEFAULT_BASELINE_WINDOW.afterDays)
});

// Column arrays avoid repeating keys for every patient and are parsed directly as R vectors.
const prepareRowsForR = (rows, covariates) => {
	const columns = {};
	for (const key of ['time', 'event', ...covariates]) {
		columns[key] = rows.map((row) => row[key] ?? null);
	}
	return columns;
};

const emptyResult = ({
	status = 'INSUFFICIENT_DATA',
	message,
	covariates,
	dataset,
	warnings = []
}) => ({
	status,
	message,
	endpoint: 'overallSurvival',
	selectedCovariates: covariates,
	matchingDiagnoses: dataset.matchingDiagnoses,
	indexPatients: dataset.indexPatients,
	endpointEligible: dataset.rows.length,
	completeCases: 0,
	events: 0,
	censored: 0,
	omittedCases: dataset.indexPatients,
	degreesOfFreedom: 0,
	concordance: null,
	likelihoodRatioPValue: null,
	modelFormula: null,
	stratifiedByEntity: false,
	coefficients: [],
	phDiagnostics: [],
	availability: dataset.availability,
	warnings,
	exclusions: dataset.exclusions
});

async function getSurvivalCoxRegression(_parent, { covariates, filter }, context) {
	const deadline = createCoxDeadline();
	let timer;
	try {
		return await Promise.race([
			calculateModel(covariates, filter, context, deadline),
			new Promise((_, reject) => {
				timer = setTimeout(() => reject(coxTimeoutError()), COX_TIMEOUT_MS);
			})
		]);
	} catch (error) {
		if (error?.code === 50 || error?.codeName === 'MaxTimeMSExpired') throw coxTimeoutError();
		throw error;
	} finally {
		clearTimeout(timer);
	}
}

async function calculateModel(covariates, filter, context, deadline) {
	const selectedCovariates = normalizeCovariates(covariates);
	const diagnosisCollection = context.collections.diagnosis;
	const filterStages =
		filter && filter !== EMPTY_FILTER
			? await filter2match({ value: filter, column: diagnosisCollection, db: context.db })
			: [];
	const dataset = await loadCoxDataset(
		context.db,
		context.collections,
		filterStages,
		baselineWindow(),
		selectedCovariates,
		deadline
	);

	if (dataset.rows.length === 0) {
		return emptyResult({
			message: 'No patients with a valid overall-survival interval remain in the filtered cohort.',
			covariates: selectedCovariates,
			dataset
		});
	}

	deadline.remaining();
	const rowsForR = prepareRowsForR(dataset.rows, selectedCovariates);
	const model = await fitCoxModel(
		{ rows: rowsForR, covariates: selectedCovariates },
		{ timeoutMs: deadline.remaining() }
	);
	const exclusions = Object.values(dataset.exclusions).reduce((sum, count) => sum + count, 0);
	const warnings = [...(model.warnings ?? [])];
	if (exclusions > 0) {
		warnings.unshift(
			`${exclusions} index patient(s) were excluded because the overall-survival interval was unavailable or invalid.`
		);
	}
	if (dataset.matchingDiagnoses > dataset.indexPatients) {
		warnings.unshift(
			`${
				dataset.matchingDiagnoses - dataset.indexPatients
			} additional matching diagnosis record(s) were removed by the one-index-tumor-per-patient rule.`
		);
	}
	const status = model.status === 'OK' && warnings.length > 0 ? 'WARNING' : model.status;

	return {
		...model,
		status,
		endpoint: 'overallSurvival',
		selectedCovariates,
		matchingDiagnoses: dataset.matchingDiagnoses,
		indexPatients: dataset.indexPatients,
		endpointEligible: dataset.rows.length,
		omittedCases: Math.max(0, dataset.indexPatients - Number(model.completeCases ?? 0)),
		availability: dataset.availability,
		warnings,
		exclusions: dataset.exclusions
	};
}

module.exports = {
	Query: { getSurvivalCoxRegression }
};

Object.defineProperty(module.exports, 'internal', {
	value: { baselineWindow, emptyResult, prepareRowsForR }
});
