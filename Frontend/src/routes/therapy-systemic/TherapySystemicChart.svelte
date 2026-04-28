<script lang="ts">
	import GenericCategoryChart from '../../components/GenericCategoryChart.svelte';

	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { configStore } from '../../store/configStore';

	let dropdownObject = [
		{label: $t("measure"), value: 'subType'},
        {label: $t("protocol"), value: 'protocol'},
        {label: "Geplante Zyklen", value: 'cyclesPlanned'},
        {label: "Geplante Zyklen", value: 'cyclesPerformed'},
		{label: $t("doseDeviation"), value: 'doseDeviation'},
	];

	let maximizeTherapySystemicChart: boolean;
	let TherapySystemicChartShowChart: boolean;
	let TherapySystemicChartShowTop5: boolean;
	let TherapySystemicChartShowNull: boolean;
	let TherapySystemicChartShowLogarithm: boolean;
	let TherapySystemicChartInitialDropdown: string;

	maxStore.subscribe((value: any) => {
		({ maximizeTherapySystemicChart } = value);
	});

	configStore.subscribe((value: any) => {
		TherapySystemicChartShowChart = value.TherapySystemicChartShowChart;
  		TherapySystemicChartShowTop5 = value.TherapySystemicChartShowTop5;
		TherapySystemicChartShowNull = value.TherapySystemicChartShowNull;
		TherapySystemicChartShowLogarithm = value.TherapySystemicChartShowLogarithm;
		TherapySystemicChartInitialDropdown = value.TherapySystemicChartInitialDropdown;
	});

	function handleMaximized(event: any) {
		maximizeTherapySystemicChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTherapySystemicChart = !storeValues.maximizeTherapySystemicChart;
			return storeValues;
		});
	}

	function handleChartToggled(event: any) {
		TherapySystemicChartShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.TherapySystemicChartShowChart = !storeValues.TherapySystemicChartShowChart;
			return storeValues;
		});
	}

	function handleTop5Toggled(event: any) {
		TherapySystemicChartShowTop5 = event.detail.headlineInitialTop5;
		configStore.update((storeValues) => {
			storeValues.TherapySystemicChartShowTop5 = !storeValues.TherapySystemicChartShowTop5;
			return storeValues;
		});
	}

	function handleNull(event: any) {
		TherapySystemicChartShowNull = event.detail.headlineNull;
		configStore.update((storeValues) => {
			storeValues.TherapySystemicChartShowNull = !storeValues.TherapySystemicChartShowNull;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		TherapySystemicChartShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.TherapySystemicChartShowLogarithm = !storeValues.TherapySystemicChartShowLogarithm;
			return storeValues;
		});
	}

	function changedGenericChartDropdown(event: any) {
		const newDropdownValue = event.detail.initialDropdownValue;
		TherapySystemicChartInitialDropdown = newDropdownValue;
		configStore.update((storeValues) => {
			storeValues.TherapySystemicChartInitialDropdown = newDropdownValue;
			return storeValues;
		});
	}

	
</script>

<GenericCategoryChart
	aspectRatioMin={2.5}
	collection={'therapy'}
	{dropdownObject}
	headlineTitle={$t("systemicChartTitle")}
	headlineTooltip={"<p><b>"+$t("systemicChartTitle")+"</b><hr></p>"+$t("tooltip_GenericChart")}
	initialDropdownValue={TherapySystemicChartInitialDropdown}
	legendPosition={'right'}
	maxStoreValue={maximizeTherapySystemicChart}
	showChartStoreValue={TherapySystemicChartShowChart}
	showTop5StoreValue={TherapySystemicChartShowTop5}
	showNullStoreValue={TherapySystemicChartShowNull}
	showLogarithmStoreValue={TherapySystemicChartShowLogarithm}
	tableShownRowsMin={7}
	on:maximized={handleMaximized}
	on:chartToggled={handleChartToggled}
	on:top5Toggled={handleTop5Toggled}
	on:nullToggled={handleNull}
	on:logarithmToggled={handleLogarithmToggled}
	on:changedGenericChartDropdown={changedGenericChartDropdown}
/>