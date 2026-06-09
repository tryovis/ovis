<script lang="ts">
	import GenericSVG from "../../components/GenericSVG.svelte";
	import { t, locale, locales } from "../../store/languageStore";
	import { configStore } from '../../store/configStore';
	import { publicAssetPath } from '$lib/path-utils';


	let DiagnosisBodymapShowLogarithm: boolean;
	let DiagnosisBodymapShowChart: boolean;

	configStore.subscribe((value: any) => {
		DiagnosisBodymapShowLogarithm = value.DiagnosisBodymapShowLogarithm;
		DiagnosisBodymapShowChart = value.DiagnosisBodymapShowChart;
	});

	function handleLogarithmToggled(event: any) {
		DiagnosisBodymapShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.DiagnosisBodymapShowLogarithm = !storeValues.DiagnosisBodymapShowLogarithm;
			return storeValues;
		});
	}

	function handleChartToggled(event: any) {
		DiagnosisBodymapShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.DiagnosisBodymapShowChart = !storeValues.DiagnosisBodymapShowChart;
			return storeValues;
		});
	}
</script>

<GenericSVG
	SVGType={"diagnosis"}
	currentSVG={publicAssetPath("/svg/diagnosisBodymap/level1.svg")}
	currentLevel={1}
	SVGWidth={600}
	SVGHeight={700}
	showLogarithmStoreValue={DiagnosisBodymapShowLogarithm}
	showChartStoreValue={DiagnosisBodymapShowChart}
	headlineTitle={$t("diagnosisBodyMapTitle")}
	headlineTooltip={$t("tooltip_bodymap")}
	tableShownRowsMin={20}
	on:logarithmToggled={handleLogarithmToggled}
	on:chartToggled={handleChartToggled}
/>