<script lang="ts">
	import { Chart, registerables, type ChartConfiguration } from 'chart.js';
	import 'chartjs-adapter-moment';
	import { get } from 'svelte/store';
	import { onDestroy, onMount, tick } from 'svelte';
	import Headline from '../../components/Headline.svelte';
	import {
		getUsageByModule,
		getUsageByUser,
		getUsageTimeline,
		type UsageByModule,
		type UsageByUser,
		type UsageInterval,
		type UsageMetric,
		type UsageTargetType,
		type UsageTimelinePoint
	} from '../../graphQl/gql-analytics';
	import { t } from '../../store/languageStore';
	import { userStore } from '../../store/userStore';

	Chart.register(...registerables);

	type ChartId = 'users' | 'timeline' | 'modules';
	type UserMetric = 'timeOnline' | 'filterClicks';

	let userCanvas: HTMLCanvasElement;
	let timelineCanvas: HTMLCanvasElement;
	let moduleCanvas: HTMLCanvasElement;
	let userChart: Chart | null = null;
	let timelineChart: Chart | null = null;
	let moduleChart: Chart | null = null;
	let userData: UsageByUser[] = [];
	let timelineData: UsageTimelinePoint[] = [];
	let moduleData: UsageByModule[] = [];
	let userMetric: UserMetric = 'timeOnline';
	let timelineMetric: UsageMetric = 'ONLINE_TIME';
	let timelineInterval: UsageInterval = 'DAY';
	let moduleTarget: UsageTargetType = 'ALL';
	let maximized: ChartId | null = null;
	let userLoading = true;
	let timelineLoading = true;
	let moduleLoading = true;
	let userError = false;
	let timelineError = false;
	let moduleError = false;

	const palette = () => {
		const colors = get(userStore).colorPalette ?? [];
		return colors.length > 0 ? colors : ['#4e79a7'];
	};

	const colorForIndex = (index: number) => palette()[index % palette().length];
	const asHours = (seconds: number) => Number((seconds / 3600).toFixed(2));
	const metricValue = (value: number, metric: UserMetric | UsageMetric) =>
		metric === 'timeOnline' || metric === 'ONLINE_TIME' ? asHours(value) : value;
	const metricUnit = (metric: UserMetric | UsageMetric) =>
		metric === 'timeOnline' || metric === 'ONLINE_TIME'
			? $t('analyticsHours')
			: $t('analyticsActions');

	onMount(async () => {
		await tick();
		await Promise.all([loadUserData(), loadTimelineData(), loadModuleData()]);
	});

	onDestroy(() => {
		userChart?.destroy();
		timelineChart?.destroy();
		moduleChart?.destroy();
	});

	async function loadUserData() {
		userLoading = true;
		userError = false;
		try {
			userData = await getUsageByUser();
			renderUserChart();
		} catch (error) {
			userError = true;
			console.error('Could not load user analytics:', error);
		} finally {
			userLoading = false;
		}
	}

	async function loadTimelineData() {
		timelineLoading = true;
		timelineError = false;
		try {
			timelineData = await getUsageTimeline(timelineMetric, timelineInterval);
			renderTimelineChart();
		} catch (error) {
			timelineError = true;
			console.error('Could not load usage timeline:', error);
		} finally {
			timelineLoading = false;
		}
	}

	async function loadModuleData() {
		moduleLoading = true;
		moduleError = false;
		try {
			moduleData = await getUsageByModule(moduleTarget);
			renderModuleChart();
		} catch (error) {
			moduleError = true;
			console.error('Could not load module analytics:', error);
		} finally {
			moduleLoading = false;
		}
	}

	function renderUserChart() {
		if (!userCanvas) return;
		const sorted = [...userData].sort(
			(a, b) =>
				metricValue(b[userMetric] ?? 0, userMetric) - metricValue(a[userMetric] ?? 0, userMetric)
		);
		userChart?.destroy();
		userChart = new Chart(userCanvas, {
			type: 'bar',
			data: {
				labels: sorted.map((row) => row.userId),
				datasets: [
					{
						label: metricUnit(userMetric),
						data: sorted.map((row) => metricValue(row[userMetric] ?? 0, userMetric)),
						backgroundColor: sorted.map((_row, index) => colorForIndex(index))
					}
				]
			},
			options: horizontalBarOptions(metricUnit(userMetric))
		} as ChartConfiguration<'bar'>);
	}

	function renderTimelineChart() {
		if (!timelineCanvas) return;
		timelineChart?.destroy();
		timelineChart = new Chart(timelineCanvas, {
			type: 'line',
			data: {
				datasets: [
					{
						label: metricUnit(timelineMetric),
						data: timelineData.map((point) => ({
							x: point.timestamp,
							y: metricValue(point.value, timelineMetric)
						})),
						borderColor: colorForIndex(0),
						backgroundColor: colorForIndex(0),
						fill: false,
						tension: 0.2
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: { legend: { display: false } },
				scales: {
					x: {
						type: 'time',
						time: { unit: timelineInterval.toLowerCase() as 'day' | 'week' | 'month' }
					},
					y: { beginAtZero: true, title: { display: true, text: metricUnit(timelineMetric) } }
				}
			}
		} as ChartConfiguration<'line'>);
	}

	function renderModuleChart() {
		if (!moduleCanvas) return;
		moduleChart?.destroy();
		moduleChart = new Chart(moduleCanvas, {
			type: 'bar',
			data: {
				labels: moduleData.map((row) => row.module.replace(':', ' · ')),
				datasets: [
					{
						label: $t('analyticsActions'),
						data: moduleData.map((row) => row.count),
						backgroundColor: moduleData.map((_row, index) => colorForIndex(index))
					}
				]
			},
			options: horizontalBarOptions($t('analyticsActions'))
		} as ChartConfiguration<'bar'>);
	}

	function horizontalBarOptions(axisTitle: string) {
		return {
			indexAxis: 'y' as const,
			responsive: true,
			maintainAspectRatio: false,
			plugins: { legend: { display: false } },
			scales: {
				x: { beginAtZero: true, title: { display: true, text: axisTitle } },
				y: { ticks: { autoSkip: false } }
			}
		};
	}

	function handleMaximized(event: CustomEvent<{ headlineMaximize: boolean }>, chartId: ChartId) {
		maximized = event.detail.headlineMaximize ? chartId : null;
		requestAnimationFrame(() => {
			userChart?.resize();
			timelineChart?.resize();
			moduleChart?.resize();
		});
	}
</script>

<div class="analytics-grid" class:maximized={maximized !== null}>
	<section
		class="analytics-users box_style box_level2"
		class:hidden={maximized && maximized !== 'users'}
	>
		<Headline
			headlineTitle={$t('analyticsUserMetricTitle')}
			headlineTooltip={$t('analyticsUserMetricTooltip')}
			headlineMaximize={maximized === 'users'}
			headlineIsChart={true}
			headlineChartJSElement={userCanvas}
			headlineLoading={userLoading}
			on:maximized={(event) => handleMaximized(event, 'users')}
		/>
		<div class="straight-line-container analytics-controls">
			<div class="dropdown-container">
				<div class="dropdown">
					<label for="analytics-user-metric">{$t('analyticsMetric')}:</label>
					<select
						class="dropbtn"
						id="analytics-user-metric"
						bind:value={userMetric}
						on:change={renderUserChart}
					>
						<option class="dropdown-option" value="timeOnline">{$t('analyticsOnlineTime')}</option>
						<option class="dropdown-option" value="filterClicks">{$t('analyticsFilterActions')}</option>
					</select>
				</div>
			</div>
		</div>
		<div class="analytics-chart"><canvas bind:this={userCanvas} /></div>
		{#if userError || (!userLoading && userData.length === 0)}<p class="empty">
				{$t('analyticsNoData')}
			</p>{/if}
	</section>

	<section
		class="analytics-timeline box_style box_level2"
		class:hidden={maximized && maximized !== 'timeline'}
	>
		<Headline
			headlineTitle={$t('analyticsTimelineTitle')}
			headlineTooltip={$t('analyticsTimelineTooltip')}
			headlineMaximize={maximized === 'timeline'}
			headlineIsChart={true}
			headlineChartJSElement={timelineCanvas}
			headlineLoading={timelineLoading}
			on:maximized={(event) => handleMaximized(event, 'timeline')}
		/>
		<div class="straight-line-container analytics-controls">
			<div class="dropdown-container">
				<div class="dropdown">
					<label for="analytics-time-metric">{$t('analyticsMetric')}:</label>
					<select
						class="dropbtn"
						id="analytics-time-metric"
						bind:value={timelineMetric}
						on:change={loadTimelineData}
					>
						<option class="dropdown-option" value="ONLINE_TIME">{$t('analyticsOnlineTime')}</option>
						<option class="dropdown-option" value="FILTER_ACTIONS">{$t('analyticsFilterActions')}</option>
						<option class="dropdown-option" value="MODULE_INTERACTIONS">
							{$t('analyticsModuleActions')}
						</option>
					</select>
				</div>
				<div class="dropdown">
					<label for="analytics-time-interval">{$t('analyticsInterval')}:</label>
					<select
						class="dropbtn"
						id="analytics-time-interval"
						bind:value={timelineInterval}
						on:change={loadTimelineData}
					>
						<option class="dropdown-option" value="DAY">{$t('analyticsDay')}</option>
						<option class="dropdown-option" value="WEEK">{$t('analyticsWeek')}</option>
						<option class="dropdown-option" value="MONTH">{$t('analyticsMonth')}</option>
					</select>
				</div>
			</div>
		</div>
		<div class="analytics-chart"><canvas bind:this={timelineCanvas} /></div>
		{#if timelineError || (!timelineLoading && timelineData.length === 0)}<p class="empty">
				{$t('analyticsNoData')}
			</p>{/if}
	</section>

	<section
		class="analytics-modules box_style box_level2"
		class:hidden={maximized && maximized !== 'modules'}
	>
		<Headline
			headlineTitle={$t('analyticsModuleTitle')}
			headlineTooltip={$t('analyticsModuleTooltip')}
			headlineMaximize={maximized === 'modules'}
			headlineIsChart={true}
			headlineChartJSElement={moduleCanvas}
			headlineLoading={moduleLoading}
			on:maximized={(event) => handleMaximized(event, 'modules')}
		/>
		<div class="straight-line-container analytics-controls">
			<div class="dropdown-container">
				<div class="dropdown">
					<label for="analytics-module-target">{$t('analyticsInteractionType')}:</label>
					<select
						class="dropbtn"
						id="analytics-module-target"
						bind:value={moduleTarget}
						on:change={loadModuleData}
					>
						<option class="dropdown-option" value="ALL">{$t('analyticsAll')}</option>
						<option class="dropdown-option" value="CHART">{$t('analyticsCharts')}</option>
						<option class="dropdown-option" value="TABLE">{$t('analyticsTables')}</option>
						<option class="dropdown-option" value="VISUALIZATION">
							{$t('analyticsVisualizations')}
						</option>
					</select>
				</div>
			</div>
		</div>
		<div class="analytics-chart"><canvas bind:this={moduleCanvas} /></div>
		{#if moduleError || (!moduleLoading && moduleData.length === 0)}<p class="empty">
				{$t('analyticsNoData')}
			</p>{/if}
	</section>
</div>

<style>
	.analytics-grid {
		display: grid;
		position: relative;
		height: 100%;
		min-height: 0;
		grid-template-columns: 50% 50%;
		grid-template-rows: 50% 50%;
		grid-template-areas:
			'users timeline'
			'modules modules';
	}

	.analytics-grid.maximized {
		display: block;
	}

	.analytics-users {
		grid-area: users;
	}
	.analytics-timeline {
		grid-area: timeline;
	}
	.analytics-modules {
		grid-area: modules;
	}

	.analytics-grid section {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	.analytics-grid section.hidden {
		display: none;
	}

	.analytics-grid.maximized section:not(.hidden) {
		height: 100%;
	}

	.analytics-controls {
		flex: 0 0 auto;
		padding: 4px 0;
	}

	.analytics-controls .dropdown-container {
		min-width: 0;
	}

	.analytics-controls .dropdown {
		display: grid;
		gap: 2px;
		min-width: 0;
		margin-right: 10px;
		grid-template-rows: auto auto;
	}

	.analytics-controls label,
	.analytics-controls .dropbtn {
		display: block;
		min-width: 0;
		width: 100%;
	}

	.analytics-chart {
		position: relative;
		flex: 1 1 auto;
		min-width: 0;
		min-height: 0;
		padding: 4px 10px 8px;
	}

	.analytics-chart canvas {
		width: 100% !important;
		height: 100% !important;
	}

	.empty {
		position: absolute;
		align-self: center;
		top: 50%;
		margin: 0;
	}
</style>
