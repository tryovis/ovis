<script lang="ts">
	// @ts-nocheck
	import { Chart, registerables } from 'chart.js';
	import type { ChartConfiguration } from 'chart.js';
	import { onMount } from 'svelte';
	import { getStudyOverviewTable } from '../../graphQl/gql-study';
	import Headline from '../../components/Headline.svelte';

	import { maxStore } from '../../store/maxStore';
	import { userStore } from '../../store/userStore';
	import annotationPlugin from 'chartjs-plugin-annotation';
	import noUiSlider from 'nouislider';
	import '../../nouislider.css';
	import { get } from 'svelte/store';
	import { t } from '../../store/languageStore';
	import { configStore } from '../../store/configStore';
	import { filterActiveStore } from '../../store/filterActiveStore.js';
	import type { LensDataPasser } from '@samply/lens';
	import { addUserFilter } from '../../components/UserFilter';
	import { reloadOnly } from '../../store/reloadStore';
	import type { AggregatedValue } from '../../types/query';

	const translate = (key: string): string => get(t)(key);

	type StudyOverviewTableType = { shortname: string; studyPatients: number[] | number };
	type SliderInstance = {
		destroy: () => void;
		on: (event: 'change', callback: (values: string[], handle: number) => void) => void;
	};
	type SliderElement = HTMLDivElement & { noUiSlider?: SliderInstance };
	let filterActive = true;
	let filter = JSON.stringify({ operand: 'OR', children: [] });
	filterActiveStore.subscribe((value) => {
		filterActive = value.filterActive; // Hier den Wert direkt zuweisen
	});

	let dataPasser: LensDataPasser;

	let StudyPatientChartShowLogarithm: boolean;

	let slider: SliderElement | null = null;
	let sliderChanged = false;
	let primaryColor: string;
	let aspectRatio = 3;
	userStore.subscribe((value: { primaryColor: string }) => {
		({ primaryColor } = value);
	});

	Chart.register(...registerables, annotationPlugin);
	// Access the store variables
	let maximizeStudyPatientChart: boolean;
	maxStore.subscribe((value: { maximizeStudyPatientChart: boolean }) => {
		({ maximizeStudyPatientChart } = value);
	});
	function handleMaximized(event: { detail: { headlineMaximize: boolean } }) {
		maximizeStudyPatientChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeStudyPatientChart = !storeValues.maximizeStudyPatientChart;
			return storeValues; // Return the updated values
		});
		setTimeout(() => {
			if (maximizeStudyPatientChart) {
				aspectRatio = 2.15;
			} else {
				aspectRatio = 3;
			}
		}, 0);
	}

	let barChart: HTMLCanvasElement;
	let chartInstance: Chart;

	let data: StudyOverviewTableType[] = [];

	let mounted = false;

	function isMounted() {
		return mounted;
	}

	$: {
		sliderChanged;
		showLogarithm;
		aspectRatio;
		if (isMounted()) {
			createBarChart();
		}
	}

	let inputArray: StudyOverviewTableType[];

	onMount(async () => {
		await import('@samply/lens');

		if (filterActive) {
			filter = JSON.stringify(dataPasser.getAstAPI());
		}
		filter = JSON.stringify(await addUserFilter(JSON.parse(filter)));

		configStore.subscribe((value: { StudyPatientChartShowLogarithm: boolean }) => {
			StudyPatientChartShowLogarithm = value.StudyPatientChartShowLogarithm;
		});
		showLogarithm = StudyPatientChartShowLogarithm;

		inputArray = await getStudyOverviewTable(null, null, filter);
		inputArray = inputArray.map((study) => ({
			shortname: study.shortname,
			studyPatients: study.studyPatients.length // Setze studyPatients auf die Anzahl der patID-Werte
		}));

		createBarChart();
		mounted = true;
	});

	function createBarChart() {
		getStudyOverviewTable(null, null, filter).then((result) => {
			result = result.map((study) => ({
				shortname:
					study.shortname.length > 20
						? study.shortname.substring(0, 16) + '[...]'
						: study.shortname,
				studyPatients: study.studyPatients.length // Setze studyPatients auf die Anzahl der patID-Werte
			}));
			console.log('studyPatients2-PLOT', result);

			let ctx = barChart.getContext('2d');

			result.sort((a, b) => a.studyPatients - b.studyPatients);
			inputArray = result;

			let inputArray_zoomed = inputArray.slice(leftSlider, rightSlider + 1);

			const chartConfig: ChartConfiguration = {
				type: 'bar',
				data: {
					labels: inputArray_zoomed.map((item) => item.shortname), // Map over the result array to extract shortname property
					datasets: [
						{
							data: inputArray_zoomed.map((item) => item.studyPatients), // Map over the result array to extract studyPatients property
							backgroundColor: primaryColor
						}
					]
				},
				options: {
					aspectRatio: aspectRatio,
					scales: {
						x: {
							type: 'category'
						},
						y: {
							type: showLogarithm ? 'logarithmic' : 'linear',

							title: {
								display: true,
								text: 'onkol. Studienpatienten'
							}
						}
					},
					plugins: {
						legend: {
							display: false
						}
					},
					onClick: (event, elements) => {
						if (elements.length > 0) {
							const index = elements[0].index;
							addItem({
								id: 'Random generierte UUID',
								key: 'shortname',
								name: 'childCategorie.name',
								type: 'NEQUALS',
								system: 'study',
								values: [
									{
										name: 'studienname',
										value: inputArray_zoomed[index].shortname,
										queryBindId: 'Auch eine random UUID'
									}
								]
							});
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
		setSlider();
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
		dataPasser.addStratifierToQueryAPI({
			label: queryObject.values[0].value,
			catalogueGroupCode: queryObject.key,
			parentGroupCode: queryObject.system
		});
		console.log(dataPasser.getQueryAPI());
	};

	let showLogarithm: boolean = false;
	function handleLogarithmToggled(event: { detail: { headlineInitialLogarithm: boolean } }) {
		showLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.StudyPatientChartShowLogarithm = showLogarithm;
			return storeValues;
		});
	}

	function destroySlider() {
		if (slider?.noUiSlider) {
			slider.noUiSlider.destroy();
		}
	}

	let minSliderLabel = 0;
	let maxSliderLabel = 0;

	let leftSlider = 0;
	let rightSlider = 0;

	function setSlider() {
		destroySlider();

		slider = document.getElementById('slider-round') as SliderElement | null;

		let sliderMaxValue = inputArray.length - 1;
		if (!mounted) {
			leftSlider = Math.max(sliderMaxValue - 29, 0);
			rightSlider = sliderMaxValue;
		}
		if (!slider) {
			return;
		}

		noUiSlider.create(slider, {
			start: [leftSlider, rightSlider],
			range: {
				min: 0,
				max: sliderMaxValue
			}
		});

		// Binden Sie das 'slide'-Event an den Slider und rufen Sie handleSliderChange auf
		slider.noUiSlider?.on('change', (values: string[], handle: number) => {
			if (handle === 0) {
				leftSlider = parseInt(values[0]);
			} else {
				rightSlider = parseInt(values[1]);
			}
			sliderChanged = !sliderChanged; //slider Changed wird nur benötigt für reactive verhalten
		});

		minSliderLabel = sliderMaxValue - leftSlider + 1;
		maxSliderLabel = sliderMaxValue - rightSlider + 1;
	}
</script>

<lens-data-passer bind:this={dataPasser} />

<Headline
	headlineTitle={translate('studyPatientChartTitle')}
	headlineTooltip={translate('tooltip_StudyPatientChart')}
	headlineMaximize={maximizeStudyPatientChart}
	headlineShowChart={null}
	headlineIsChart={true}
	headlineInitialTop5={null}
	headlineInitialLogarithm={showLogarithm}
	headlineInputTableData={data}
	headlineChartJSElement={barChart}
	headlineD3Element={null}
	on:logarithmToggled={handleLogarithmToggled}
	on:maximized={handleMaximized}
/>

<div class="chart-container">
	<canvas bind:this={barChart} />
</div>
<div class="straight-line-container">
	<span class="min-slider">Top {minSliderLabel}</span>
	<div class="slider-container">
		<div id="slider-round" />
	</div>
	<span class="max-slider">Top {maxSliderLabel}</span>
</div>

<style>


	.slider-container{
  flex: 60%; padding-left: 5%; padding-right: 5%
}

.min-slider{
  padding-left: 5%;
}
.max-slider{
  padding-right: 5%;
}
</style>
