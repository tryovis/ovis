<script lang="ts">
	import GenericCategoryChart from '../../components/GenericCategoryChart.svelte';

	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { configStore } from '../../store/configStore';

	let dropdownObject = [
        {label:'Gesamtbeurt.',value: 'overallAssessment'},
        {label:'Lymphknoten', value:'lymphNodeState'},
        {label:'Metastasen',value:'metastasisState'},
        {label:'Primärtumor',value:'tumorState' },
        {label:'Verlaufsgrund',value:'progressReason'},
        {label:'Verlaufsquelle',value:'progressSource'},
        {label:'Vitalstatus',value:'vitalState'},
	];

	let maximizeProgressChart: boolean;
	let ProgressChartShowChart: boolean;
	let ProgressChartShowTop5: boolean;
	let ProgressChartShowNull: boolean;
	let ProgressChartShowLogarithm: boolean;
	let ProgressChartInitialDropdown: string;

	maxStore.subscribe((value: any) => {
		({ maximizeProgressChart } = value);
	});

	configStore.subscribe((value: any) => {
		ProgressChartShowChart = value.ProgressChartShowChart;
  		ProgressChartShowTop5 = value.ProgressChartShowTop5;
		ProgressChartShowNull = value.ProgressChartShowNull;
		ProgressChartShowLogarithm = value.ProgressChartShowLogarithm;
		ProgressChartInitialDropdown = value.ProgressChartInitialDropdown;
	});

	function handleMaximized(event: any) {
		maximizeProgressChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeProgressChart = !storeValues.maximizeProgressChart;
			return storeValues;
		});
	}

	function handleChartToggled(event: any) {
		ProgressChartShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.ProgressChartShowChart = !storeValues.ProgressChartShowChart;
			return storeValues;
		});
	}

	function handleTop5Toggled(event: any) {
		ProgressChartShowTop5 = event.detail.headlineInitialTop5;
		configStore.update((storeValues) => {
			storeValues.ProgressChartShowTop5 = !storeValues.ProgressChartShowTop5;
			return storeValues;
		});
	}

	function handleNull(event: any) {
		ProgressChartShowNull = event.detail.headlineNull;
		configStore.update((storeValues) => {
			storeValues.ProgressChartShowNull = !storeValues.ProgressChartShowNull;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		ProgressChartShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.ProgressChartShowLogarithm = !storeValues.ProgressChartShowLogarithm;
			return storeValues;
		});
	}

	function changedGenericChartDropdown(event: any) {
		const newDropdownValue = event.detail.initialDropdownValue;
		ProgressChartInitialDropdown = newDropdownValue;
		configStore.update((storeValues) => {
			storeValues.ProgressChartInitialDropdown = newDropdownValue;
			return storeValues;
		});
	}

	
</script>

<GenericCategoryChart
	aspectRatioMin={2.1}
	collection={'progress'}
	{dropdownObject}
	headlineTitle={$t("progressChartTitle")}
	headlineTooltip={"<p><b>"+$t("progressChartTitle")+"</b><hr></p>"+$t("tooltip_GenericChart")}
	initialDropdownValue={ProgressChartInitialDropdown}
	legendPosition={'right'}
	maxStoreValue={maximizeProgressChart}
	showChartStoreValue={ProgressChartShowChart}
	showTop5StoreValue={ProgressChartShowTop5}
	showNullStoreValue={ProgressChartShowNull}
	showLogarithmStoreValue={ProgressChartShowLogarithm}
	tableShownRowsMin={7}
	on:maximized={handleMaximized}
	on:chartToggled={handleChartToggled}
	on:top5Toggled={handleTop5Toggled}
	on:nullToggled={handleNull}
	on:logarithmToggled={handleLogarithmToggled}
	on:changedGenericChartDropdown={changedGenericChartDropdown}
/>