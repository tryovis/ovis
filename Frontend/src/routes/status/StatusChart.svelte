<script lang="ts">
	import GenericCategoryChart from '../../components/GenericCategoryChart.svelte';

	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { configStore } from '../../store/configStore';

	let dropdownObject = [
        {label:'Art',value:'type'},
        {label:'Ausprägung',value:'status'},
	];


	let maximizeStatusChart: boolean;
	let StatusChartShowChart: boolean;
	let StatusChartShowTop5: boolean;
	let StatusChartShowNull: boolean;
	let StatusChartShowLogarithm: boolean;
	let StatusChartInitialDropdown: string;

	maxStore.subscribe((value: any) => {
		({ maximizeStatusChart } = value);
	});

	configStore.subscribe((value: any) => {
		StatusChartShowChart = value.StatusChartShowChart;
  		StatusChartShowTop5 = value.StatusChartShowTop5;
		StatusChartShowNull = value.StatusChartShowNull;
		StatusChartShowLogarithm = value.StatusChartShowLogarithm;
		StatusChartInitialDropdown = value.StatusChartInitialDropdown;
	});

	function handleMaximized(event: any) {
		maximizeStatusChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeStatusChart = !storeValues.maximizeStatusChart;
			return storeValues;
		});
	}

	function handleChartToggled(event: any) {
		StatusChartShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.StatusChartShowChart = !storeValues.StatusChartShowChart;
			return storeValues;
		});
	}

	function handleTop5Toggled(event: any) {
		StatusChartShowTop5 = event.detail.headlineInitialTop5;
		configStore.update((storeValues) => {
			storeValues.StatusChartShowTop5 = !storeValues.StatusChartShowTop5;
			return storeValues;
		});
	}

	function handleNull(event: any) {
		StatusChartShowNull = event.detail.headlineNull;
		configStore.update((storeValues) => {
			storeValues.StatusChartShowNull = !storeValues.StatusChartShowNull;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		StatusChartShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.StatusChartShowLogarithm = !storeValues.StatusChartShowLogarithm;
			return storeValues;
		});
	}

	function changedGenericChartDropdown(event: any) {
		const newDropdownValue = event.detail.initialDropdownValue;
		StatusChartInitialDropdown = newDropdownValue;
		configStore.update((storeValues) => {
			storeValues.StatusChartInitialDropdown = newDropdownValue;
			return storeValues;
		});
	}

	
</script>

<GenericCategoryChart
	aspectRatioMin={2}
	collection={'status'}
	{dropdownObject}
	headlineTitle={$t("statusChartTitle")}
	headlineTooltip={"<p><b>"+$t("statusChartTitle")+"</b><hr></p>"+$t("tooltip_GenericChart")}
	initialDropdownValue={StatusChartInitialDropdown}
	legendPosition={'right'}
	maxStoreValue={maximizeStatusChart}
	showChartStoreValue={StatusChartShowChart}
	showTop5StoreValue={StatusChartShowTop5}
	showNullStoreValue={StatusChartShowNull}
	showLogarithmStoreValue={StatusChartShowLogarithm}
	tableShownRowsMin={7}
	on:maximized={handleMaximized}
	on:chartToggled={handleChartToggled}
	on:top5Toggled={handleTop5Toggled}
	on:nullToggled={handleNull}
	on:logarithmToggled={handleLogarithmToggled}
	on:changedGenericChartDropdown={changedGenericChartDropdown}
/>