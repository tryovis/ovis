<script lang="ts">
	import GenericCategoryChart from '../../components/GenericCategoryChart.svelte';

	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { configStore } from '../../store/configStore';

	let dropdownObject = [
      
        {label: $t("type"), value: 'generalType'},
		{label: 'Intention', value:'intention' },
		{label: $t("operationPosition"), value: 'surgeryContext'},
		{label: $t("terminationReason"), value:'terminationReason'},
        {label: "Status", value:'status'},
        {label: 'Int/Ex', value:'internal'},
		{label: $t("treatingClinic"), value:'organizationalUnit'}

	];

	let maximizeTherapyGeneralChart: boolean;
	let TherapyGeneralChartShowChart: boolean;
	let TherapyGeneralChartShowTop5: boolean;
	let TherapyGeneralChartShowNull: boolean;
	let TherapyGeneralChartShowLogarithm: boolean;
	let TherapyGeneralChartInitialDropdown: string;

	maxStore.subscribe((value: any) => {
		({ maximizeTherapyGeneralChart } = value);
	});

	configStore.subscribe((value: any) => {
		TherapyGeneralChartShowChart = value.TherapyGeneralChartShowChart;
  		TherapyGeneralChartShowTop5 = value.TherapyGeneralChartShowTop5;
		TherapyGeneralChartShowNull = value.TherapyGeneralChartShowNull;
		TherapyGeneralChartShowLogarithm = value.TherapyGeneralChartShowLogarithm;
		TherapyGeneralChartInitialDropdown = value.TherapyGeneralChartInitialDropdown;
	});

	function handleMaximized(event: any) {
		maximizeTherapyGeneralChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTherapyGeneralChart = !storeValues.maximizeTherapyGeneralChart;
			return storeValues;
		});
	}

	function handleChartToggled(event: any) {
		TherapyGeneralChartShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.TherapyGeneralChartShowChart = !storeValues.TherapyGeneralChartShowChart;
			return storeValues;
		});
	}

	function handleTop5Toggled(event: any) {
		TherapyGeneralChartShowTop5 = event.detail.headlineInitialTop5;
		configStore.update((storeValues) => {
			storeValues.TherapyGeneralChartShowTop5 = !storeValues.TherapyGeneralChartShowTop5;
			return storeValues;
		});
	}

	function handleNull(event: any) {
		TherapyGeneralChartShowNull = event.detail.headlineNull;
		configStore.update((storeValues) => {
			storeValues.TherapyGeneralChartShowNull = !storeValues.TherapyGeneralChartShowNull;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		TherapyGeneralChartShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.TherapyGeneralChartShowLogarithm = !storeValues.TherapyGeneralChartShowLogarithm;
			return storeValues;
		});
	}

	function changedGenericChartDropdown(event: any) {
		const newDropdownValue = event.detail.initialDropdownValue;
		TherapyGeneralChartInitialDropdown = newDropdownValue;
		configStore.update((storeValues) => {
			storeValues.TherapyGeneralChartInitialDropdown = newDropdownValue;
			return storeValues;
		});
	}

	
</script>

<GenericCategoryChart
	aspectRatioMin={1.8}
	collection={'therapy'}
	{dropdownObject}
	headlineTitle={$t("therapyGeneralChartTitle")}
	headlineTooltip={"<p><b>"+$t("therapyGeneralChartTitle")+"</b><hr></p>"+$t("tooltip_GenericChart")}
	initialDropdownValue={TherapyGeneralChartInitialDropdown}
	legendPosition={'right'}
	maxStoreValue={maximizeTherapyGeneralChart}
	showChartStoreValue={TherapyGeneralChartShowChart}
	showTop5StoreValue={TherapyGeneralChartShowTop5}
	showNullStoreValue={TherapyGeneralChartShowNull}
	showLogarithmStoreValue={TherapyGeneralChartShowLogarithm}
	tableShownRowsMin={7}
	on:maximized={handleMaximized}
	on:chartToggled={handleChartToggled}
	on:top5Toggled={handleTop5Toggled}
	on:nullToggled={handleNull}
	on:logarithmToggled={handleLogarithmToggled}
	on:changedGenericChartDropdown={changedGenericChartDropdown}
/>