<script lang="ts">
	import { maxStore } from '../../store/maxStore';
	import { getSupplementaryChart } from '../../graphQl/gql-supplementary';
	import { t, locale, locales } from "../../store/languageStore";
	import GenericStackedBarChart from '../../components/GenericStackedBarChart.svelte';
	import { configStore } from '../../store/configStore';

	let headers = [ $t("complicationLong"), $t("grade"), $t("complGradeCount"), $t("complCount") ];

	// Access the store variables
	let maximizeSupplementaryChart: boolean;

	let SupplementaryChartShowChart: boolean;
	let SupplementaryChartShowTop5: boolean;

	maxStore.subscribe((value: any) => {
		({ maximizeSupplementaryChart } = value);
	});

	configStore.subscribe((value: any) => {
		SupplementaryChartShowChart = value.SupplementaryChartShowChart;
  		SupplementaryChartShowTop5 = value.SupplementaryChartShowTop5;
	});

	function handleMaximized(event: any) {
		maximizeSupplementaryChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeSupplementaryChart = !storeValues.maximizeSupplementaryChart;
			return storeValues; // Return the updated values
		});
	}

	function handleChartToggled(event: any) {
		SupplementaryChartShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.SupplementaryChartShowChart = !storeValues.SupplementaryChartShowChart;
			return storeValues;
		});
	}

	function handleTop5Toggled(event: any) {
		SupplementaryChartShowTop5 = event.detail.headlineInitialTop5;
		configStore.update((storeValues) => {
			storeValues.SupplementaryChartShowTop5 = !storeValues.SupplementaryChartShowTop5;
			return storeValues;
		});
	}

</script>
<GenericStackedBarChart
	initialAspectRatio = {1.05}
	collection = {"supplementary"}
	getGraphData={getSupplementaryChart}
	chartIdName={"supplementaryChart"}
	headlineTitle={$t("supplementaryBarChartTitle")}
	showTop10={true}
	showChartStoreValue={SupplementaryChartShowChart}
	showTop5StoreValue={SupplementaryChartShowTop5}
	tooltipAdditionalInfo={"Stadien, Klassifikationen oder Zusatzangaben"}
	tableHeaders={headers}
	maxStoreValue={maximizeSupplementaryChart}
	showLegend={false}
	on:maximized={handleMaximized}
	on:chartToggled={handleChartToggled}
	on:top5Toggled={handleTop5Toggled}
/>
