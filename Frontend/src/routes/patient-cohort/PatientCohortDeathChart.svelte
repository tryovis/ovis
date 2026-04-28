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
					aspectRatio: aspectRatio,
					plugins: {
						legend: {
							display: true,
							position: isCCP ? 'top' : 'right'
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
<div style={showChart ? '' : 'display: none;'}>
	<div class="chart-container">
		<canvas bind:this={pieChart}></canvas>
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
