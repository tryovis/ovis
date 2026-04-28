<script lang="ts">
	// @ts-nocheck
	import type { ChartConfiguration, ChartDataset } from 'chart.js';
	import { onMount } from 'svelte';
	import { getSurvivalFollowUpAssessment } from '../../graphQl/gql-survival';
	import Headline from '../../components/Headline.svelte';
	import { createTable, changeRowCount } from '../../tableBuilder';

	import { maxStore } from '../../store/maxStore';
	import { userStore } from '../../store/userStore';
	import annotationPlugin from 'chartjs-plugin-annotation';
	import { Chart,  registerables } from 'chart.js';
	import { t, locale, locales } from "../../store/languageStore";
	import { iconPath } from '$lib/path-utils';

	Chart.register(...registerables, annotationPlugin);

	let intervalStart: string;
	let intervalEnd: string;

	let primaryColor: string;
	let aspectRatio = 1.8;

	const loadingIcon = iconPath('spinner.svg');
	userStore.subscribe((value: any) => {
		({ primaryColor } = value);
	});

	// Access the store variables
	let maximizeSurvivalCoxRegression: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeSurvivalCoxRegression } = value);
	});
	function handleMaximized(event: any) {
		maximizeSurvivalCoxRegression = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeSurvivalCoxRegression = !storeValues.maximizeSurvivalCoxRegression;
			return storeValues; // Return the updated values
		});
		setTimeout(() => {
			if (maximizeSurvivalCoxRegression) {
				aspectRatio = 2.1;
				//changeRowCount(survivalFollowUpAssessmentTable, tableShownRowsMax);
			} else {
				aspectRatio = 1.8;
				//changeRowCount(survivalFollowUpAssessmentTable, tableShownRows);
			}
		}, 0);
	}

	let currentBoxPlot: HTMLCanvasElement;
	let chartInstance: Chart;

	let survivalFollowUpAssessmentTable: any;
	let tableShownRows = 5;
	let tableShownRowsMax = 20;
	//let truncateLength = 10;
	let sortingIndex = 0;

	
	function isMounted() {
		return mounted;
	}

	$: {
		aspectRatio
		mounted;
		if (isMounted()) {
			createCurrentBoxPlot();
		}
	}

	const data = {
		datasets: [
			{
				label: 'Variation A',
				backgroundColor: primaryColor,
				pointStyle: 'rect',
				data: [
					{
						x: 1.8,
						y: 8,
						r: 15,
						range: [1.5, 2.7]
					}
				]
			},
			{
				label: 'Variation B',
				backgroundColor: primaryColor,
				pointStyle: 'rect',
				data: [
					{
						x: 0.8,
						y: 7,
						r: 10,
						range: [0.5, 1.6]
					}
				]
			},
			{
				label: 'Variation C',
				backgroundColor: primaryColor,
				pointStyle: 'rect',
				data: [
					{
						x: 2.7,
						y: 6,
						r: 20,
						range: [1.9, 3]
					}
				]
			},
			{
				label: 'Variation D',
				backgroundColor: primaryColor,
				pointStyle: 'rect',
				data: [
					{
						x: 2.5,
						y: 5,
						r: 19,
						range: [1.7, 2.7]
					}
				]
			},
			{
				label: 'Variation E',
				backgroundColor: primaryColor,
				pointStyle: 'rect',
				data: [
					{
						x: 1.8,
						y: 4,
						r: 15,
						range: [1.27, 2]
					}
				]
			},
			{
				label: 'Variation F',
				backgroundColor: primaryColor,
				pointStyle: 'rect',
				data: [
					{
						x: 1.5,
						y: 3,
						r: 12,
						range: [1.2, 1.8]
					}
				]
			},
			{
				label: 'Variation G',
				backgroundColor: primaryColor,
				pointStyle: 'rect',
				data: [
					{
						x: 2.1,
						y: 2,
						r: 10,
						range: [1.9, 2.6]
					}
				]
			},
			{
				label: 'Summary',
				backgroundColor: primaryColor,
				borderColor: primaryColor,
				borderDash: [],
				pointStyle: 'rectRot',
				borderWidth: 2,
				data: [
					{
						x: 2.2,
						y: 1,
						r: 25, // TODO: has to be dynamic
						range: [1.7, 2.5]
					}
				]
			}
		]
	};

	let mounted = false;

	onMount(() => {

		mounted = true;
	});


	let ctx1;
	let firstIteration = false;

	function createCurrentBoxPlot() {
		ctx1 = document.getElementById('chart1').getContext('2d');

		// Destroy existing Chart instance if it exists
		if (chartInstance) {
			chartInstance.destroy();
		}

		// Create new Chart instance with a delay to ensure destruction is complete
		setTimeout(() => {
			let forestPlotPlugin = {
				
				id: 'forestPlot',
				beforeDraw:  function (chartInstance) {
					const data = chartInstance.data;

					

					const summary = data.datasets[1];
					//const sumX = summary.data[0].x;
					const sumX = aspectRatio
					console.log("SUMX", sumX )
					const yScale = chartInstance.scales['y'];
					const xScale = chartInstance.scales['x'];
					const lineWidth = 1;

					if (sumX) {
						const chartArea = chartInstance.chartArea;
						let xValue = xScale.getPixelForValue(sumX);

						

						// summary vertical line
						ctx1.beginPath();
						ctx1.strokeStyle = primaryColor;
						ctx1.lineWidth = lineWidth;
						ctx1.setLineDash([3]);
						ctx1.moveTo(xValue, 0);
						ctx1.lineTo(xValue, chartArea.height + 40);
						// ctx1.strokeStyle = '#333';
						ctx1.stroke();
						ctx1.setLineDash([]);
						ctx1.restore();
					}
					
					data.datasets
						.filter((x) => x.data.length)
						.forEach((variation, vidx) => {
							ctx1.save();
							const vdata = variation.data[0];
							const [low, high] = vdata.range;
							const yValue = vdata.y ? yScale.getPixelForValue(vdata.y) : 0;

							// console.log(
							//   variation.label,
							//   "y",
							//   vdata.y,
							//   "low",
							//   low,
							//   "high",
							//   high,
							//   " yValue",
							//   yValue
							// );

							// console.log('--', variation);
							ctx1.strokeStyle = variation.backgroundColor;
							ctx1.beginPath();
							ctx1.setLineDash([]);
							ctx1.lineWidth = lineWidth;
							ctx1.moveTo(xScale.getPixelForValue(low), yValue);
							ctx1.lineTo(xScale.getPixelForValue(high), yValue);
							ctx1.stroke();

							// draw tick
							ctx1.moveTo(xScale.getPixelForValue(low), yValue - 6);
							ctx1.lineTo(xScale.getPixelForValue(low), yValue + 6);
							ctx1.stroke();
							// draw tick
							ctx1.moveTo(xScale.getPixelForValue(high), yValue - 6);
							ctx1.lineTo(xScale.getPixelForValue(high), yValue + 6);
							ctx1.stroke();

							ctx1.restore();
						
						});

					//  const { x, y } = summary.getProps(["x", "y"]);
					// console.log(x, y);

					// const meta = chartInstance.getMeta();
					// var pt0 = meta.data[0];
				}
				
				// afterDatasetUpdate: function(chart, args, options) {
				//   console.log(chart);
				// }
				
			};

			let labels = data.datasets;
			if(!firstIteration){
				labels = data.datasets.reverse();
				labels.unshift({ label: null });
			}
			// labels.push({ label: null });
			firstIteration = true;

			function getYLabel(idx) {
				if (!labels[idx] || !labels[idx].label) return '';
				const data = labels[idx].data[0];
				const [low, high] = data.range;
				// TODO: defensive coding
				return [labels[idx].label, `${data.x} (${low} - ${high})`];
			}

			// const maxYScale = labels.length;
			const yMaxScale = data.datasets.length ? data.datasets.length : 0;

			// When uncommenting below line, graph is created without horizontal lines
			//Chart.register(forestPlotPlugin, ...registerables);

			const filteredDatasets = data.datasets.filter(dataset => dataset.label !== null);
			const chartConfig = {
				type: 'bubble',
				data,
				options: {
					aspectRatio: aspectRatio,
					responsive: true,
					plugins: {
						legend: {
							display: false
						}
					},
					scales: {
						x: {
							display: true,
							max: 3.5,
							beginAtZero: true
						},
						y: {
							display: true,
							//max: yMaxScale,
							beginAtZero: true,
							ticks: {
								crossAlign: 'center',
								stepSize: 1,
								callback: function (_tick, idx, _labels) {
									return getYLabel(idx);
								}
							}
						}
					}
				},
				plugins: [forestPlotPlugin]
			};

			// Create new Chart instance
			chartInstance = new Chart(ctx1, chartConfig);
		}, 0); // Set a small delay
	}

	let showChart: boolean = true;
	function handleChartToggled(event: any) {
		showChart = event.detail.headlineShowChart;
	}

	let showLogarithm: boolean = false;
	function handleLogarithmToggled(event: any) {
		showLogarithm = event.detail.headlineInitialLogarithm;
	}
</script>

<div class="wip-wrapper">
	<Headline
		headlineTitle={$t("coxRegressionTitle")}
		headlineTooltip={$t("tooltip_follow_up")}
		headlineMaximize={maximizeSurvivalCoxRegression}
		headlineShowChart={showChart}
		headlineIsChart={true}
		headlineInitialTop5={null}
		headlineInitialLogarithm={showLogarithm}
		headlineChartJSElement={currentBoxPlot}
		headlineD3Element={null}
		on:chartToggled={handleChartToggled}
		on:logarithmToggled={handleLogarithmToggled}
		on:maximized={handleMaximized}
	/>

	<div class="chart-wrapper" style={showChart ? '' : 'display: none;'}>
		<div class="chart-container">
			<canvas id="chart1" bind:this={currentBoxPlot} />
		</div>
	</div>

	<div style={!showChart ? '' : 'display: none;'}></div>

	<!-- Overlay über alles -->
	<div class="overlay">
		<span>Work in Progress</span>
	</div>
</div>

<style>
	.wip-wrapper {
		position: relative;
	}

	.chart-wrapper {
		position: relative;
	}

	.chart-container {
		position: relative;
	}

	/* Overlay blockiert Klicks über Headline + Chart */
	.overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.3); /* halbtransparent schwarz */
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
		font-weight: bold;
		color: #fff;
		pointer-events: all; /* blockiert alle Klicks */
		z-index: 50;
	}
</style>
