<script lang="ts">
	// @ts-nocheck
	import Headline from '../../components/Headline.svelte';
	import { Chart, registerables } from 'chart.js';
	import type { ChartConfiguration } from 'chart.js';
	import { onMount } from 'svelte';
	import { getPatientCohortAgeChart } from '../../graphQl/gql-patient-cohort';
	import { createTable, changeRowCount } from '../../tableBuilder';
	import { maxStore } from '../../store/maxStore';
	import { userStore } from '../../store/userStore';
	import { get } from 'svelte/store';
	import { t } from '../../store/languageStore';
	import type { LensDataPasser } from '@samply/lens';
	import { variantStore } from '../../store/variantStore.js';
	import { configStore } from '../../store/configStore'; // ConfigStore importieren
	import { filterActiveStore } from '../../store/filterActiveStore.js';
	import { addUserFilter } from '../../components/UserFilter';
	import { reloadOnly } from '../../store/reloadStore';
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

	let dataPasser: LensDataPasser;

	let primaryColor: string;
	let colorPalette: string[];

	userStore.subscribe((value: { primaryColor: string; colorPalette: string[] }) => {
		({ primaryColor, colorPalette } = value);
	});

	let aspectRatio: number = 3.6;

	// Zugriff auf die store-Variablen
	let maximizePatientCohortAgeChart: boolean;
	maxStore.subscribe((value: { maximizePatientCohortAgeChart: boolean }) => {
		({ maximizePatientCohortAgeChart } = value);
	});

	let showChart: boolean;
	let showLogarithm: boolean;
	configStore.subscribe((value: { patientCohortAgeChartShowChart: boolean; patientCohortAgeChartShowLogarithm: boolean }) => {
		showChart = value.patientCohortAgeChartShowChart; // Initialisierung der `showChart`-Variable
		showLogarithm = value.patientCohortAgeChartShowLogarithm; // Initialisierung der `showLogarithm`-Variable
	});

	function handleMaximized(event: { detail: { headlineMaximize: boolean } }) {
		maximizePatientCohortAgeChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizePatientCohortAgeChart = !storeValues.maximizePatientCohortAgeChart;
			return storeValues;
		});
		setTimeout(() => {
			if (maximizePatientCohortAgeChart) {
				aspectRatio = 2.1;
				changeRowCount(patientCohortAgeTable, tableShownRowsMax);
			} else {
				aspectRatio = 3.6;
				if (isCCP) {
					aspectRatio = 2.3;
				}
				changeRowCount(patientCohortAgeTable, tableShownRows);
			}
		}, 0);
	}

	Chart.register(...registerables);

	let scatterChart: HTMLCanvasElement;
	let chartInstance: Chart;

	let patientCohortAgeTable: unknown;
	let tableShownRows = 3;
	let tableShownRowsMax = 20;
	let sortingIndex = 1;
	let columns = [{ data: 'ageAtDiagnosis' }, { data: 'count' }];
	let headers = [translate('age'), translate('count')];

	function handleChartToggled(event: { detail: { headlineShowChart: boolean } }) {
		showChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.patientCohortAgeChartShowChart = showChart; // Aktualisierung des Stores
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: { detail: { headlineInitialLogarithm: boolean } }) {
		showLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.patientCohortAgeChartShowLogarithm = showLogarithm; // Aktualisierung des Stores
			return storeValues;
		});
	}

	type PatientAgeChart = { ageAtDiagnosis: number; count: number };
	let inputArray: PatientAgeChart[];
	let mounted = false;
	let tableData: PatientAgeChart[] = [];

	let filter = JSON.stringify({ operand: 'OR', children: [] });

	onMount(async () => {
		await import('@samply/lens');

		if (filterActive) {
			filter = JSON.stringify(dataPasser.getAstAPI());
		}
		if (isCCP) {
			aspectRatio = 2.3;
		}
		filter = JSON.stringify(await addUserFilter(JSON.parse(filter)));
		console.log('USER FILTER ADDED', filter);
		getPatientCohortAgeChart(filter).then((result) => {
			inputArray = result.map((item) => ({
				x: item.ageAtDiagnosis,
				y: item.count
			}));
			tableData = result;
			patientCohortAgeTable = createTable(
				'diagnosis',
				dataPasser,
				'patientCohortAgeChart',
				tableData,
				columns,
				tableShownRows,
				sortingIndex
			);
			mounted = true;
		});
	});

	$: {
		aspectRatio;
		showLogarithm;
		inputArray;
		if (mounted) {
			createScatterChart();
		}
	}

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
			parentGroupCode: 'diagnosis'
		});
		console.log(dataPasser.getQueryAPI());
		console.log('AFTER ADD ITEM');
	};

	function createScatterChart() {
		let ctx = scatterChart.getContext('2d');

		const chartConfig: ChartConfiguration = {
			type: 'scatter',
			data: {
				datasets: [
					{
						label: translate('ageAtDiagnosis'),
						backgroundColor: colorPalette[0],
						data: inputArray, // [{x: age, y: count}, ...]
						showLine: true,
						borderColor: primaryColor
					}
				]
			},
			options: {
				scales: {
					x: {
						type: 'linear',
						beginAtZero: true,
						title: { display: true, text: translate('ageAtDiagnosis') }
					},
					y: {
						type: showLogarithm ? 'logarithmic' : 'linear',
						beginAtZero: false,
						title: { display: true, text: translate('numOfTumorCases') }
					}
				},
				aspectRatio: aspectRatio,
				plugins: { legend: { display: false } },

				// 👇 Neu: Klick-Handler für Punkte
				onClick: (evt, _elements, chart) => {
					const points = chart.getElementsAtEventForMode(
						evt,
						'nearest',
						{ intersect: true }, // nur echte Treffpunkte
						true
					);
					if (points.length) {
						const { datasetIndex, index } = points[0];
						const point = (chart.data.datasets[datasetIndex].data as { x: number; y: number }[])[index];
						console.log('Alter angeklickt:', point.x, ' | Anzahl:', point.y);

						let queryItem = {
							id: 'Random generierte UUID', //uuidv4(),
							key: 'ageAtDiagnosis', //theoretisch metastasis => Im Katalog hinterlegt
							name: 'childCategorie.name', //Im Katalog hinterlegt
							type: 'EQUALS',
							system: 'diagnosis',
							values: [
								{
									name: 'test', //Anzeigename
									value: point.x, // Hier verwenden wir das Label des geklickten Kuchenstücks
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
			if (chartInstance) chartInstance.destroy();
			chartInstance = new Chart(ctx, chartConfig);
		}
	}
</script>

<Headline
	headlineTitle={translate('ageAtDiagnosis')}
	headlineTooltip={translate('tooltip_PatientCohortAgeChart')}
	headlineMaximize={maximizePatientCohortAgeChart}
	headlineShowChart={showChart}
	headlineIsChart={true}
	headlineInitialTop5={null}
	headlineInitialLogarithm={showLogarithm}
	headlineInputTableData={tableData}
	headlineInputTableHeader={headers}
	headlineChartJSElement={scatterChart}
	headlineD3Element={null}
	on:chartToggled={handleChartToggled}
	on:logarithmToggled={handleLogarithmToggled}
	on:maximized={handleMaximized}
/>

<!-- prettier-ignore -->
<lens-data-passer bind:this={dataPasser}></lens-data-passer>
<div style={showChart ? '' : 'display: none;'}>
	<div class="chart-container" style="height:100%">
		<canvas bind:this={scatterChart} style="height:100%"></canvas>
	</div>
</div>

<div style={!showChart ? '' : 'display: none;'}>
	<div class="data-table">
		<table id="patientCohortAgeChart" class="display" style="width:100%">
			<thead>
				<tr>
					<th>{translate('age')}</th>
					<th>{translate('count')}</th>
				</tr>
			</thead>
		</table>
	</div>
</div>
