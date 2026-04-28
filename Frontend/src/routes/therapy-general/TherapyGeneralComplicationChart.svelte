<script lang="ts">
	import { maxStore } from '../../store/maxStore';
	import { getTherapyGeneralComplicationChart } from '../../graphQl/gql-therapy-general';
	import { t, locale, locales } from "../../store/languageStore";
	import GenericStackedBarChart from '../../components/GenericStackedBarChart.svelte';
	import { configStore } from '../../store/configStore';

	let headers = [ $t("complicationLong"), $t("grade"), $t("complGradeCount"), $t("complCount") ];

	// Access the store variables
	let maximizeTherapyGeneralComplicationChart: boolean;

	let TherapyGeneralComplicationChartShowChart: boolean;
	let TherapyGeneralComplicationChartShowTop5: boolean;

	maxStore.subscribe((value: any) => {
		({ maximizeTherapyGeneralComplicationChart } = value);
	});

	configStore.subscribe((value: any) => {
		TherapyGeneralComplicationChartShowChart = value.TherapyGeneralComplicationChartShowChart;
  		TherapyGeneralComplicationChartShowTop5 = value.TherapyGeneralComplicationChartShowTop5;
	});

	function handleMaximized(event: any) {
		maximizeTherapyGeneralComplicationChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTherapyGeneralComplicationChart = !storeValues.maximizeTherapyGeneralComplicationChart;
			return storeValues; // Return the updated values
		});
	}

	function handleChartToggled(event: any) {
		TherapyGeneralComplicationChartShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.TherapyGeneralComplicationChartShowChart = !storeValues.TherapyGeneralComplicationChartShowChart;
			return storeValues;
		});
	}

	function handleTop5Toggled(event: any) {
		TherapyGeneralComplicationChartShowTop5 = event.detail.headlineInitialTop5;
		configStore.update((storeValues) => {
			storeValues.TherapyGeneralComplicationChartShowTop5 = !storeValues.TherapyGeneralComplicationChartShowTop5;
			return storeValues;
		});
	}

</script>
<GenericStackedBarChart
	initialAspectRatio = {1.6}
	collection = {"therapy"}
	getGraphData={getTherapyGeneralComplicationChart}
	chartIdName={"therapyGeneralComplicationChart"}
	headlineTitle={$t("therapyComplicationTitle")}
	showTop10={false}
	showChartStoreValue={TherapyGeneralComplicationChartShowChart}
	showTop5StoreValue={TherapyGeneralComplicationChartShowTop5}
	tooltipAdditionalInfo={"Komplikationen"}
	tableHeaders={headers}
	maxStoreValue={maximizeTherapyGeneralComplicationChart}
	showLegend={false}
	on:maximized={handleMaximized}
	on:chartToggled={handleChartToggled}
	on:top5Toggled={handleTop5Toggled}
/>
