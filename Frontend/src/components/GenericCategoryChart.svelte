<script lang="ts">
	import { Chart, registerables } from 'chart.js';
	import { userStore } from '../store/userStore';
	import { createTable, changeRowCount } from '../tableBuilder';
	import { createEventDispatcher, onMount } from 'svelte';
	import { getCategoryChart } from '../graphQl/gql-generic';
	import Headline from './Headline.svelte';
	import { get } from 'svelte/store';
	import { t } from '../store/languageStore';
	import type { LensDataPasser } from '@samply/lens';
	import { reloadOnly } from '../store/reloadStore';
	import type { ChartConfiguration } from 'chart.js';
	import { filterActiveStore } from '../store/filterActiveStore.js';
	import { addUserFilter } from '../components/UserFilter';
	import { iconPath } from '$lib/path-utils';
	import type { AggregatedValue } from '../types/query';

	const emptyIcon = iconPath('null-off.svg');
	// Lokale Variable für filterActive
	let filterActive = true;

	// Abonnieren des filterActiveStore und den Wert aktualisieren
	filterActiveStore.subscribe((value) => {
		filterActive = value.filterActive; // Hier den Wert direkt zuweisen
	});
	let colorPalette: string[];

	userStore.subscribe((value: { primaryColor: string; colorPalette: string[] }) => {
		({ colorPalette } = value);
	});

	Chart.register(...registerables);

	export let aspectRatioMin: number;
	export let collection: string;
	export let dropdownObject: { label: string; value: string }[];
	export let headlineTitle: string;
	export let headlineTooltip: string;
	export let initialDropdownValue: string;
	type LegendPosition = 'top' | 'left' | 'bottom' | 'right' | 'center' | 'chartArea';
	export let legendPosition: LegendPosition;
	export let tableShownRowsMin: number;
	export let truncateLengthMin: number | null = null;
	export let maxStoreValue = false;
	export let showChartStoreValue = true;
	export let showTop5StoreValue = false;
	export let showNullStoreValue = false;
	export let showLogarithmStoreValue = false;

	let initialDropdownLabel: string;

	let chartTable: import('datatables.net').Api<unknown> | null = null;
	let chartTableName = collection + 'Table';

	let aspectRatioMax = 2.2;
	let tableShownRowsMax = 20;

	let aspectRatio = aspectRatioMin;
	let tableShownRows = tableShownRowsMin;

	let sortingIndex = 1;

	type ChartType = { label: string[]; count: number[] };
	let inputArray: ChartType;

	let pieChart: HTMLCanvasElement;
	let chartInstance: Chart;

	let dataPasser: LensDataPasser;

	function handleMaximized(event: { detail: { headlineMaximize: boolean } }) {
		maxStoreValue = event.detail.headlineMaximize;
		maximize();
		setTimeout(() => {
			if (maxStoreValue) {
				aspectRatio = aspectRatioMax;
				tableShownRows = tableShownRowsMax;
				if (chartTable) changeRowCount(chartTable, tableShownRows);
			} else {
				aspectRatio = aspectRatioMin;
				tableShownRows = tableShownRowsMin;
				if (chartTable) changeRowCount(chartTable, tableShownRows);
			}
		}, 0);
	}

	let isMounted = false;
	onMount(async () => {
		await import('@samply/lens');
		isMounted = true;
	});

	$: {
		initialDropdownValue;
		showLogarithmStoreValue;
		showTop5StoreValue;
		showNullStoreValue;
		aspectRatio;
		truncateLengthMin;
		if (isMounted) {
			createPieChart();
			getSelectedLabel();
		}
	}

	let tableData: Array<Record<string, string | number>> = [];
	let reversedTableData: Array<Record<string, string | number>> = [];
	let columns = [{ data: initialDropdownValue }, { data: 'count' }];
	let headers: string[];

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
		value: string | { min: number; max: number } | AggregatedValue[][] | number | null;
		queryBindId: string;
		description?: string;
	};

	const addItem = (queryObject: QueryItem): void => {
		dataPasser.addStratifierToQueryAPI({
			label: String(queryObject.values[0]?.value ?? ''),
			catalogueGroupCode: queryObject.key,
			parentGroupCode: queryObject.system ?? ''
		});
		console.log(dataPasser.getQueryAPI());
	};

	let filter = JSON.stringify({ operand: 'OR', children: [] });
	let showEmptyIcon = false;
	async function createPieChart() {
		showEmptyIcon = false;
		tableData = [];
		if (filterActive) {
			filter = JSON.stringify(dataPasser.getAstAPI());
		}
		filter = JSON.stringify(await addUserFilter(JSON.parse(filter)));
		try {
			// Daten abrufen
			const result = await getCategoryChart(initialDropdownValue, collection, filter);
			inputArray = result;

			let missingValueCount = 0;

			// Temporäre Arrays zur sicheren Verarbeitung
			const validLabels: string[] = [];
			const validCounts: number[] = [];

			// Labels und Counts synchron filtern
			inputArray.label.forEach((label, index) => {
				if (!label?.trim()) {
					// Zähle Missing Values
					missingValueCount += inputArray.count[index];
				} else {
					// Füge gültige Werte hinzu
					validLabels.push(label);
					validCounts.push(inputArray.count[index]);
				}
			});

			// "Missing Values" hinzufügen, falls erforderlich
			if (showNullStoreValue && missingValueCount > 0) {
				validLabels.push('-');
				validCounts.push(missingValueCount);
			}

			// Aktualisiere inputArray mit validierten Daten
			inputArray.label = validLabels;
			inputArray.count = validCounts;

			// tableData aufbauen
			tableData = inputArray.label.map((label, index) => ({
				[initialDropdownValue]: label,
				count: inputArray.count[index]
			}));

			// Für CSV-Export
			reversedTableData = [...tableData];

			console.log('Processed inputArray:', inputArray);

			if (!inputArray.label || inputArray.label.length === 0) {
				showEmptyIcon = true; // Nur wenn wirklich keine Daten vorhanden sind
			} else {
				console.log('Final tableData:', tableData);

				// Chart-Kontext abrufen
				let ctx = pieChart.getContext('2d');

				// Daten nach Top5 bearbeiten
				if (showTop5StoreValue) {
					inputArray = convertToTop5(inputArray);
				}

				// Logarithmische Transformation für das Chart
				const transformedData = inputArray.label.map((label, index) => ({
					label,
					count: Math.log(inputArray.count[index]),
					originalCount: inputArray.count[index]
				}));

				// Werte auf 2 Nachkommastellen runden
				transformedData.forEach((item) => {
					item.count = parseFloat(item.count.toFixed(2));
				});

				// Chart-Konfiguration erstellen
				const chartConfig: ChartConfiguration = {
					type: 'pie',
					data: {
						labels: transformedData.map((item) => item.label),
						datasets: [
							{
								data: showLogarithmStoreValue
									? transformedData.map((item) => item.count)
									: inputArray.count,
								backgroundColor: colorPalette
							}
						]
					},
					options: {
						aspectRatio: aspectRatio,
						plugins: {
							legend: {
								display: true,
								position: legendPosition
							},
							tooltip: {
								callbacks: {
									label: (context) => {
										const dataItem = transformedData[context.dataIndex];
										const logarithmTooltip = showLogarithmStoreValue
											? ` (log: ${dataItem.count})`
											: '';
										return ` ${get(t)('count')}: ${dataItem.originalCount}${logarithmTooltip}`;
									}
								}
							}
						},
						onClick: (event, elements) => {
							if (elements.length > 0) {
								const elementIndex = elements[0].index;

								// Label des geklickten Kuchenstücks holen
								const label = chartConfig.data.labels?.[elementIndex];

								if (!label) {
									return;
								}

								if (label !== 'Sonstige') {
									// Einzelnes Label hinzufügen
									addItem({
										id: 'Random generierte UUID',
										key: initialDropdownValue,
										name: 'childCategorie.name',
										type: 'EQUALS',
										system: collection,
										values: [
											{
												name: 'test',
												value: String(label),
												queryBindId: 'Auch eine random UUID'
											}
										]
									});
								} else {
									// Wenn "Sonstige" geklickt wurde, die fünf häufigsten Labels hinzufügen
									const top5 = inputArray.label
										.map((label, index) => ({ label, count: inputArray.count[index] }))
										.filter((item) => item.label !== 'Sonstige') // "Sonstige" ausschließen
										.sort((a, b) => b.count - a.count) // Nach Anzahl sortieren
										.slice(0, 5); // Die Top 5 auswählen

									top5.forEach((item) => {
										addItem({
											id: 'Random generierte UUID',
											key: '!' + initialDropdownValue,
											name: 'childCategorie.name',
											type: 'NEQUALS',
											system: collection,
											values: [
												{
													name: 'test',
													value: item.label,
													queryBindId: 'Auch eine random UUID'
												}
											]
										});
									});
								}

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

				columns = [{ data: initialDropdownValue }, { data: 'count' }];

				// Tabelle erstellen, nachdem die Daten vollständig geladen wurden
				chartTable = createTable(
					collection,
					dataPasser,
					chartTableName,
					tableData,
					columns,
					tableShownRows,
					sortingIndex
				);
			}
		} catch (error) {
			console.error('Error while creating the pie chart:', error);
		}
	}

	function convertToTop5(inputArray_tmp: ChartType): ChartType {
		const sortedData = inputArray_tmp.label
			.map((label, index) => ({ label, count: inputArray_tmp.count[index] }))
			.sort((a, b) => b.count - a.count);

		const top5 = sortedData.slice(0, 5);
		const otherCount = sortedData.slice(5).reduce((sum, item) => sum + item.count, 0);

		const newLabelArray = top5.map((item) => item.label);
		newLabelArray.push('Sonstige');
		const newCountArray = top5.map((item) => item.count);
		newCountArray.push(otherCount);

		const newChartType: ChartType = {
			label: newLabelArray,
			count: newCountArray
		};

		return newChartType;
	}

	function handleChartToggled(event: { detail: { headlineShowChart: boolean } }) {
		showChartStoreValue = event.detail.headlineShowChart;
		dispatch('chartToggled', { showChartStoreValue });
	}

	function handleLogarithmToggled(event: { detail: { headlineInitialLogarithm: boolean } }) {
		showLogarithmStoreValue = event.detail.headlineInitialLogarithm;
		dispatch('logarithmToggled', { showLogarithmStoreValue });
	}

	function handleTop5Toggled(event: { detail: { headlineInitialTop5: boolean } }) {
		showTop5StoreValue = event.detail.headlineInitialTop5;
		dispatch('top5Toggled', { showTop5StoreValue });
	}

	function handleNull(event: { detail: { headlineNull: boolean } }) {
		showNullStoreValue = event.detail.headlineNull;
		dispatch('nullToggled', { showNullStoreValue });
	}

	function getSelectedLabel() {
		const selectedOption = dropdownObject.find((option) => option.value === initialDropdownValue);
		initialDropdownLabel = selectedOption ? selectedOption.label : '';
		initialDropdownValue = selectedOption ? selectedOption.value : '';
		headers = [initialDropdownLabel, get(t)('count')];
		dispatch('changedGenericChartDropdown', { initialDropdownValue });
	}

	const dispatch = createEventDispatcher();
	function maximize() {
		maxStoreValue = !maxStoreValue;
		dispatch('maximized', { maxStoreValue });
	}
</script>

<Headline
	{headlineTitle}
	{headlineTooltip}
	headlineMaximize={maxStoreValue}
	headlineShowChart={showChartStoreValue}
	headlineIsChart={true}
	headlineInitialTop5={showTop5StoreValue}
	headlineInitialLogarithm={showLogarithmStoreValue}
	headlineInputTableData={reversedTableData}
	headlineInputTableHeader={headers}
	headlineChartJSElement={pieChart}
	headlineD3Element={null}
	headlineNull={showNullStoreValue}
	headlineLoading={null}
	headlineLoadingStatus={null}
	on:chartToggled={handleChartToggled}
	on:logarithmToggled={handleLogarithmToggled}
	on:top5Toggled={handleTop5Toggled}
	on:maximized={handleMaximized}
	on:nullToggled={handleNull}
/>
<!-- prettier-ignore -->
<lens-data-passer bind:this={dataPasser}></lens-data-passer>
<div style={showChartStoreValue ? '' : 'display: none;'}>
	<div class="dropdown-container">
		<div class="dropdown straight-line-container">
			<label for="dropdownObject" style="margin-right:5px">{$t('featureCategory')}:</label><br />
			<select class="dropbtn" bind:value={initialDropdownValue}>
				{#each dropdownObject as option (option.value)}
					<option class="dropdown-option" value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>
	</div>
	<div style={!showEmptyIcon ? '' : 'display: none;'} class="chart-container">
		<!-- prettier-ignore -->
		<canvas bind:this={pieChart}></canvas>
	</div>
</div>
<div class="data">
	<div class="data-table" style={!showEmptyIcon && !showChartStoreValue ? '' : 'display: none;'}>
		<div class="data-table">
			<table id={chartTableName} class="display" style="width:100%">
				<thead>
					<tr>
						<th>{initialDropdownLabel}</th>
						<th>{$t('count')}</th>
					</tr>
				</thead>
			</table>
		</div>
	</div>
</div>
<div style={showEmptyIcon ? '' : 'display: none;'} class="bigSpinnerContainer">
	<img class="emptyIcon" src={emptyIcon} alt="Keine Daten verfügbar" />
</div>

<style>
	.dropdown {
		width: 50%;
		float: right;
		margin-right: 10px;
	}
</style>
