<script lang="ts">
	import GenericSVG from "../../components/GenericSVG.svelte";
	import { maxStore } from '../../store/maxStore';
	import { configStore } from '../../store/configStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { publicAssetPath } from '$lib/path-utils';


	let PatientSingleMetastasisMapShowLogarithm: boolean;
	let PatientSingleMetastasisMapShowChart: boolean;

	configStore.subscribe((value: any) => {
		PatientSingleMetastasisMapShowLogarithm = value.PatientSingleMetastasisMapShowLogarithm;
		PatientSingleMetastasisMapShowChart = value.PatientSingleMetastasisMapShowChart;
	});

	let maximizePatientSingleMetastasisMap: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizePatientSingleMetastasisMap} = value);
	});
	
	function handleMaximized(event: any) {
		maximizePatientSingleMetastasisMap = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizePatientSingleMetastasisMap = !storeValues.maximizePatientSingleMetastasisMap;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		PatientSingleMetastasisMapShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.PatientSingleMetastasisMapShowLogarithm = !storeValues.PatientSingleMetastasisMapShowLogarithm;
			return storeValues;
		});
	}

	function handleChartToggled(event: any) {
		PatientSingleMetastasisMapShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.PatientSingleMetastasisMapShowChart = !storeValues.PatientSingleMetastasisMapShowChart;
			return storeValues;
		});
	}
</script>

<GenericSVG
	SVGType={"metastasis"}
	currentSVG={publicAssetPath("/svg/metastasen.svg")}
	currentLevel={1}
    SVGWidth={400}
    SVGHeight={360}
	headlineTitle={$t("tnmBodyMapTitle")}
	headlineTooltip={$t("tooltip_metastasemap")}
	showLogarithmStoreValue={PatientSingleMetastasisMapShowLogarithm}
	showChartStoreValue={PatientSingleMetastasisMapShowChart}
	tableShownRowsMin={7}
	maxStoreValue={maximizePatientSingleMetastasisMap}
	showLegend={false}
	on:maximized={handleMaximized}
	on:logarithmToggled={handleLogarithmToggled}
	on:chartToggled={handleChartToggled}
/>