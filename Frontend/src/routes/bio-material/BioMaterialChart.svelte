<script lang="ts">
	import GenericCategoryChart from '../../components/GenericCategoryChart.svelte';

	import { maxStore } from '../../store/maxStore';
	import { configStore } from '../../store/configStore';
	import { t, locale, locales } from "../../store/languageStore";

    let dropdownObject = [
        {label:'Art',value:'type'},
        {label:'Status',value: 'status'},
        {label:'Projekt',value: 'project'}
    ];


	let maximizeBioMaterialChart: boolean;
	
	let BioMaterialChartShowChart: boolean;
	let BioMaterialChartShowTop5: boolean;
	let BioMaterialChartShowNull: boolean;
	let BioMaterialChartShowLogarithm: boolean;
	let BioMaterialChartInitialDropdown: string;

	maxStore.subscribe((value: any) => {
		({ maximizeBioMaterialChart } = value);
	});

	configStore.subscribe((value: any) => {
		BioMaterialChartShowChart = value.BioMaterialChartShowChart;
  		BioMaterialChartShowTop5 = value.BioMaterialChartShowTop5;
		BioMaterialChartShowNull = value.BioMaterialChartShowNull;
		BioMaterialChartShowLogarithm = value.BioMaterialChartShowLogarithm;
		BioMaterialChartInitialDropdown = value.BioMaterialChartInitialDropdown;
	});

	function handleMaximized(event: any) {
		maximizeBioMaterialChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeBioMaterialChart = !storeValues.maximizeBioMaterialChart;
			return storeValues;
		});
	}

	function handleChartToggled(event: any) {
		BioMaterialChartShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.BioMaterialChartShowChart = !storeValues.BioMaterialChartShowChart;
			return storeValues;
		});
	}

	function handleTop5Toggled(event: any) {
		BioMaterialChartShowTop5 = event.detail.headlineInitialTop5;
		configStore.update((storeValues) => {
			storeValues.BioMaterialChartShowTop5 = !storeValues.BioMaterialChartShowTop5;
			return storeValues;
		});
	}

	function handleNull(event: any) {
		BioMaterialChartShowNull = event.detail.headlineNull;
		configStore.update((storeValues) => {
			storeValues.BioMaterialChartShowNull = !storeValues.BioMaterialChartShowNull;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		BioMaterialChartShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.BioMaterialChartShowLogarithm = !storeValues.BioMaterialChartShowLogarithm;
			return storeValues;
		});
	}

	function changedGenericChartDropdown(event: any) {
		const newDropdownValue = event.detail.initialDropdownValue;
		BioMaterialChartInitialDropdown = newDropdownValue;
		configStore.update((storeValues) => {
			storeValues.BioMaterialChartInitialDropdown = newDropdownValue;
			return storeValues;
		});
	}
</script>

<GenericCategoryChart
	aspectRatioMin={1.1}
	collection={'bioMaterial'}
	{dropdownObject}
	headlineTitle={$t("bioMarkerChartTitle")}
	headlineTooltip={"<p><b>"+$t("bioMarkerChartTitle")+"</b><hr></p>"+$t("tooltip_GenericChart")}
	initialDropdownValue={BioMaterialChartInitialDropdown}
	legendPosition={'top'}
	maxStoreValue={maximizeBioMaterialChart}
	showChartStoreValue={BioMaterialChartShowChart}
	showTop5StoreValue={BioMaterialChartShowTop5}
	showNullStoreValue={BioMaterialChartShowNull}
	showLogarithmStoreValue={BioMaterialChartShowLogarithm}
	tableShownRowsMin={7}
	truncateLengthMin={25}
	on:maximized={handleMaximized}
	on:chartToggled={handleChartToggled}
	on:top5Toggled={handleTop5Toggled}
	on:nullToggled={handleNull}
	on:logarithmToggled={handleLogarithmToggled}
	on:changedGenericChartDropdown={changedGenericChartDropdown}
/>
