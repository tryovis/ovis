<script lang="ts">
	// @ts-nocheck
	import { Chart, registerables } from 'chart.js';
	import type { ChartConfiguration } from 'chart.js';
	import { onMount } from 'svelte';
	import { getPatientCohortGenderChart } from '../../graphQl/gql-patient-cohort';
	import Headline from '../../components/Headline.svelte';
	import { createTable, changeRowCount } from '../../tableBuilder';
	import { maxStore } from '../../store/maxStore';
	import { userStore } from '../../store/userStore';
	import { get } from 'svelte/store';
	import { t } from '../../store/languageStore';
	import { variantStore } from '../../store/variantStore.js';
	import type { LensDataPasser } from '@samply/lens';
	import { configStore } from '../../store/configStore'; // ConfigStore importieren
	import { reloadOnly } from '../../store/reloadStore';
	import { filterActiveStore } from '../../store/filterActiveStore.js';
	import { addUserFilter } from '../../components/UserFilter';
	import type { AggregatedValue } from '../../types/query';

	const translate = (key: string): string => get(t)(key);

	let filterActive = true;

	// Abonnieren des filterActiveStore und den Wert aktualisieren
	filterActiveStore.subscribe((value) => {
		filterActive = value.filterActive; // Hier den Wert direkt zuweisen
	});

	let showChart: boolean;
	let showLogarithm: boolean;
	configStore.subscribe((value: {
		patientCohortGenderChartShowChart: boolean;
		patientCohortGenderChartShowLogarithm: boolean;
	}) => {
		showChart = value.patientCohortGenderChartShowChart; // Initialisierung der `showChart`-Variable
		showLogarithm = value.patientCohortGenderChartShowLogarithm; // Initialisierung der `showLogarithm`-Variable
	});

	let isCCP: boolean;
	variantStore.subscribe((value: { isCCP: boolean }) => {
		({ isCCP } = value);
	});

	let dataPasser: LensDataPasser;

	let colorPalette: string[];

	userStore.subscribe((value: { colorPalette: string[] }) => {
		({ colorPalette } = value);
	});

	let aspectRatio = 1.8;

	// Access the store variables
	let maximizePatientCohortGenderChart: boolean;
	maxStore.subscribe((value: { maximizePatientCohortGenderChart: boolean }) => {
		({ maximizePatientCohortGenderChart } = value);
	});
	function handleMaximized(event: { detail: { headlineMaximize: boolean } }) {
		maximizePatientCohortGenderChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizePatientCohortGenderChart = !storeValues.maximizePatientCohortGenderChart;
			return storeValues;
		});
		setTimeout(() => {
			if (maximizePatientCohortGenderChart) {
				aspectRatio = 2.1;
				changeRowCount(genderChartTable, tableShownRowsMax);
			} else {
				aspectRatio = 1.8;
				if (isCCP) {
					aspectRatio = 1.1;
				}
				changeRowCount(genderChartTable, tableShownRows);
			}
		}, 0);
	}

	Chart.register(...registerables);

	let pieChart: HTMLCanvasElement;
	let chartInstance: Chart;

	let genderChartTable: unknown;
	let tableShownRows = 3;
	let tableShownRowsMax = 20;
	let sortingIndex = 1;

	type PatientDeathChart = { label: string[]; count: number[] };
	let inputArray: PatientDeathChart = {
		label: [],
		count: []
	};
	let data: { label: string; count: number }[] = [];
	let columns = [{ data: 'gender' }, { data: 'count' }];
	let headers = [translate('gender'), translate('count')];

	let mounted = false;

	function isMounted() {
		return mounted;
	}

	$: {
		aspectRatio;
		showLogarithm;
		if (isMounted()) {
			createPieChart();
		}
	}

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
		getPatientCohortGenderChart(filter).then((result) => {
			inputArray = result;

			data = inputArray.label.map((label, index) => ({
				label,
				count: inputArray.count[index]
			}));

			let tableData = inputArray.label.map((label, index) => ({
				gender: label, // Ersetze "label" durch "gender"
				count: inputArray.count[index]
			}));

			genderChartTable = createTable(
				'patient',
				dataPasser,
				'genderChartTable',
				tableData,
				columns,
				tableShownRows,
				sortingIndex
			);
			createPieChart();
			mounted = true;
		});
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
			parentGroupCode: queryObject.system
		});
		console.log(dataPasser.getQueryAPI());
		console.log('AFTER ADD ITEM');
	};

	function createPieChart() {
		getPatientCohortGenderChart(filter).then((result) => {
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

							// Hole das Label des geklickten Kuchenstücks
							const label = chartConfig.data.labels[elementIndex];

							const queryItem = {
								id: 'Random generierte UUID', //uuidv4(),
								key: 'gender', //theoretisch metastasis => Im Katalog hinterlegt
								name: 'childCategorie.name', //Im Katalog hinterlegt
								type: 'EQUALS',
								system: 'patient',
								values: [
									{
										name: 'test', //Anzeigename
										value: label, // Hier verwenden wir das Label des geklickten Kuchenstücks
										queryBindId: 'Auch eine random UUID' //Storebindung
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
			storeValues.patientCohortGenderChartShowChart = showChart; // Aktualisierung des Stores
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: { detail: { headlineInitialLogarithm: boolean } }) {
		showLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.patientCohortGenderChartShowLogarithm = showLogarithm; // Aktualisierung des Stores
			return storeValues;
		});
	}
</script>

<Headline
	headlineTitle={$t('distributionByGender')}
	headlineTooltip={$t('tooltip_PatientCohortGenderChart')}
	headlineMaximize={maximizePatientCohortGenderChart}
	headlineShowChart={showChart}
	headlineIsChart={true}
	headlineInitialTop5={null}
	headlineInitialLogarithm={showLogarithm}
	headlineInputTableData={data}
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
		<table id="genderChartTable" class="display" style="width:100%">
			<thead>
				<tr>
					<th>{$t('gender')}</th>
					<th>{$t('count')}</th>
				</tr>
			</thead>
		</table>
	</div>
</div>
