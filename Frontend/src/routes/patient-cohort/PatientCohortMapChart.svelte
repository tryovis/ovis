<script lang="ts">
	import GenericSVG from "../../components/GenericSVG.svelte";
	import { maxStore } from '../../store/maxStore';
	import { configStore } from '../../store/configStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { publicAssetPath } from '$lib/path-utils';

	let PatientCohortMapChartShowLogarithm: boolean;
	let PatientCohortMapChartShowChart: boolean;

	configStore.subscribe((value: any) => {
		PatientCohortMapChartShowLogarithm = value.PatientCohortMapChartShowLogarithm;
		PatientCohortMapChartShowChart = value.PatientCohortMapChartShowChart;
	});

	let maximizePatientCohortMapChart: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizePatientCohortMapChart} = value);
	});
	
	function handleMaximized(event: any) {
		maximizePatientCohortMapChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizePatientCohortMapChart = !storeValues.maximizePatientCohortMapChart;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		PatientCohortMapChartShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.PatientCohortMapChartShowLogarithm = !storeValues.PatientCohortMapChartShowLogarithm;
			return storeValues;
		});
	}

	function handleChartToggled(event: any) {
		PatientCohortMapChartShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.PatientCohortMapChartShowChart = !storeValues.PatientCohortMapChartShowChart;
			return storeValues;
		});
	}
</script>

<GenericSVG
	SVGType={"patient"}
	currentSVG={publicAssetPath("/svg/patientWorldMaps/level1.svg")}
	currentLevel={1}
	SVGWidth={780}
	SVGHeight={480}
	headlineTitle={"Geographische Verteilung"}
	headlineTooltip={$t("tooltip_worldmap")}
	showLogarithmStoreValue={PatientCohortMapChartShowLogarithm}
	showChartStoreValue={PatientCohortMapChartShowChart}
	tableShownRowsMin={11}
	maxStoreValue={maximizePatientCohortMapChart}
	on:maximized={handleMaximized}
	on:logarithmToggled={handleLogarithmToggled}
	on:chartToggled={handleChartToggled}
/>