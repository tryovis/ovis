<script lang="ts">
	// @ts-nocheck
	import Headline from '../../components/Headline.svelte';
	import { Chart, registerables, ScatterController, TimeScale, LinearScale, PointElement } from 'chart.js';
	import 'chartjs-adapter-moment';
	import { onMount } from 'svelte';
	import { maxStore } from '../../store/maxStore';
	import { getPatientOverview } from '../../graphQl/gql-patient-single';
	import { userStore } from '../../store/userStore';
	import { t, locale, locales } from '../../store/languageStore';
	import { singlePatientStore } from '../../store/singlePatientStore.js';
	import { createTable, changeRowCount } from '../../tableBuilder';
	import type { LensDataPasser } from '@samply/lens';
	import { iconPath } from '$lib/path-utils';

	let eventChartTable: any;
	let tableShownRowsInitial = 7;
	let tableShownRows = tableShownRowsInitial;
	let tableShownRowsMax = 20;
	let sortingIndex = 2;
	let dataPasser: LensDataPasser;
	let tableData: any;
	let aspectRatio = 3.2;

	let singlePatientID = '';
	let data: any = [];
	let columns = [{ data: 'y' }, { data: 'label' }, { data: 'x', date: true }];
	let headers = ['Kategorie', 'Datum', 'Ausprägung'];

	singlePatientStore.subscribe((value) => {
		singlePatientID = value.singlePatient; // Hier den Wert direkt zuweisen
	});
	let primaryColor: string;
	let colorPalette: string[];

	userStore.subscribe((value: any) => {
		({ primaryColor, colorPalette } = value);
	});

	let mounted = false;

	function isMounted() {
		return mounted;
	}

	$: {
		aspectRatio;
		if (isMounted()) {
			console.log('REPAINT');
			createLineChart();
		}
	}

	Chart.register(ScatterController, TimeScale, LinearScale, PointElement, ...registerables);

	// Access the store variables
	let maximizePatientSingleEventChart: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizePatientSingleEventChart } = value);
	});
	function handleMaximized(event: any) {
		maximizePatientSingleEventChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizePatientSingleEventChart = !storeValues.maximizePatientSingleEventChart;
			return storeValues; // Return the updated values
		});
		setTimeout(() => {
			if (maximizePatientSingleEventChart) {
				aspectRatio = 2.08;
				tableShownRows = tableShownRowsMax;
				changeRowCount(eventChartTable, tableShownRows);
			} else {
				aspectRatio = 3.2;
				tableShownRows = tableShownRowsInitial;
				changeRowCount(eventChartTable, tableShownRows);
			}
		}, 0);
	}

	let lineCanvas: HTMLCanvasElement;

	let showChart: boolean = true;

	function handleChartToggled(event: any) {
		showChart = event.detail.headlineShowChart;
		if (!showChart) {
			eventChartTable = createTable(
				'patient',
				dataPasser,
				'eventChartTable',
				tableData,
				columns,
				tableShownRows,
				sortingIndex
			);
		}
	}

	const iconMap = {
		DiagnoseEXAKT: iconPath('diagnosis.png'),
		'Gehirnchirurgischer Eingriff': iconPath('scalpel.png'),
		TherapieEXAKT: iconPath('spritze.png'),
		DiagnostikEXAKT: iconPath('x-ray.png')
	};

	let events = [{ x: '2023-10-27', y: String, label: String }];
	onMount(async () => {
		console.log('START EVENTS QUERY');
		//events = await getPatientOverview("13e73f1495b206") ;
		events = await getPatientOverview(singlePatientID);

		tableData = events.map((event) => {
			const formattedDate = event.x ? new Date(event.x).toLocaleDateString('de-DE') : null; // bleibt null
			return { ...event, x: formattedDate };
		});

		console.log('EVENTS', events);
		createLineChart();
		mounted = true;
	});

	let chartInstance = null;

	function createLineChart() {
		if (chartInstance) chartInstance.destroy();

		// Nur valide x-Werte (nicht null/NaN) in den Chart
		const pointsWithDate = events.filter((e) => {
			if (e.x == null) return false;
			const t = new Date(e.x).valueOf();
			return !Number.isNaN(t);
		});

		const data = {
			datasets: [
				{
					data: pointsWithDate, // <— wichtig!
					borderColor: primaryColor,
					backgroundColor: primaryColor,
					pointRadius: 13,
					pointHoverRadius: 18,
					showLine: false
				}
			]
		};

		data.datasets.forEach((ds) => {
			ds.data.forEach((p) => {
				/* @ts-ignore */ p.pointStyle = iconMap[p.label];
			});
		});

		const xMin = pointsWithDate.length
			? pointsWithDate.reduce((min, p) => (p.x < min ? p.x : min), pointsWithDate[0].x)
			: undefined;

		const config = {
			type: 'scatter',
			data,
			options: {
				parsing: { xAxisKey: 'x', yAxisKey: 'y' }, // explizit
				scales: {
					x: {
						type: 'time',
						time: { unit: 'month' },
						...(xMin !== undefined ? { min: xMin } : {}), // nur setzen, wenn vorhanden
						title: { display: true, text: $t('date') }
					},
					y: {
						type: 'category',
						title: { display: true, text: $t('event') }
					}
				},
				aspectRatio: aspectRatio,
				plugins: {
					legend: { display: false },
					tooltip: {
						callbacks: {
							title: (ctx) => {
								const i = ctx[0].dataIndex;
								return data.datasets[0].data[i].y;
							},
							label: (ctx) => {
								const i = ctx.dataIndex;
								const timestamp = data.datasets[0].data[i].x;
								if (timestamp == null) return `${$t('date')}: –`; // kein Datum anzeigen
								const d = new Date(timestamp);
								const formatted = d.toLocaleDateString('de-DE');
								return `${formatted}: ${data.datasets[0].data[i].label}`;
							}
						}
					}
				}
			}
		};

		const ctx = lineCanvas.getContext('2d');
		chartInstance = new Chart(ctx, config);
	}
</script>

<Headline
	headlineTitle={$t('patientSingleEventChartTitle')}
	headlineTooltip={$t('tooltip_SinglePatientEventOverview')}
	headlineMaximize={maximizePatientSingleEventChart}
	headlineShowChart={showChart}
	headlineIsChart={true}
	headlineInitialTop5={null}
	headlineInitialLogarithm={null}
	headlineInputTableData={null}
	headlineChartJSElement={null}
	headlineD3Element={null}
	on:chartToggled={handleChartToggled}
	on:maximized={handleMaximized}
/>

<div style={showChart ? '' : 'display: none;'}>
	<div class="chart-container">
		<canvas bind:this={lineCanvas}></canvas>
	</div>
</div>

<div style={!showChart ? '' : 'display: none;'}>
	<div class="data-table">
		<table id="eventChartTable" class="display" style="width:100%">
			<thead>
				<tr>
					<th>{$t('category')}</th>
					<th>{$t('value')}</th>
					<th class="dateColumn">{$t('date')}</th>
				</tr>
			</thead>
		</table>
	</div>
</div>
