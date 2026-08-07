<script lang="ts">
	// @ts-nocheck
	import { Chart, registerables } from 'chart.js';
	import type { ChartConfiguration } from 'chart.js';
	import { onMount } from 'svelte';
	import { getPatientCohortDeathChart } from '../../graphQl/gql-patient-cohort';
	import Headline from '../../components/Headline.svelte';
	import { createTable, changeRowCount } from '../../tableBuilder';
	import { maxStore } from '../../store/maxStore';
	import { userStore } from '../../store/userStore';
	import { get } from 'svelte/store';
	import { t } from '../../store/languageStore';
	import type { LensDataPasser } from '@samply/lens';
	import { variantStore } from '../../store/variantStore.js';
	import { configStore } from '../../store/configStore'; // ConfigStore importieren
	import { reloadOnly } from '../../store/reloadStore';
	import { filterActiveStore } from '../../store/filterActiveStore.js';
	import { addUserFilter } from '../../components/UserFilter';
	import type { AggregatedValue } from '../../types/query';
	import {
		responsiveLegendLabels,
		usesMobileLandscapeLayout
	} from '$lib/responsiveChartSizing';

	// Reactive translation function
	const translate = (key: string): string => get(t)(key);

	let filterActive = true;

	// Abonnieren des filterActiveStore und den Wert aktualisieren
	filterActiveStore.subscribe((value) => {
		filterActive = value.filterActive; // Hier den Wert direkt zuweisen
	});

	let isCCP: boolean;
	variantStore.subscribe((value: { isCCP: boolean }) => {
		({ isCCP } = value);
	});

	let showChart: boolean;
	let showLogarithm: boolean;

	configStore.subscribe((value: { patientCohortDeathChartShowChart: boolean; patientCohortDeathChartShowLogarithm: boolean }) => {
		showChart = value.patientCohortDeathChartShowChart; // Initialisierung der `showChart`-Variable
		showLogarithm = value.patientCohortDeathChartShowLogarithm; // Initialisierung der `showLogarithm`-Variable
	});

	let dataPasser: LensDataPasser;

	let colorPalette: string[];

	userStore.subscribe((value: { colorPalette: string[] }) => {
		({ colorPalette } = value);
	});

	let aspectRatio = 1.8;

	function shouldFillContainer(): boolean {
		return !maximizePatientCohortDeathChart;
	}

	function chartAspectRatio(): number {
		if (usesMobileLandscapeLayout() && !maximizePatientCohortDeathChart) return 2.25;
		if (!maximizePatientCohortDeathChart) return 1;
		return aspectRatio;
	}

	// Access the store variables
	let maximizePatientCohortDeathChart: boolean;
	maxStore.subscribe((value: { maximizePatientCohortDeathChart: boolean }) => {
		({ maximizePatientCohortDeathChart } = value);
	});
	function handleMaximized(event: { detail: { headlineMaximize: boolean } }) {
		maximizePatientCohortDeathChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizePatientCohortDeathChart = !storeValues.maximizePatientCohortDeathChart;
			return storeValues; // Return the updated values
		});
		setTimeout(() => {
			if (maximizePatientCohortDeathChart) {
				aspectRatio = 2.1;
				changeRowCount(deathChartTable, tableShownRowsMax);
			} else {
				aspectRatio = 1.8;
				if (isCCP) {
					aspectRatio = 1.1;
				}
				changeRowCount(deathChartTable, tableShownRows);
			}
		}, 0);
	}

	Chart.register(...registerables);

	let pieChart: HTMLCanvasElement;
	let chartInstance: Chart;

	let deathChartTable: unknown;
	let tableShownRows = 3;
	let tableShownRowsMax = 20;
	let sortingIndex = 1;

	type PatientDeathChart = { label: string[]; count: number[] };
	let inputArray: PatientDeathChart = {
		label: [],
		count: []
	};
	let columns = [{ data: 'vitalState' }, { data: 'count' }];
	let headers = [translate('deathStatus'), translate('count')];

	let mounted = false;

	function isMounted() {
		return mounted;
	}

	$: {
		showLogarithm;
		aspectRatio;
		if (isMounted()) {
			createPieChart();
		}
	}

	let tableData: { vitalState: string; count: number }[];
	let filter = JSON.stringify({ operand: 'OR', children: [] });

	onMount(async () => {
		await import('@samply/lens');

		if (filterActive) {
			filter = JSON.stringify(dataPasser.getAstAPI());
		}
		filter = JSON.stringify(await addUserFilter(JSON.parse(filter)));

		if (isCCP) {
			aspectRatio = 1.1;
		}

		const result = await getPatientCohortDeathChart(filter);
		inputArray = result;

		tableData = inputArray.label.map((label, index) => ({
			vitalState: label,
			count: inputArray.count[index]
		}));

		createPieChart();

		deathChartTable = createTable(
			'patient',
			dataPasser,
			'deathChartTable',
			tableData,
			columns,
			tableShownRows,
			sortingIndex
		);

		mounted = true;
	});

	type QueryItem = {
		id: string;
		key: string;
		name: string;
		type: string;
		system?: string;
		values: QueryValue[];
		description?: string;
	};

	type QueryValue = {
		name: string;
		value: string | { min: number; max: number } | AggregatedValue[][];
		queryBindId: string;
		description?: string;
	};

	const addItem = (queryObject: QueryItem): void => {
		console.log('ADD ITEM', queryObject);
		dataPasser.addStratifierToQueryAPI({
			label: queryObject.values[0].value,
			catalogueGroupCode: queryObject.key,
			parentGroupCode: 'patient'
		});
		console.log(dataPasser.getQueryAPI());
		console.log('AFTER ADD ITEM');
	};

	function compactVitalStatusLegendLabel(label: unknown): string {
		const text = String(label ?? '');
		const detailStart = text.indexOf(' (');

		if (detailStart > 0) {
			const title = text.slice(0, detailStart);
			const detail = text.slice(detailStart + 2).replace(/\)$/, '');
			const separator = detail.lastIndexOf(':');
			const status = separator >= 0 ? detail.slice(separator + 1).trim() : detail;
			return `${title}: ${status}`;
		}

		return text;
	}

	function createPieChart() {
		getPatientCohortDeathChart(filter).then((result) => {
			inputArray = result;
			let ctx = pieChart.getContext('2d');

			// Logarithmisch transformiere die Daten in der createPieChart-Methode
			const transformedData = inputArray.label.map((label, index) => ({
				label,
				count: Math.log(inputArray.count[index]), // Hier wird der Logarithmus angewendet
				originalCount: inputArray.count[index] // Ursprünglicher Wert speichern
			}));

			// Runde die logarithmisch transformierten Werte auf 2 Nachkommastellen
			transformedData.forEach((item) => {
				item.count = parseFloat(item.count.toFixed(2));
			});

			const chartConfig: ChartConfiguration = {
				type: 'pie',
				data: {
					labels: transformedData.map((item) => item.label),
					datasets: [
						{
							data: showLogarithm ? transformedData.map((item) => item.count) : inputArray.count,
							backgroundColor: colorPalette
						}
					]
				},
				options: {
					responsive: true,
					maintainAspectRatio: !shouldFillContainer(),
					aspectRatio: chartAspectRatio(),
					plugins: {
						legend: {
							display: maximizePatientCohortDeathChart,
							position: isCCP ? 'top' : 'right',
							labels: {
								...responsiveLegendLabels(),
								boxWidth: 20,
								boxHeight: 8,
								padding: 8,
								font: {
									...responsiveLegendLabels().font,
									size: 10,
									weight: 'normal'
								}
							}
						},
						tooltip: {
							callbacks: {
								label: (context) => {
									const dataItem = transformedData[context.dataIndex];
									const logarithmTooltip = showLogarithm ? ` (log: ${dataItem.count})` : '';
									return ` ${translate('count')}: ${dataItem.originalCount}` + logarithmTooltip;
								}
							}
						}
					},
					onClick: (event, elements) => {
						if (elements.length > 0) {
							const elementIndex = elements[0].index;

							// Label holen (Chart.js kann string | string[] liefern)
							const raw = chartConfig.data.labels?.[elementIndex] as unknown;
							const label = Array.isArray(raw) ? raw.join(' ') : (raw as string | null | undefined);

							// Nur beim Klick normalisieren: null/undefined/"null" -> "-"
							const normalizeForClick = (v: string | null | undefined) =>
								v == null || (typeof v === 'string' && v.trim().toLowerCase() === 'null') ? '-' : v;

							const valueForQuery = normalizeForClick(label);

							// (optional) ursprünglichen Count, falls du ihn brauchst:
							// const value = chartConfig.data.datasets[0].data[elementIndex];

							const queryItem = {
								id: 'Random generierte UUID',
								key: 'vitalState',
								name: 'childCategorie.name',
								type: 'EQUALS',
								system: 'patient',
								values: [
									{
										name: 'test',
										value: valueForQuery, // <- hier jetzt "-" wenn das Label null war
										queryBindId: 'Auch eine random UUID'
									}
								]
							};

							addItem(queryItem);
							reloadOnly();
						}
					}
				}
			};

			if (ctx) {
				if (chartInstance) {
					chartInstance.destroy();
				}
				chartInstance = new Chart(ctx, chartConfig);
			}
		});
	}

	function handleChartToggled(event: { detail: { headlineShowChart: boolean } }) {
		showChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.patientCohortDeathChartShowChart = showChart; // Aktualisierung des Stores
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: { detail: { headlineInitialLogarithm: boolean } }) {
		showLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.patientCohortDeathChartShowLogarithm = showLogarithm; // Aktualisierung des Stores
			return storeValues;
		});
	}
</script>

<div
	class="patient-cohort-pie-root"
	class:maximized={maximizePatientCohortDeathChart}
>
	<Headline
		headlineTitle={$t('vitalStatus')}
		headlineTooltip={$t('tooltip_PatientCohortDeathChart')}
		headlineMaximize={maximizePatientCohortDeathChart}
		headlineShowChart={showChart}
		headlineIsChart={true}
		headlineInitialTop5={null}
		headlineInitialLogarithm={showLogarithm}
		headlineInputTableData={tableData}
		headlineInputTableHeader={headers}
		headlineChartJSElement={pieChart}
		headlineD3Element={null}
		on:chartToggled={handleChartToggled}
		on:logarithmToggled={handleLogarithmToggled}
		on:maximized={handleMaximized}
	/>
	<lens-data-passer bind:this={dataPasser}></lens-data-passer>
	<div class="patient-cohort-pie-view" style={showChart ? '' : 'display: none;'}>
		<div class="chart-container">
			<canvas bind:this={pieChart}></canvas>
		</div>
		<div class="vital-status-legend" aria-label={$t('vitalStatus')}>
			{#each inputArray.label as label, index}
				<div class="vital-status-legend-item">
					<span
						class="vital-status-swatch"
						style={`background-color: ${colorPalette[index] ?? 'transparent'}`}
					></span>
					<span>{compactVitalStatusLegendLabel(label)}</span>
				</div>
			{/each}
		</div>
	</div>

	<div style={!showChart ? '' : 'display: none;'}>
		<div class="data-table">
			<table id="deathChartTable" class="display" style="width:100%">
				<thead>
					<tr>
						<th>{$t('deathStatus')}</th>
						<th>{$t('count')}</th>
					</tr>
				</thead>
			</table>
		</div>
	</div>
</div>

<style>
	.patient-cohort-pie-root:not(.maximized) .patient-cohort-pie-view {
		display: flex;
		width: 100%;
		min-width: 0;
		min-height: 0;
	}

	.patient-cohort-pie-root:not(.maximized) .patient-cohort-pie-view > .chart-container {
		flex: 1 1 0;
		width: auto;
		min-width: 0;
	}

	.vital-status-legend {
		display: flex;
		flex: 0 0 clamp(135px, 38%, 170px);
		flex-direction: column;
		justify-content: center;
		gap: 5px;
		min-width: 0;
		overflow: hidden;
		font-size: 11px;
		font-weight: 400;
		line-height: 1.15;
	}

	.patient-cohort-pie-root.maximized .vital-status-legend {
		display: none;
	}

	:global(html[data-ovis-mobile-layout='landscape'])
		.patient-cohort-pie-root:not(.maximized)
		.patient-cohort-pie-view
		> .chart-container {
		flex: 1 1 0;
		width: auto;
		min-width: 0;
	}

	:global(html[data-ovis-mobile-layout='landscape'])
		.patient-cohort-pie-root:not(.maximized)
		.vital-status-legend {
		flex: 0 0 112px;
		gap: 3px;
		font-size: 9px;
		line-height: 1.1;
	}

	.vital-status-legend-item {
		display: flex;
		align-items: flex-start;
		gap: 4px;
		min-width: 0;
		font-weight: 400;
	}

	.vital-status-legend-item > :last-child {
		min-width: 0;
		white-space: normal;
		overflow-wrap: anywhere;
	}

	.vital-status-swatch {
		flex: 0 0 12px;
		height: 7px;
		margin-top: 1px;
	}
</style>
