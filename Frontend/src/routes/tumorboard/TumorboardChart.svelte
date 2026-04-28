<script lang="ts">
	import GenericCategoryChart from '../../components/GenericCategoryChart.svelte';

	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { configStore } from '../../store/configStore';

	let dropdownObject = [
        {label:'Art',value:'type'},
	];


	let maximizeTumorboardChart: boolean;
	let TumorboardChartShowChart: boolean;
	let TumorboardChartShowTop5: boolean;
	let TumorboardChartShowNull: boolean;
	let TumorboardChartShowLogarithm: boolean;
	let TumorboardChartInitialDropdown: string;

	maxStore.subscribe((value: any) => {
		({ maximizeTumorboardChart } = value);
	});

	configStore.subscribe((value: any) => {
		TumorboardChartShowChart = value.TumorboardChartShowChart;
  		TumorboardChartShowTop5 = value.TumorboardChartShowTop5;
		TumorboardChartShowNull = value.TumorboardChartShowNull;
		TumorboardChartShowLogarithm = value.TumorboardChartShowLogarithm;
		TumorboardChartInitialDropdown = value.TumorboardChartInitialDropdown;
	});

	function handleMaximized(event: any) {
		maximizeTumorboardChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTumorboardChart = !storeValues.maximizeTumorboardChart;
			return storeValues;
		});
	}

	function handleChartToggled(event: any) {
		TumorboardChartShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.TumorboardChartShowChart = !storeValues.TumorboardChartShowChart;
			return storeValues;
		});
	}

	function handleTop5Toggled(event: any) {
		TumorboardChartShowTop5 = event.detail.headlineInitialTop5;
		configStore.update((storeValues) => {
			storeValues.TumorboardChartShowTop5 = !storeValues.TumorboardChartShowTop5;
			return storeValues;
		});
	}

	function handleNull(event: any) {
		TumorboardChartShowNull = event.detail.headlineNull;
		configStore.update((storeValues) => {
			storeValues.TumorboardChartShowNull = !storeValues.TumorboardChartShowNull;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		TumorboardChartShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.TumorboardChartShowLogarithm = !storeValues.TumorboardChartShowLogarithm;
			return storeValues;
		});
	}

	function changedGenericChartDropdown(event: any) {
		const newDropdownValue = event.detail.initialDropdownValue;
		TumorboardChartInitialDropdown = newDropdownValue;
		configStore.update((storeValues) => {
			storeValues.TumorboardChartInitialDropdown = newDropdownValue;
			return storeValues;
		});
	}

	
</script>

<GenericCategoryChart
	aspectRatioMin={2}
	collection={'tumorBoard'}
	{dropdownObject}
	headlineTitle={$t("tumorboardChartTitle")}
	headlineTooltip={"<p><b>"+$t("tumorboardChartTitle")+"</b><hr></p>"+$t("tooltip_GenericChart")}
	initialDropdownValue={TumorboardChartInitialDropdown}
	legendPosition={'right'}
	maxStoreValue={maximizeTumorboardChart}
	showChartStoreValue={TumorboardChartShowChart}
	showTop5StoreValue={TumorboardChartShowTop5}
	showNullStoreValue={TumorboardChartShowNull}
	showLogarithmStoreValue={TumorboardChartShowLogarithm}
	tableShownRowsMin={7}
	on:maximized={handleMaximized}
	on:chartToggled={handleChartToggled}
	on:top5Toggled={handleTop5Toggled}
	on:nullToggled={handleNull}
	on:logarithmToggled={handleLogarithmToggled}
	on:changedGenericChartDropdown={changedGenericChartDropdown}
/>