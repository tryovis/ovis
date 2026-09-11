<script lang="ts">
	import { Chart, registerables, type ChartConfiguration, type Plugin } from 'chart.js';
	import { onDestroy, onMount, tick } from 'svelte';
	import Headline from '../../components/Headline.svelte';
	import {
		getSurvivalCoxRegression,
		type CoxCoefficient,
		type CoxCovariate,
		type CoxRegressionResult
	} from '../../graphQl/gql-survival';
	import { addUserFilter } from '../../components/UserFilter';
	import { createTable } from '../../tableBuilder';
	import { filterActiveStore } from '../../store/filterActiveStore.js';
	import { maxStore } from '../../store/maxStore';
	import { t } from '../../store/languageStore';
	import { userStore } from '../../store/userStore';
	import { iconPath } from '$lib/path-utils';
	import { responsiveChartFontSize, usesCompactChartLayout } from '$lib/responsiveChartSizing';
	import type { LensDataPasser } from '@samply/lens';

	Chart.register(...registerables);

	type CovariateOption = {
		value: CoxCovariate;
		labelKey: string;
		descriptionKey: string;
	};

	const EMPTY_FILTER = JSON.stringify({ operand: 'OR', children: [] });
	const COEFFICIENT_TABLE_ID = 'survivalCoxRegressionTable';
	const AGE_BAND_ORDER = ['<40', '40-49', '50-59', '60-69', '70-79', '80+'];
	const LEVEL_ORDERS: Partial<Record<CoxCovariate, string[]>> = {
		age: AGE_BAND_ORDER,
		uicc: ['I', 'II', 'III', 'IV', 'other'],
		tStage: ['T1', 'T2', 'T3', 'T4', 'other'],
		nStage: ['N0', 'N1', 'N2', 'N3', 'other'],
		mStage: ['M0', 'M1', 'other']
	};
	const loadingIcon = iconPath('spinner.svg');
	const covariateOptions: CovariateOption[] = [
		{ value: 'age', labelKey: 'coxAge', descriptionKey: 'coxAgeDescription' },
		{ value: 'gender', labelKey: 'coxGender', descriptionKey: 'coxGenderDescription' },
		{ value: 'uicc', labelKey: 'coxUicc', descriptionKey: 'coxUiccDescription' },
		{ value: 'tStage', labelKey: 'coxTStage', descriptionKey: 'coxTStageDescription' },
		{ value: 'nStage', labelKey: 'coxNStage', descriptionKey: 'coxNStageDescription' },
		{ value: 'mStage', labelKey: 'coxMStage', descriptionKey: 'coxMStageDescription' },
		{ value: 'grading', labelKey: 'coxGrading', descriptionKey: 'coxGradingDescription' },
		{ value: 'ecog', labelKey: 'coxEcog', descriptionKey: 'coxEcogDescription' },
		{
			value: 'diagnosisYear',
			labelKey: 'coxDiagnosisYear',
			descriptionKey: 'coxDiagnosisYearDescription'
		},
		{
			value: 'synchronousMetastasis',
			labelKey: 'coxSynchronousMetastasis',
			descriptionKey: 'coxSynchronousMetastasisDescription'
		}
	];

	let dataPasser: LensDataPasser;
	let currentCanvas: HTMLCanvasElement;
	let chartInstance: Chart | null = null;
	let coefficientTable: any = null;
	let result: CoxRegressionResult | null = null;
	let selectedCovariate: CoxCovariate = 'age';
	let showChart = true;
	let showLogarithm = true;
	let loading = false;
	let mounted = false;
	let errorMessage = '';
	let requestId = 0;
	let modelController: AbortController | null = null;
	let modelTimer: ReturnType<typeof setTimeout> | undefined;
	let changeTimer: ReturnType<typeof setTimeout> | undefined;
	let filterActive = true;
	let primaryColor = '#0065bd';
	let maximizeSurvivalCoxRegression = false;
	let exportRows: Record<string, unknown>[] = [];
	let exportHeaders: string[] = [];
	let coxInfoTooltip = '';

	const unsubscribeFilter = filterActiveStore.subscribe((value) => {
		filterActive = value.filterActive;
	});
	const unsubscribeUser = userStore.subscribe((value: any) => {
		primaryColor = value.primaryColor || primaryColor;
	});
	const unsubscribeMax = maxStore.subscribe((value: any) => {
		maximizeSurvivalCoxRegression = value.maximizeSurvivalCoxRegression;
	});

	$: coxInfoTooltip = buildCoxInfoTooltip(selectedCovariate, result, $t);
	$: exportHeaders = [
		$t('coxTableVariable'),
		$t('coxTableLevel'),
		$t('coxTableReference'),
		$t('coxTableHazardRatio'),
		$t('coxTableConfidenceInterval'),
		$t('coxTablePValue')
	];
	$: exportRows = orderedCoefficients(result?.coefficients ?? [], selectedCovariate).map(
		(coefficient) => ({
			variable: covariateLabel(coefficient.covariate),
			level: coefficientDisplayLevel(coefficient),
			reference: coefficient.reference
				? levelLabel(coefficient.reference, coefficient.covariate)
				: '',
			hazardRatio: formatNumber(coefficient.hazardRatio),
			confidenceInterval: confidenceInterval(coefficient),
			pValue: formatPValue(coefficient.pValue)
		})
	);

	onMount(async () => {
		await import('@samply/lens');
		await tick();
		mounted = true;
		await runModel();
	});

	onDestroy(() => {
		mounted = false;
		requestId += 1;
		modelController?.abort();
		clearTimeout(modelTimer);
		clearTimeout(changeTimer);
		chartInstance?.destroy();
		coefficientTable?.destroy();
		unsubscribeFilter();
		unsubscribeUser();
		unsubscribeMax();
	});

	async function activeFilter() {
		let filter = EMPTY_FILTER;
		if (filterActive && dataPasser) {
			filter = JSON.stringify(dataPasser.getAstAPI());
		}
		return JSON.stringify(await addUserFilter(JSON.parse(filter)));
	}

	async function runModel() {
		if (!mounted) return;
		const currentRequest = ++requestId;
		modelController?.abort();
		clearTimeout(modelTimer);
		const controller = new AbortController();
		modelController = controller;
		let timedOut = false;
		modelTimer = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, 60_000);
		chartInstance?.destroy();
		chartInstance = null;
		coefficientTable?.destroy();
		coefficientTable = null;
		loading = true;
		errorMessage = '';
		result = null;
		let modelLoaded = false;
		try {
			const filter = await activeFilter();
			if (currentRequest !== requestId) return;
			const next = await getSurvivalCoxRegression([selectedCovariate], filter, controller.signal);
			if (currentRequest !== requestId) return;
			result = next;
			modelLoaded = true;
			if (next.status === 'ERROR') errorMessage = next.message || $t('coxGenericError');
		} catch (error) {
			if (currentRequest !== requestId) return;
			errorMessage =
				timedOut || (error instanceof Error && error.message === 'COX_TIMEOUT')
					? $t('coxTimeout')
					: error instanceof Error
					? error.message
					: $t('coxGenericError');
			result = null;
			chartInstance?.destroy();
			chartInstance = null;
			console.error('Could not calculate Cox regression:', error);
		} finally {
			if (currentRequest === requestId) {
				loading = false;
				clearTimeout(modelTimer);
			}
		}
		if (modelLoaded && currentRequest === requestId) {
			await tick();
			if (showChart) renderChart();
			else renderCoefficientTable();
		}
	}

	function handleCovariateChange(event: Event) {
		selectedCovariate = (event.currentTarget as HTMLSelectElement).value as CoxCovariate;
		requestId += 1;
		modelController?.abort();
		clearTimeout(modelTimer);
		clearTimeout(changeTimer);
		loading = true;
		result = null;
		errorMessage = '';
		changeTimer = setTimeout(() => void runModel(), 200);
	}

	function handleMaximized(event: CustomEvent<{ headlineMaximize: boolean }>) {
		maximizeSurvivalCoxRegression = event.detail.headlineMaximize;
		maxStore.update((storeValues) => ({
			...storeValues,
			maximizeSurvivalCoxRegression
		}));
		setTimeout(() => {
			chartInstance?.resize();
			coefficientTable?.columns.adjust().draw(false);
		}, 0);
	}

	function handleChartToggled(event: CustomEvent<{ headlineShowChart: boolean }>) {
		showChart = event.detail.headlineShowChart;
		if (showChart) {
			coefficientTable?.destroy();
			coefficientTable = null;
			setTimeout(renderChart, 0);
		} else {
			setTimeout(renderCoefficientTable, 0);
		}
	}

	function handleLogarithmToggled(event: CustomEvent<{ headlineInitialLogarithm: boolean }>) {
		showLogarithm = event.detail.headlineInitialLogarithm;
		renderChart();
	}

	function escapeHtml(value: string) {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;');
	}

	function buildCoxInfoTooltip(
		covariate: CoxCovariate,
		model: CoxRegressionResult | null,
		translate: (key: string) => string
	) {
		const option = covariateOptions.find((entry) => entry.value === covariate);
		const label = option ? translate(option.labelKey) : covariate;
		const description = option ? translate(option.descriptionKey) : '';
		const parts = [
			`<p><b>${escapeHtml(translate('coxRegressionTitle'))}</b><hr></p>`,
			`<p><i>${escapeHtml(translate('coxTooltip'))}</i></p>`,
			'<hr>',
			`<p style="text-align: left;"><b>${escapeHtml(translate('coxEndpoint'))}:</b> ${escapeHtml(
				translate('overallSurvival')
			)}<br><br><b>${escapeHtml(label)}</b><br>${escapeHtml(description)}`
		];

		const availability = model?.availability?.find((entry) => entry.covariate === covariate);
		if (availability) {
			parts.push(
				`<br>${escapeHtml(translate('coxAvailability'))}: ${availability.available}/${
					model?.endpointEligible ?? 0
				} (${formatNumber(availability.percentage, 0)} %)</p>`
			);
		} else {
			parts.push('</p>');
		}

		if (model) {
			const missingCovariate = Math.max(0, model.endpointEligible - model.completeCases);
			const omittedReasons = [
				`${translate('coxOmittedMissingSurvival')}: ${model.exclusions.missingSurvival}`,
				`${translate('coxOmittedInvalidTime')}: ${model.exclusions.invalidTime}`,
				`${translate('coxOmittedInvalidEvent')}: ${model.exclusions.invalidEvent}`,
				`${translate('coxOmittedMissingCovariate')}: ${missingCovariate}`
			];
			parts.push(
				'<hr>',
				`<p style="text-align: left;"><b>${escapeHtml(translate('coxOmitted'))}: ${
					model.omittedCases
				}</b><br>${escapeHtml(omittedReasons.join(' · '))}</p>`,
				`<p style="text-align: left;"><b>${escapeHtml(translate('coxConcordance'))}: ${escapeHtml(
					formatNumber(model.concordance, 3)
				)}</b> — ${escapeHtml(translate('coxCIndexShort'))}</p>`
			);
		}

		parts.push(
			'<hr>',
			`<p style="text-align: left;">R: <i>survival</i> 3.8-11 (CRAN)<br><a href="cox-regression-definition">${escapeHtml(
				translate('coxDetailsLink')
			)}</a></p>`
		);

		if (model?.warnings?.length) {
			parts.push(
				'<hr>',
				`<p style="text-align: left;"><b>${escapeHtml(translate('coxWarnings'))} (${
					model.warnings.length
				})</b>`,
				...model.warnings.map((warning) => `<br>${escapeHtml(warning)}`),
				'</p>'
			);
		}

		if (model?.phDiagnostics?.length) {
			parts.push(
				'<hr>',
				`<p style="text-align: left;"><b>${escapeHtml(translate('coxPhDiagnostics'))}</b>`
			);
			for (const diagnostic of model.phDiagnostics) {
				const diagnosticLabel = diagnostic.global ? translate('coxGlobal') : label;
				parts.push(
					`<br>${escapeHtml(diagnosticLabel)}: p ${escapeHtml(formatPValue(diagnostic.pValue))}`
				);
			}
			parts.push('</p>');
		}

		parts.push('<hr>', `<p><i>${escapeHtml(translate('infoButton'))}</i></p>`);

		return parts.join('');
	}

	function orderedCoefficients(coefficients: CoxCoefficient[], covariate: CoxCovariate) {
		if (covariate === 'diagnosisYear') {
			return [...coefficients].sort(
				(left, right) => Number(left.level ?? 0) - Number(right.level ?? 0)
			);
		}
		const order = LEVEL_ORDERS[covariate];
		if (!order) return coefficients;
		return [...coefficients].sort(
			(left, right) => order.indexOf(left.level ?? '') - order.indexOf(right.level ?? '')
		);
	}

	function covariateLabel(covariate: CoxCovariate | string) {
		const option = covariateOptions.find((entry) => entry.value === covariate);
		return option ? $t(option.labelKey) : covariate;
	}

	function levelLabel(level: string | null, covariate?: CoxCovariate | string) {
		if (!level) return '';
		if (
			level === 'other' &&
			['uicc', 'tStage', 'nStage', 'mStage'].includes(String(covariate ?? ''))
		) {
			return $t('coxLevelOtherStage');
		}
		const translations: Record<string, string> = {
			female: $t('coxLevelFemale'),
			male: $t('coxLevelMale'),
			diverse: $t('coxLevelDiverse'),
			other: $t('coxLevelOther'),
			lowGrade: $t('coxLevelLowGrade'),
			intermediateGrade: $t('coxLevelIntermediateGrade'),
			highGrade: $t('coxLevelHighGrade'),
			present: $t('coxLevelMetastasisPresent'),
			absent: $t('coxLevelMetastasisAbsent')
		};
		return translations[level] ?? level;
	}

	function coefficientDisplayLevel(coefficient: CoxCoefficient) {
		const label = levelLabel(coefficient.level, coefficient.covariate);
		return coefficient.isReference ? `${label} (${$t('coxReferenceShort')})` : label;
	}

	function coefficientLabel(coefficient: CoxCoefficient) {
		return coefficientDisplayLevel(coefficient);
	}

	function formatNumber(value: number | null, digits = 2) {
		if (value === null || !Number.isFinite(value)) return '–';
		return value.toLocaleString(undefined, { maximumFractionDigits: digits });
	}

	function formatPValue(value: number | null) {
		if (value === null || !Number.isFinite(value)) return '–';
		if (value < 0.001) return '< 0.001';
		return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
	}

	function confidenceInterval(coefficient: CoxCoefficient) {
		if (coefficient.isReference) return $t('coxReference');
		if (coefficient.confidenceLow === null || coefficient.confidenceHigh === null) return '–';
		return `${formatNumber(coefficient.confidenceLow)}–${formatNumber(coefficient.confidenceHigh)}`;
	}

	function chartRows() {
		return orderedCoefficients(result?.coefficients ?? [], selectedCovariate).filter(
			(coefficient) =>
				coefficient.hazardRatio !== null &&
				Number.isFinite(coefficient.hazardRatio) &&
				coefficient.hazardRatio > 0
		);
	}

	function chartMinimumHeight() {
		return Math.max(180, chartRows().length * 26 + 54);
	}

	function xExtent(rows: CoxCoefficient[]) {
		const values = rows.flatMap((row) =>
			[row.hazardRatio, row.confidenceLow, row.confidenceHigh].filter(
				(value): value is number => value !== null && Number.isFinite(value) && value > 0
			)
		);
		if (values.length === 0) return { min: 0.5, max: 2 };
		const minimum = Math.min(...values, 1);
		const maximum = Math.max(...values, 1);
		if (showLogarithm) {
			return {
				min: Math.max(0.001, 10 ** Math.floor(Math.log10(minimum) - 0.15)),
				max: Math.min(1000, 10 ** Math.ceil(Math.log10(maximum) + 0.15))
			};
		}
		return { min: Math.max(0, minimum * 0.8), max: maximum * 1.2 };
	}

	const forestIntervals: Plugin<'scatter'> = {
		id: 'coxForestIntervals',
		beforeDatasetsDraw(chart) {
			const rows = chartRows();
			const { ctx, chartArea, scales } = chart;
			const xScale = scales.x;
			const yScale = scales.y;
			if (!xScale || !yScale || !chartArea) return;

			ctx.save();
			ctx.beginPath();
			ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
			ctx.clip();
			const referenceX = xScale.getPixelForValue(1);
			ctx.strokeStyle = '#777';
			ctx.lineWidth = 1;
			ctx.setLineDash([4, 4]);
			ctx.beginPath();
			ctx.moveTo(referenceX, chartArea.top);
			ctx.lineTo(referenceX, chartArea.bottom);
			ctx.stroke();
			ctx.setLineDash([]);

			ctx.strokeStyle = primaryColor;
			ctx.lineWidth = 1.5;
			rows.forEach((row, index) => {
				if (
					row.isReference ||
					row.confidenceLow === null ||
					row.confidenceHigh === null ||
					row.confidenceLow <= 0 ||
					row.confidenceHigh <= 0
				)
					return;
				const y = yScale.getPixelForValue(index);
				const low = xScale.getPixelForValue(row.confidenceLow);
				const high = xScale.getPixelForValue(row.confidenceHigh);
				ctx.beginPath();
				ctx.moveTo(low, y);
				ctx.lineTo(high, y);
				ctx.moveTo(low, y - 4);
				ctx.lineTo(low, y + 4);
				ctx.moveTo(high, y - 4);
				ctx.lineTo(high, y + 4);
				ctx.stroke();
			});
			ctx.restore();
		}
	};

	function renderChart() {
		if (!currentCanvas || !showChart) return;
		chartInstance?.destroy();
		chartInstance = null;
		const rows = chartRows();
		if (rows.length === 0) return;
		const extent = xExtent(rows);
		const compact = usesCompactChartLayout();

		chartInstance = new Chart(currentCanvas, {
			type: 'scatter',
			plugins: [forestIntervals],
			data: {
				datasets: [
					{
						label: $t('coxHazardRatio'),
						data: rows.map((row, index) => ({ x: row.hazardRatio as number, y: index })),
						backgroundColor: primaryColor,
						borderColor: primaryColor,
						pointRadius: (context) => (rows[context.dataIndex]?.isReference ? 3 : 5),
						pointHoverRadius: 7,
						pointStyle: (context) => (rows[context.dataIndex]?.isReference ? 'line' : 'rect')
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: false,
				layout: { padding: { left: compact ? 0 : 4, right: 8, top: 4, bottom: 0 } },
				plugins: {
					legend: { display: false },
					tooltip: {
						callbacks: {
							title: (items) => coefficientLabel(rows[items[0].dataIndex]),
							label: (context) => {
								const row = rows[context.dataIndex];
								return row.isReference
									? $t('coxReference')
									: `HR ${formatNumber(row.hazardRatio)} (95% CI ${confidenceInterval(
											row
									  )}), p ${formatPValue(row.pValue)}`;
							}
						}
					}
				},
				scales: {
					x: {
						type: showLogarithm ? 'logarithmic' : 'linear',
						min: extent.min,
						max: extent.max,
						title: { display: true, text: $t('coxHazardRatio') },
						ticks: { font: { size: responsiveChartFontSize() } },
						grid: { color: 'rgba(128, 128, 128, 0.15)' }
					},
					y: {
						type: 'category',
						labels: rows.map(coefficientLabel),
						offset: true,
						reverse: false,
						ticks: {
							autoSkip: false,
							font: { size: responsiveChartFontSize() }
						},
						grid: { display: false }
					}
				}
			}
		} as ChartConfiguration<'scatter'>);
	}

	function renderCoefficientTable() {
		if (showChart || !result?.coefficients?.length || exportRows.length === 0) return;
		coefficientTable?.destroy();
		coefficientTable = createTable(
			'coxRegression',
			dataPasser,
			COEFFICIENT_TABLE_ID,
			exportRows,
			[
				{ data: 'variable' },
				{ data: 'level' },
				{ data: 'reference' },
				{ data: 'hazardRatio' },
				{ data: 'confidenceInterval' },
				{ data: 'pValue' }
			],
			20,
			0,
			'asc',
			false
		);
	}
</script>

<div
	class="cox-root"
	class:maximized={maximizeSurvivalCoxRegression}
	style={`--primary-color: ${primaryColor}`}
>
	<Headline
		headlineTitle={$t('coxRegressionTitle')}
		headlineStatus="(Testing)"
		headlineTooltip={coxInfoTooltip}
		headlineMaximize={maximizeSurvivalCoxRegression}
		headlineShowChart={showChart}
		headlineIsChart={true}
		headlineInitialTop5={null}
		headlineInitialLogarithm={showLogarithm}
		headlineInputTableData={exportRows}
		headlineInputTableHeader={exportHeaders}
		headlineInputTableFields={[
			'variable',
			'level',
			'reference',
			'hazardRatio',
			'confidenceInterval',
			'pValue'
		]}
		headlineChartJSElement={currentCanvas}
		headlineD3Element={null}
		on:chartToggled={handleChartToggled}
		on:logarithmToggled={handleLogarithmToggled}
		on:maximized={handleMaximized}
	/>

	<lens-data-passer bind:this={dataPasser} />

	<div class="straight-line-container cox-controls">
		<div class="dropdown-container">
			<div class="stratification-control">
				<label for="cox-stratification">{$t('stratification')}:</label>
				<div class="dropdown">
					<select
						id="cox-stratification"
						class="dropbtn"
						value={selectedCovariate}
						on:change={handleCovariateChange}
					>
						{#each covariateOptions as option (option.value)}
							<option class="dropdown-option" value={option.value}>{$t(option.labelKey)}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>
	</div>

	{#if errorMessage}
		<div class="message error" role="alert">{errorMessage}</div>
	{:else if result?.status === 'INSUFFICIENT_DATA'}
		<div class="message warning" role="status">{result.message || $t('coxInsufficientData')}</div>
	{/if}

	<div class="result-area">
		{#if loading}
			<div class="bigSpinnerContainer cox-loading" role="status" aria-label={$t('coxCalculating')}>
				<button class="bigSpinnerButton" type="button" disabled>
					<img class="bigSpinner" id="spinner" src={loadingIcon} alt="" />
				</button>
			</div>
		{:else if showChart}
			{#if chartRows().length > 0}
				<div class="chart-container">
					<div class="chart-canvas-wrap" style={`min-height: ${chartMinimumHeight()}px`}>
						<canvas bind:this={currentCanvas} />
					</div>
				</div>
			{:else if !errorMessage && result?.status !== 'INSUFFICIENT_DATA'}
				<div class="empty-state">{$t('coxNoCoefficients')}</div>
			{/if}
		{:else if result?.coefficients?.length}
			<div class="data-table cox-table-wrap">
				<table id={COEFFICIENT_TABLE_ID} class="display" style="width:100%">
					<thead>
						<tr>
							<th>{$t('coxTableVariable')}</th>
							<th>{$t('coxTableLevel')}</th>
							<th>{$t('coxTableReference')}</th>
							<th>{$t('coxTableHazardRatio')}</th>
							<th>{$t('coxTableConfidenceInterval')}</th>
							<th>{$t('coxTablePValue')}</th>
						</tr>
					</thead>
				</table>
			</div>
		{/if}
	</div>

	{#if result && result.status !== 'ERROR'}
		<div class="model-summary">
			<span><b>{$t('coxPatients')}:</b> {result.completeCases}/{result.indexPatients}</span>
			<span><b>{$t('coxEvents')}:</b> {result.events}</span>
			<span><b>{$t('coxCensored')}:</b> {result.censored}</span>
			<span><b>{$t('coxOmitted')}:</b> {result.omittedCases}</span>
			<span><b>{$t('coxConcordance')}:</b> {formatNumber(result.concordance, 3)}</span>
		</div>
	{/if}
</div>

<style>
	@import 'datatables.net-dt/css/jquery.dataTables.css';

	.cox-root {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	.cox-controls {
		flex: 0 0 auto;
		justify-content: flex-start;
		gap: 6px;
		margin-block: 2px 3px;
		font-size: 0.78rem;
	}

	.dropdown-container {
		display: flex;
		flex: 0 1 360px;
		margin-right: 10px;
	}

	.dropdown-container > div {
		display: flex;
		align-items: center;
		flex: 1;
		margin-right: 10px;
		white-space: nowrap;
	}

	.model-summary {
		display: flex;
		flex: 0 0 auto;
		flex-wrap: wrap;
		gap: 4px 12px;
		padding: 3px 8px;
		border-top: 1px solid rgba(128, 128, 128, 0.25);
		font-size: 0.72rem;
		font-style: italic;
		background: transparent;
	}

	.message {
		margin: 5px 8px;
		padding: 6px 8px;
		border-radius: 4px;
		font-size: 0.78rem;
	}

	.message.error {
		background: rgba(190, 30, 45, 0.12);
		color: #9d1725;
	}

	.message.warning {
		background: rgba(224, 145, 0, 0.12);
		color: #765000;
	}

	.result-area {
		position: relative;
		display: flex;
		flex: 1 1 auto;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	.chart-container,
	.cox-table-wrap {
		flex: 1 1 auto;
		width: 100%;
		min-width: 0;
		min-height: 0;
		overflow: auto;
		padding: 2px 6px 6px;
	}

	.chart-canvas-wrap {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.chart-canvas-wrap canvas {
		display: block;
		width: 100% !important;
		height: 100% !important;
	}

	.cox-table-wrap {
		font-size: 0.76rem;
	}

	.empty-state {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: #666;
	}

	.cox-loading {
		flex: 1 1 auto;
		width: 100%;
		height: 100%;
	}

	@media (max-height: 700px), (max-width: 900px) {
		.cox-controls {
			padding-block: 3px;
		}
	}
</style>
