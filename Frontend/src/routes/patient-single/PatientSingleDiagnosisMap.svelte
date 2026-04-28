<script lang="ts">
	import GenericSVG from "../../components/GenericSVG.svelte";
	import { t, locale, locales } from "../../store/languageStore";
	import { configStore } from '../../store/configStore';
	import { publicAssetPath } from '$lib/path-utils';


	let PatientSingleDiagnosisMapShowLogarithm: boolean;
	let PatientSingleDiagnosisMapShowChart: boolean;

	configStore.subscribe((value: any) => {
		PatientSingleDiagnosisMapShowLogarithm = value.PatientSingleDiagnosisMapShowLogarithm;
		PatientSingleDiagnosisMapShowChart = value.PatientSingleDiagnosisMapShowChart;
	});

	function handleLogarithmToggled(event: any) {
		PatientSingleDiagnosisMapShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.PatientSingleDiagnosisMapShowLogarithm = !storeValues.PatientSingleDiagnosisMapShowLogarithm;
			return storeValues;
		});
	}

	function handleChartToggled(event: any) {
		PatientSingleDiagnosisMapShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.PatientSingleDiagnosisMapShowChart = !storeValues.PatientSingleDiagnosisMapShowChart;
			return storeValues;
		});
	}
</script>

<GenericSVG
	SVGType={"diagnosis"}
	currentSVG={publicAssetPath("/svg/diagnosisBodymap/level1.svg")}
	currentLevel={1}
    SVGWidth={400}
    SVGHeight={360}
	showLogarithmStoreValue={PatientSingleDiagnosisMapShowLogarithm}
	showChartStoreValue={PatientSingleDiagnosisMapShowChart}
	headlineTitle={$t("diagnosisBodyMapTitle")}
	headlineTooltip={$t("tooltip_bodymap")}
	tableShownRowsMin={7}
	showLegend={false}
	on:logarithmToggled={handleLogarithmToggled}
	on:chartToggled={handleChartToggled}
/>