<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { showToast } from '../store/toastStore';
	import { get } from 'svelte/store';
	import { t } from '../store/languageStore';
	import { iconPath } from '$lib/path-utils';
	import { createDownloadName, downloadCanvasChart, downloadSvgChart } from '$lib/chart-download';
	import { showViewportTooltip } from '$lib/tooltip-popover';
	import HeadlineTableExport from './HeadlineTableExport.svelte';

	const downloadIcon = iconPath('download-icon.svg');
	const infoIcon = iconPath('info-outlined.svg');
	const tableIcon = iconPath('table.svg');
	const maxIcon = iconPath('window-maximize.svg');
	const minIcon = iconPath('window-minimize.svg');
	const chartIcon = iconPath('chart-bar.svg');
	const top5ActiveIcon = iconPath('star-fill.svg');
	const top5InactiveIcon = iconPath('star.svg');
	const linearIcon = iconPath('linear.svg');
	const logarithmIcon = iconPath('logarithm.svg');
	const loadingIcon = iconPath('spinner.svg');
	const nulloffIcon = iconPath('null-off.svg');
	const nullonIcon = iconPath('null-on.svg');
	const continueIcon = iconPath('continue.svg');

	export let headlineTitle: string;
	export let headlineTooltip: string | null = null;
	export let headlineMaximize: boolean | null = null;
	export let headlineShowChart: boolean | null = null;
	export let headlineIsChart: boolean | null = null;
	export let headlineInitialTop5: boolean | null = null;
	export let headlineInitialTop10: boolean | null = null;
	export let headlineInitialLogarithm: boolean | null = null;
	export let headlineInputTableData: Record<string, unknown>[] | null = null;
	export let headlineGetTableDataForExport:
		| ((
				onProgress: (loadedRows: number, expectedRows: number) => void
		  ) => Promise<Record<string, unknown>[]>)
		| null = null;
	export let headlineInputTableHeader: string[] | null = null;
	export let headlineInputTableFields: string[] | null = null;
	export let headlineChartJSElement: HTMLCanvasElement | null = null;
	export let headlineD3Element: HTMLObjectElement | SVGSVGElement | null = null;
	export let headlineLoading: boolean | null = null;
	export let headlineNull: boolean | null = null;
	export let headlineIsPaused: boolean | null = null;
	export let headlineLoadingComplete: boolean | null = null;

	let downloadName: string;

	const dispatch = createEventDispatcher();

	function copyInfo() {
		if (!headlineTooltip) return;
		const plainText = headlineTooltip.replace(/<[^>]*>/g, '');
		navigator.clipboard.writeText(plainText);
		showToast('Text des Informationsbuttons in Zwischenablage kopiert.');
	}

	function toggleChart() {
		headlineShowChart = !headlineShowChart;
		headlineIsChart = headlineShowChart;
		dispatch('chartToggled', { headlineShowChart });
	}

	function maximize() {
		headlineMaximize = !headlineMaximize;
		dispatch('maximized', { headlineMaximize });
	}

	function toggleLogarithm() {
		headlineInitialLogarithm = !headlineInitialLogarithm;
		dispatch('logarithmToggled', { headlineInitialLogarithm });
	}

	function toggleTop5() {
		headlineInitialTop5 = !headlineInitialTop5;
		dispatch('top5Toggled', { headlineInitialTop5 });
	}

	function toggleContinue() {
		dispatch('conitnueToggled');
	}

	function toggleNull() {
		headlineNull = !headlineNull;
		dispatch('nullToggled', { headlineNull });
	}

	function exportChart() {
		if (headlineChartJSElement != null) {
			downloadCanvasChart(headlineChartJSElement, downloadName);
		} else if (headlineD3Element != null) {
			downloadSvgChart(headlineD3Element, downloadName);
		}
	}

	onMount(async () => {
		await import('@samply/lens');
		if (headlineShowChart != null) {
			headlineIsChart = headlineShowChart;
		}
		downloadName = createDownloadName(headlineTitle);
	});

	let tooltipPosition = '';

	// Reactive translation function for template usage
	const translate = (key: string): string => get(t)(key);

	const handleMouseEnter = (event: MouseEvent) => {
		tooltipPosition = showViewportTooltip(event);
	};
</script>

<!-- prettier-ignore -->
<div>
	<div class="straight-line-container headline-row">
		<div class="headline-title-container">
			<b class="headline-title" title={headlineTitle}>{headlineTitle}</b>
			{#if headlineLoading}
				<i
					>→ {translate(headlineLoadingComplete ? 'loadingCapReached' : 'loadingContent')}</i
				>
				{#if headlineIsPaused && !headlineLoadingComplete}
					<button
						on:mouseenter={handleMouseEnter}
						class="iconRoundButton tooltip"
						on:click={toggleContinue}
					>
						<span class="tooltiptext" style={tooltipPosition}
							><b>Continue Loading</b><br /><br /><i
								>To ensure sufficient performance<br /> a maximum of 50,000 entries can be loaded.</i
							></span
						>
						<img src={continueIcon} alt="Toggle" class="iconRound" />
					</button>
				{:else if !headlineLoadingComplete}
					<button class="spinnerButton">
						<img id="spinner" src={loadingIcon} alt="Spinner" />
					</button>
				{/if}
			{/if}
		</div>
		<div class="icons-container">
			{#if headlineIsChart}
				{#if headlineInitialTop5 != null}
					<button
						on:mouseenter={handleMouseEnter}
						class="iconRoundButton tooltip"
						on:click={toggleTop5}
					>
						<span class="tooltiptext" style={tooltipPosition}>
							{headlineInitialTop5
								? translate('showAllResults')
								: headlineInitialTop10
								? translate('limitTop10Results')
								: translate('limitTop5Results')}
						</span>
						<img
							src={headlineInitialTop5 ? top5InactiveIcon : top5ActiveIcon}
							alt="Toggle"
							class="iconRound"
						/>
					</button>
				{/if}
				{#if headlineInitialLogarithm != null}
					<button
						on:mouseenter={handleMouseEnter}
						class="iconRoundButton tooltip"
						on:click={toggleLogarithm}
					>
						<span class="tooltiptext" style={tooltipPosition}
							>{headlineInitialLogarithm ? translate('changeToLinearView') : translate('changeToLogarithmicView')}
						</span>
						<img
							src={headlineInitialLogarithm ? linearIcon : logarithmIcon}
							alt="Toggle"
							class="iconRound"
						/>
					</button>
				{/if}
			{/if}
			{#if headlineShowChart != null}
				<button
					on:mouseenter={handleMouseEnter}
					class="iconRoundButton tooltip"
					on:click={toggleChart}
				>
					<span class="tooltiptext" style={tooltipPosition}
						>{headlineShowChart ? translate('headlineChangeToTable') : translate('headlineChangeToChart')}
					</span>
					<img src={headlineShowChart ? tableIcon : chartIcon} alt="Toggle" class="iconRound" />
				</button>
			{/if}
			{#if headlineNull != null}
				<button
					on:mouseenter={handleMouseEnter}
					class="iconRoundButton tooltip"
					on:click={toggleNull}
				>
					<span class="tooltiptext" style={tooltipPosition}
						>{headlineNull ? translate('hideNumOfEmptyValues') : translate('showNumOfEmptyValues')}
					</span>
					<img src={headlineNull ? nulloffIcon : nullonIcon} alt="Toggle" class="iconRound" />
				</button>
			{/if}
			{#if headlineIsChart}
				<button
					on:mouseenter={handleMouseEnter}
					class="iconRoundButton tooltip"
					on:click={exportChart}
				>
					<span class="tooltiptext" style={tooltipPosition}>Download {translate('chart')}</span>
					<img src={downloadIcon} alt="download" class="iconRound" />
				</button>
			{:else}
				<HeadlineTableExport
					{downloadName}
					tableData={headlineInputTableData}
					getTableDataForExport={headlineGetTableDataForExport}
					headers={headlineInputTableHeader}
					fields={headlineInputTableFields}
					exportDisabled={Boolean(headlineLoading)}
				/>
			{/if}

			{#if headlineTooltip}
				<button
					on:mouseenter={handleMouseEnter}
					class="iconRoundButton tooltip"
					on:click={copyInfo}
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<span class="tooltiptext" style={tooltipPosition}>{@html headlineTooltip}</span>
					<img src={infoIcon} alt="info" class="iconRound" />
				</button>
			{/if}
			{#if headlineMaximize != null}
				<button
					on:mouseenter={handleMouseEnter}
					class="iconRoundButton tooltip"
					on:click={maximize}
				>
					<span class="tooltiptext" style={tooltipPosition}
						>{headlineMaximize ? translate('minimize') : translate('maximize')}
					</span>
					<img src={headlineMaximize ? minIcon : maxIcon} alt="Toggle" class="iconRound" />
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.headline-row {
		flex-wrap: nowrap;
		gap: 4px;
		min-width: 0;
	}

	.headline-title-container {
		flex: 1 1 auto;
		justify-content: flex-start;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
	}

	.headline-title {
		display: block;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.icons-container {
		display: flex;
		flex: 0 0 auto;
		flex-wrap: nowrap;
		align-items: center;
		white-space: nowrap;
	}

	.icons-container :global(button) {
		flex: 0 0 auto;
	}
</style>
