<script lang="ts">
	import GenericSVG from "../../components/GenericSVG.svelte";
	import { maxStore } from '../../store/maxStore';
	import { configStore } from '../../store/configStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { publicAssetPath } from '$lib/path-utils';


	let TNMBodyMapShowLogarithm: boolean;
	let TNMBodyMapShowChart: boolean;

	configStore.subscribe((value: any) => {
		TNMBodyMapShowLogarithm = value.TNMBodyMapShowLogarithm;
		TNMBodyMapShowChart = value.TNMBodyMapShowChart;
	});

	let maximizeTNMBodyMap: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeTNMBodyMap} = value);
	});
	
	function handleMaximized(event: any) {
		maximizeTNMBodyMap = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTNMBodyMap = !storeValues.maximizeTNMBodyMap;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		TNMBodyMapShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.TNMBodyMapShowLogarithm = !storeValues.TNMBodyMapShowLogarithm;
			return storeValues;
		});
	}

	function handleChartToggled(event: any) {
		TNMBodyMapShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.TNMBodyMapShowChart = !storeValues.TNMBodyMapShowChart;
			return storeValues;
		});
	}
</script>

<GenericSVG
	SVGType={"metastasis"}
	currentSVG={publicAssetPath("/svg/metastasen.svg")}
	currentLevel={1}
    SVGWidth={420}
    SVGHeight={470}
	headlineTitle={$t("tnmBodyMapTitle")}
	headlineTooltip={$t("tooltip_metastasemap")}
	showLogarithmStoreValue={TNMBodyMapShowLogarithm}
	showChartStoreValue={TNMBodyMapShowChart}
	tableShownRowsMin={10}
	maxStoreValue={maximizeTNMBodyMap}
	on:maximized={handleMaximized}
	on:logarithmToggled={handleLogarithmToggled}
	on:chartToggled={handleChartToggled}
/>