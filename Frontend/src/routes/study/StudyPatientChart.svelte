<script lang="ts">
	// @ts-nocheck
	import { Chart, registerables } from 'chart.js';
	import type { ChartConfiguration } from 'chart.js';
	import { onDestroy, onMount, tick } from 'svelte';
	import annotationPlugin from 'chartjs-plugin-annotation';
	import noUiSlider from 'nouislider';
	import { get } from 'svelte/store';
	import type { LensDataPasser } from '@samply/lens';
	import Headline from '../../components/Headline.svelte';
	import { addUserFilter } from '../../components/UserFilter';
	import { getStudyOverviewTable } from '../../graphQl/gql-study';
	import { createLatestRequest } from '../../lib/latestRequest.js';
	import { configStore } from '../../store/configStore';
	import { filterActiveStore } from '../../store/filterActiveStore.js';
	import { t } from '../../store/languageStore';
	import { maxStore } from '../../store/maxStore';
	import { reloadOnly } from '../../store/reloadStore';
	import { userStore } from '../../store/userStore';
	import { buildStudyChartRows, createStudyShortnameQueryItem } from './studyPatientChartModel.js';
	import '../../nouislider.css';

	const translate = (key: string): string => get(t)(key);

	type StudyChartRow = {
		shortname: string;
		displayShortname: string;
		studyPatients: number;
	};
	type SliderInstance = {
		destroy: () => void;
		on: (event: 'change', callback: (values: string[], handle: number) => void) => void;
	};
	type SliderElement = HTMLDivElement & { noUiSlider?: SliderInstance };

	let filterActive = true;
	let filter = JSON.stringify({ operand: 'OR', children: [] });
	let dataPasser: LensDataPasser;
	let slider: SliderElement | null = null;
	let primaryColor: string;
	let aspectRatio = 3;
	let maximizeStudyPatientChart: boolean;
	let showLogarithm = false;
	let barChart: HTMLCanvasElement;
	let chartInstance: Chart | null = null;
	let data: StudyChartRow[] = [];
	let inputArray: StudyChartRow[] = [];
	let mounted = false;
	let destroyed = false;
	let resizeTimer: ReturnType<typeof setTimeout> | null = null;
	let minSliderLabel = 0;
	let maxSliderLabel = 0;
	let leftSlider = 0;
	let rightSlider = 0;
	const studyRequest = createLatestRequest();

	const unsubscribeFilterActive = filterActiveStore.subscribe((value) => {
		filterActive = value.filterActive;
	});
	const unsubscribeUser = userStore.subscribe((value: { primaryColor: string }) => {
		({ primaryColor } = value);
		if (mounted) renderBarChart();
	});
	const unsubscribeMax = maxStore.subscribe((value: { maximizeStudyPatientChart: boolean }) => {
		({ maximizeStudyPatientChart } = value);
	});
	const unsubscribeConfig = configStore.subscribe(
		(value: { StudyPatientChartShowLogarithm: boolean }) => {
			showLogarithm = value.StudyPatientChartShowLogarithm;
		}
	);

	Chart.register(...registerables, annotationPlugin);

	function usesMobileLandscapeLayout(): boolean {
		return (
			typeof document !== 'undefined' &&
			document.documentElement.dataset.ovisMobileLayout === 'landscape'
		);
	}

	function handleMaximized(event: { detail: { headlineMaximize: boolean } }) {
		maximizeStudyPatientChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeStudyPatientChart = !storeValues.maximizeStudyPatientChart;
			return storeValues;
		});
		if (resizeTimer) clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			if (destroyed) return;
			aspectRatio = maximizeStudyPatientChart ? 2.15 : 3;
			renderBarChart();
		}, 0);
	}

	onMount(async () => {
		await import('@samply/lens');
		await customElements.whenDefined('lens-data-passer');
		await tick();
		if (destroyed) return;
		mounted = true;
		await loadStudyData();
	});

	async function loadStudyData() {
		const request = studyRequest.start();
		try {
			filter = filterActive
				? JSON.stringify(dataPasser.getAstAPI())
				: JSON.stringify({ operand: 'OR', children: [] });
			filter = JSON.stringify(await addUserFilter(JSON.parse(filter)));
			const studies = await getStudyOverviewTable(null, null, filter);
			if (!studyRequest.isCurrent(request)) return;

			inputArray = buildStudyChartRows(studies);
			data = inputArray;
			initializeSliderRange();
			setSlider();
			renderBarChart();
		} catch (error) {
			if (studyRequest.isCurrent(request)) {
				console.error('Error while loading the study patient chart:', error);
			}
		}
	}

	function renderBarChart() {
		if (!mounted || destroyed || !barChart) return;
		const ctx = barChart.getContext('2d');
		if (!ctx) return;

		chartInstance?.destroy();
		chartInstance = null;
		if (inputArray.length === 0) return;

		const zoomedRows = inputArray.slice(leftSlider, rightSlider + 1);
		const chartConfig: ChartConfiguration = {
			type: 'bar',
			data: {
				labels: zoomedRows.map((item) => item.displayShortname),
				datasets: [
					{
						data: zoomedRows.map((item) => item.studyPatients),
						backgroundColor: primaryColor
					}
				]
			},
			options: {
				aspectRatio,
				maintainAspectRatio: !usesMobileLandscapeLayout(),
				scales: {
					x: { type: 'category' },
					y: {
						type: showLogarithm ? 'logarithmic' : 'linear',
						title: { display: true, text: 'onkol. Studienpatienten' }
					}
				},
				plugins: { legend: { display: false } },
				onClick: (_event, elements) => {
					if (elements.length === 0) return;
					const selectedStudy = zoomedRows[elements[0].index];
					if (!selectedStudy) return;
					addItem(createStudyShortnameQueryItem(selectedStudy));
					reloadOnly();
				}
			}
		};
		chartInstance = new Chart(ctx, chartConfig);
	}

	const addItem = (queryObject): void => {
		dataPasser.addStratifierToQueryAPI({
			label: queryObject.values[0].value,
			catalogueGroupCode: queryObject.key,
			parentGroupCode: queryObject.system
		});
	};

	function handleLogarithmToggled(event: { detail: { headlineInitialLogarithm: boolean } }) {
		showLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.StudyPatientChartShowLogarithm = showLogarithm;
			return storeValues;
		});
		renderBarChart();
	}

	function destroySlider() {
		slider?.noUiSlider?.destroy();
	}

	function initializeSliderRange() {
		if (inputArray.length === 0) {
			leftSlider = 0;
			rightSlider = 0;
			return;
		}
		rightSlider = inputArray.length - 1;
		leftSlider = Math.max(rightSlider - 29, 0);
	}

	function setSlider() {
		destroySlider();
		if (!slider || inputArray.length === 0) {
			minSliderLabel = 0;
			maxSliderLabel = 0;
			return;
		}
		const sliderMaxValue = inputArray.length - 1;
		noUiSlider.create(slider, {
			start: [leftSlider, rightSlider],
			range: { min: 0, max: sliderMaxValue }
		});
		slider.noUiSlider?.on('change', (values: string[], handle: number) => {
			if (handle === 0) leftSlider = parseInt(values[0]);
			else rightSlider = parseInt(values[1]);
			updateSliderLabels();
			renderBarChart();
		});
		updateSliderLabels();
	}

	function updateSliderLabels() {
		const sliderMaxValue = inputArray.length - 1;
		minSliderLabel = sliderMaxValue - leftSlider + 1;
		maxSliderLabel = sliderMaxValue - rightSlider + 1;
	}

	onDestroy(() => {
		destroyed = true;
		mounted = false;
		studyRequest.invalidate();
		if (resizeTimer) clearTimeout(resizeTimer);
		destroySlider();
		chartInstance?.destroy();
		chartInstance = null;
		unsubscribeFilterActive();
		unsubscribeUser();
		unsubscribeMax();
		unsubscribeConfig();
	});
</script>

<div class="study-patient-chart-root">
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
	<div class="straight-line-container study-chart-slider">
		<span class="min-slider">Top {minSliderLabel}</span>
		<div class="slider-container">
			<div id="slider-round" bind:this={slider} />
		</div>
		<span class="max-slider">Top {maxSliderLabel}</span>
	</div>
</div>

<style>
	.study-patient-chart-root {
		display: contents;
	}

	:global(html[data-ovis-mobile-layout='landscape']) .study-patient-chart-root {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	:global(html[data-ovis-mobile-layout='landscape']) .study-patient-chart-root .chart-container {
		position: relative;
		flex: 1 1 auto;
		width: 100%;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	:global(html[data-ovis-mobile-layout='landscape'])
		.study-patient-chart-root
		.chart-container
		canvas {
		display: block;
		width: 100% !important;
		height: 100% !important;
	}

	:global(html[data-ovis-mobile-layout='landscape']) .study-chart-slider {
		flex: 0 0 auto;
		padding-bottom: 4px;
	}

	.slider-container {
		flex: 60%;
		padding-left: 5%;
		padding-right: 5%;
	}

	.min-slider {
		padding-left: 5%;
	}

	.max-slider {
		padding-right: 5%;
	}
</style>
