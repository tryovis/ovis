<script lang="ts">
	import GenericCategoryChart from '../../components/GenericCategoryChart.svelte';

	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { configStore } from '../../store/configStore';

	let dropdownObject = [
		{label: "Resektion", value: 'resectionType'},
        {label: $t("localResStatus"), value: 'localRState'},
        {label: $t("emergencySurgery"), value: 'emergencySurgery'},  
	];

	let maximizeTherapyOperationChart: boolean;
	let TherapyOperationChartShowChart: boolean;
	let TherapyOperationChartShowTop5: boolean;
	let TherapyOperationChartShowNull: boolean;
	let TherapyOperationChartShowLogarithm: boolean;
	let TherapyOperationChartInitialDropdown: string;

	maxStore.subscribe((value: any) => {
		({ maximizeTherapyOperationChart } = value);
	});

	configStore.subscribe((value: any) => {
		TherapyOperationChartShowChart = value.TherapyOperationChartShowChart;
  		TherapyOperationChartShowTop5 = value.TherapyOperationChartShowTop5;
		TherapyOperationChartShowNull = value.TherapyOperationChartShowNull;
		TherapyOperationChartShowLogarithm = value.TherapyOperationChartShowLogarithm;
		TherapyOperationChartInitialDropdown = value.TherapyOperationChartInitialDropdown;
	});

	function handleMaximized(event: any) {
		maximizeTherapyOperationChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTherapyOperationChart = !storeValues.maximizeTherapyOperationChart;
			return storeValues;
		});
	}

	function handleChartToggled(event: any) {
		TherapyOperationChartShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.TherapyOperationChartShowChart = !storeValues.TherapyOperationChartShowChart;
			return storeValues;
		});
	}

	function handleTop5Toggled(event: any) {
		TherapyOperationChartShowTop5 = event.detail.headlineInitialTop5;
		configStore.update((storeValues) => {
			storeValues.TherapyOperationChartShowTop5 = !storeValues.TherapyOperationChartShowTop5;
			return storeValues;
		});
	}

	function handleNull(event: any) {
		TherapyOperationChartShowNull = event.detail.headlineNull;
		configStore.update((storeValues) => {
			storeValues.TherapyOperationChartShowNull = !storeValues.TherapyOperationChartShowNull;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		TherapyOperationChartShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.TherapyOperationChartShowLogarithm = !storeValues.TherapyOperationChartShowLogarithm;
			return storeValues;
		});
	}

	function changedGenericChartDropdown(event: any) {
		const newDropdownValue = event.detail.initialDropdownValue;
		TherapyOperationChartInitialDropdown = newDropdownValue;
		configStore.update((storeValues) => {
			storeValues.TherapyOperationChartInitialDropdown = newDropdownValue;
			return storeValues;
		});
	}

	
</script>

<GenericCategoryChart
	aspectRatioMin={2.1}
	collection={'therapy'}
	{dropdownObject}
	headlineTitle={$t("surgeryChartTitle")}
	headlineTooltip={"<p><b>"+$t("surgeryChartTitle")+"</b><hr></p>"+$t("tooltip_GenericChart")}
	initialDropdownValue={TherapyOperationChartInitialDropdown}
	legendPosition={'right'}
	maxStoreValue={maximizeTherapyOperationChart}
	showChartStoreValue={TherapyOperationChartShowChart}
	showTop5StoreValue={TherapyOperationChartShowTop5}
	showNullStoreValue={TherapyOperationChartShowNull}
	showLogarithmStoreValue={TherapyOperationChartShowLogarithm}
	tableShownRowsMin={7}
	on:maximized={handleMaximized}
	on:chartToggled={handleChartToggled}
	on:top5Toggled={handleTop5Toggled}
	on:nullToggled={handleNull}
	on:logarithmToggled={handleLogarithmToggled}
	on:changedGenericChartDropdown={changedGenericChartDropdown}
/>