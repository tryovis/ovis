<script lang="ts">
	import { maxStore } from '../../store/maxStore';
	import { getMolecularMarkerChart } from '../../graphQl/gql-molecular-marker';
	import { t, locale, locales } from "../../store/languageStore";
	import GenericStackedBarChart from '../../components/GenericStackedBarChart.svelte';
	import { configStore } from '../../store/configStore';

	let headers = [ $t("complicationLong"), $t("grade"), $t("complGradeCount"), $t("complCount") ];

	// Access the store variables
	let maximizeMolecularMarkerChart: boolean;

	let MolecularMarkerChartShowChart: boolean;
	let MolecularMarkerChartShowTop5: boolean;

	maxStore.subscribe((value: any) => {
		({ maximizeMolecularMarkerChart } = value);
	});

	configStore.subscribe((value: any) => {
		MolecularMarkerChartShowChart = value.MolecularMarkerChartShowChart;
  		MolecularMarkerChartShowTop5 = value.MolecularMarkerChartShowTop5;
	});

	function handleMaximized(event: any) {
		maximizeMolecularMarkerChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeMolecularMarkerChart = !storeValues.maximizeMolecularMarkerChart;
			return storeValues; // Return the updated values
		});
	}

	function handleChartToggled(event: any) {
		MolecularMarkerChartShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.MolecularMarkerChartShowChart = !storeValues.MolecularMarkerChartShowChart;
			return storeValues;
		});
	}

	function handleTop5Toggled(event: any) {
		MolecularMarkerChartShowTop5 = event.detail.headlineInitialTop5;
		configStore.update((storeValues) => {
			storeValues.MolecularMarkerChartShowTop5 = !storeValues.MolecularMarkerChartShowTop5;
			return storeValues;
		});
	}

</script>
<GenericStackedBarChart
	initialAspectRatio = {1.05}
	collection = {"molecularMarker"}
	getGraphData={getMolecularMarkerChart}
	chartIdName={"molecularMarkerChart"}
	headlineTitle={$t("molecularMarkerBarChartTitle")}
	showTop10={true}
	showChartStoreValue={MolecularMarkerChartShowChart}
	showTop5StoreValue={MolecularMarkerChartShowTop5}
	tooltipAdditionalInfo={"Molekulare Marker"}
	tableHeaders={headers}
	maxStoreValue={maximizeMolecularMarkerChart}
	showLegend={true}
	on:maximized={handleMaximized}
	on:chartToggled={handleChartToggled}
	on:top5Toggled={handleTop5Toggled}
/>
