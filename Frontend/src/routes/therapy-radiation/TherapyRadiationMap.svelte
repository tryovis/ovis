<script lang="ts">
	import GenericSVG from '../../components/GenericSVG.svelte';
	import { maxStore } from '../../store/maxStore';
	import { configStore } from '../../store/configStore';
	import { t } from '../../store/languageStore';
	import { publicAssetPath } from '$lib/path-utils';

	let TherapyRadiationMapShowLogarithm: boolean;
	let TherapyRadiationMapShowChart: boolean;

	configStore.subscribe((value: any) => {
		TherapyRadiationMapShowLogarithm = value.TherapyRadiationMapShowLogarithm;
		TherapyRadiationMapShowChart = value.TherapyRadiationMapShowChart;
	});

	let maximizeTherapyRadiationMap: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeTherapyRadiationMap } = value);
	});

	function handleMaximized(event: any) {
		maximizeTherapyRadiationMap = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTherapyRadiationMap = !storeValues.maximizeTherapyRadiationMap;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		TherapyRadiationMapShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.TherapyRadiationMapShowLogarithm = !storeValues.TherapyRadiationMapShowLogarithm;
			return storeValues;
		});
	}

	function handleChartToggled(event: any) {
		TherapyRadiationMapShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.TherapyRadiationMapShowChart = !storeValues.TherapyRadiationMapShowChart;
			return storeValues;
		});
	}

	// Overlay steuerbar machen (true = WIP sichtbar)
	let wip = false;
</script>

<!-- Wrapper, damit Overlay über ALLES (inkl. Headline in GenericSVG) liegt -->
<!--<div class="wip-wrapper">-->
<GenericSVG
	SVGType={'therapy'}
	currentSVG={publicAssetPath('/svg/radiationMap/level1.svg')}
	currentLevel={1}
	SVGWidth={800}
	SVGHeight={420}
	headlineTitle={$t('radiationBodyMapTitle') + '(Graphics are Work in Progress)'}
	headlineTooltip={$t('tooltip_TherapyRadiationMap')}
	showLogarithmStoreValue={TherapyRadiationMapShowLogarithm}
	showChartStoreValue={TherapyRadiationMapShowChart}
	tableShownRowsMin={10}
	maxStoreValue={maximizeTherapyRadiationMap}
	on:maximized={handleMaximized}
	on:logarithmToggled={handleLogarithmToggled}
	on:chartToggled={handleChartToggled}
/>

<!-- {#if wip}
    <div class="overlay"><span>Work in Progress</span></div>
 {/if}
</div>-->

<style>
	.wip-wrapper {
		position: relative; /* Referenz für das Overlay */
	}

	.overlay {
		position: absolute;
		inset: 0; /* top/right/bottom/left: 0 */
		background: rgba(0, 0, 0, 0.6); /* halbtransparent schwarz */
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
		font-weight: 700;
		color: #fff;
		pointer-events: all; /* blockiert Klicks */
		z-index: 50; /* über dem Inhalt */
		user-select: none;
	}
</style>
