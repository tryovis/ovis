<script lang="ts">
	import { Chart, registerables, type ChartConfiguration } from 'chart.js';
	import 'chartjs-adapter-moment';
	import { get } from 'svelte/store';
	import { onDestroy, onMount, tick } from 'svelte';
	import Headline from '../../components/Headline.svelte';
	import {
		getUsageByModule,
		getUsageReport,
		getUsageByUser,
		getUsageTimeline,
		type UsageByModule,
		type UsageByUser,
		type UsageInterval,
		type UsageMetric,
		type UsageReport,
		type UsageTargetType,
		type UsageTimelinePoint
	} from '../../graphQl/gql-analytics';
	import { t } from '../../store/languageStore';
	import { userStore } from '../../store/userStore';

	Chart.register(...registerables);

	type ChartId = 'users' | 'timeline' | 'modules';
	type UserMetric = 'timeOnline' | 'filterClicks';
	type ReportItem = { label: string; value: string };
	const USER_VISIBLE_ROW_LIMIT = 10;

	let userCanvas: HTMLCanvasElement;
	let timelineCanvas: HTMLCanvasElement;
	let moduleCanvas: HTMLCanvasElement;
	let userChart: Chart | null = null;
	let timelineChart: Chart | null = null;
	let moduleChart: Chart | null = null;
	let userData: UsageByUser[] = [];
	let timelineData: UsageTimelinePoint[] = [];
	let moduleData: UsageByModule[] = [];
	let reportData: UsageReport | null = null;
	let reportItems: ReportItem[] = [];
	let reportExportRows: Record<string, unknown>[] = [];
	let userMetric: UserMetric = 'timeOnline';
	let timelineMetric: UsageMetric = 'ONLINE_TIME';
	let timelineInterval: UsageInterval = 'DAY';
	let moduleTarget: UsageTargetType = 'ALL';
	let maximized: ChartId | null = null;
	let userLoading = true;
	let timelineLoading = true;
	let moduleLoading = true;
	let reportLoading = true;
	let userError = false;
	let timelineError = false;
	let moduleError = false;
	let reportError = false;

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
	const formatNumber = (value: number, maximumFractionDigits = 1) =>
		value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits });
	const formatHours = (seconds: number) => `${formatNumber(seconds / 3600, 2)} ${$t('analyticsHours')}`;
	const formatDate = (timestamp: number) => new Date(timestamp).toLocaleDateString();

	$: reportItems = reportData
		? [
				{ label: $t('analyticsRegisteredUsers'), value: formatNumber(reportData.registeredUsers, 0) },
				{ label: $t('analyticsActivatedUsers'), value: formatNumber(reportData.activatedUsers, 0) },
				{ label: $t('analyticsActivationRate'), value: `${formatNumber(reportData.activationRate)} %` },
				{
					label: $t('analyticsAverageActivePerMonth'),
					value: formatNumber(reportData.averageActiveUsersPerMonth)
				},
				{
					label: $t('analyticsAverageActivePerQuarter'),
					value: formatNumber(reportData.averageActiveUsersPerQuarter)
				},
				{
					label: $t('analyticsAverageActivePerYear'),
					value: formatNumber(reportData.averageActiveUsersPerYear)
				},
				{
					label: $t('analyticsAverageActiveSinceStart'),
					value: formatNumber(reportData.averageActiveUsersSinceStart)
				},
				{
					label: $t('analyticsActiveSinceStart'),
					value: formatNumber(reportData.activeUsersSinceStart, 0)
				},
				{ label: $t('analyticsTotalTimeOnline'), value: formatHours(reportData.totalTimeOnline) },
				{
					label: $t('analyticsAverageTimePerUser'),
					value: formatHours(reportData.averageTimeOnlinePerUser)
				},
				{
					label: $t('analyticsMedianTimePerUser'),
					value: formatHours(reportData.medianTimeOnlinePerUser)
				}
			]
		: [];
	$: reportExportRows = [
		...reportItems.map((item) => ({ metric: item.label, value: item.value })),
		...(reportData?.trackingStart
			? [{ metric: $t('analyticsTrackingStart'), value: formatDate(reportData.trackingStart) }]
			: [])
	];

	onMount(async () => {
		await tick();
		await Promise.all([loadUserData(), loadTimelineData(), loadModuleData(), loadReportData()]);
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
			await renderUserChart();
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

	async function loadReportData() {
		reportLoading = true;
		reportError = false;
		try {
			reportData = await getUsageReport();
		} catch (error) {
			reportError = true;
			console.error('Could not load usage report:', error);
		} finally {
			reportLoading = false;
		}
	}

	async function renderUserChart() {
		if (!userCanvas) return;
		const sorted = [...userData].sort(
			(a, b) =>
				metricValue(b[userMetric] ?? 0, userMetric) - metricValue(a[userMetric] ?? 0, userMetric)
		);
		await tick();
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
		<div
			class="analytics-chart analytics-user-chart"
			class:scrollable={userData.length > USER_VISIBLE_ROW_LIMIT}
		>
			<div
				class="analytics-user-chart-content"
				style:height={`${Math.max(1, userData.length / USER_VISIBLE_ROW_LIMIT) * 100}%`}
			>
				<canvas bind:this={userCanvas} />
			</div>
		</div>
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

	<section
		class="analytics-report box_style box_level2"
		class:hidden={maximized !== null}
	>
		<Headline
			headlineTitle={$t('analyticsReportTitle')}
			headlineTooltip={$t('analyticsReportTooltip')}
			headlineIsChart={false}
			headlineInputTableData={reportExportRows}
			headlineInputTableHeader={[$t('analyticsReportMetric'), $t('analyticsReportValue')]}
			headlineInputTableFields={['metric', 'value']}
			headlineLoading={reportLoading}
		/>
		{#if reportError}
			<p class="report-empty">{$t('analyticsNoData')}</p>
		{:else}
			<div class="report-content">
				<div class="report-metrics">
					{#each reportItems as item}
						<div class="report-metric box_style box_level3">
							<span class="report-label">{item.label}</span>
							<strong class="report-value">{item.value}</strong>
						</div>
					{/each}
				</div>
				{#if reportData?.trackingStart}
					<p class="report-period">
						{$t('analyticsTrackingStart')}: {formatDate(reportData.trackingStart)}
					</p>
				{/if}
			</div>
		{/if}
	</section>
</div>

<style>
	.analytics-grid {
		display: grid;
		position: relative;
		height: 100%;
		min-height: 0;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(280px, 0.9fr);
		grid-template-rows: 50% 50%;
		grid-template-areas:
			'users timeline report'
			'modules modules report';
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
	.analytics-report {
		grid-area: report;
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

	.analytics-user-chart {
		overflow: hidden;
	}

	.analytics-user-chart.scrollable {
		overflow-y: auto;
	}

	.analytics-user-chart-content {
		position: relative;
		min-width: 0;
		min-height: 100%;
	}

	.report-content {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		padding: 4px 2px 2px;
	}

	.report-metrics {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
	}

	.report-metric {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 8px;
		min-height: 58px;
		margin: 0;
		padding: 8px;
		box-sizing: border-box;
	}

	.report-label {
		color: var(--muted-font-color);
		line-height: 1.25;
	}

	.report-value {
		font-size: 1.15rem;
		line-height: 1;
		color: var(--primary-color);
	}

	.report-period,
	.report-empty {
		margin: 8px 4px 2px;
		color: var(--muted-font-color);
	}

	.empty {
		position: absolute;
		align-self: center;
		top: 50%;
		margin: 0;
	}
</style>
