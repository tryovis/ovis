<script lang="ts">
	import GenericCategoryChart from '../../components/GenericCategoryChart.svelte';

	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { configStore } from '../../store/configStore';

	let dropdownObject = [
		{label: $t("type"), value:'radiation_type'},
        {label: $t("brachyType"), value: 'radiation_brachyType'}, // Eventuell das hier ein Fehler radiationTYpe
		{label: $t("technology"), value:'radiation_tech'},
        {label: $t("radioType"), value: 'radiation_radioType'},
        {label: $t("radioNuclid"), value: 'radiation_radioNuclid'},
        {label: $t("radiationLymphNodes"), value: 'radiation_lymphNodes'},
		{label: $t("boost"), value: 'radiation_boost'},
		{label: $t("radioTargetType"), value: 'radiation_radioTarget'},
		{label: $t("radiationPerformance"), value: 'radiation_performance'},
        {label: $t("radiationStereo"), value: 'radiation_stereo'},
		{label: $t("radiationBreath"), value: 'radiation_breath'},
		{label: $t("duration"), value: 'radiation_duration'},
	];

	let maximizeTherapyRadiationChart: boolean;
	let TherapyRadiationChartShowChart: boolean;
	let TherapyRadiationChartShowTop5: boolean;
	let TherapyRadiationChartShowNull: boolean;
	let TherapyRadiationChartShowLogarithm: boolean;
	let TherapyRadiationChartInitialDropdown: string;

	maxStore.subscribe((value: any) => {
		({ maximizeTherapyRadiationChart } = value);
	});

	configStore.subscribe((value: any) => {
		TherapyRadiationChartShowChart = value.TherapyRadiationChartShowChart;
  		TherapyRadiationChartShowTop5 = value.TherapyRadiationChartShowTop5;
		TherapyRadiationChartShowNull = value.TherapyRadiationChartShowNull;
		TherapyRadiationChartShowLogarithm = value.TherapyRadiationChartShowLogarithm;
		TherapyRadiationChartInitialDropdown = value.TherapyRadiationChartInitialDropdown;
	});

	function handleMaximized(event: any) {
		maximizeTherapyRadiationChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTherapyRadiationChart = !storeValues.maximizeTherapyRadiationChart;
			return storeValues;
		});
	}

	function handleChartToggled(event: any) {
		TherapyRadiationChartShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.TherapyRadiationChartShowChart = !storeValues.TherapyRadiationChartShowChart;
			return storeValues;
		});
	}

	function handleTop5Toggled(event: any) {
		TherapyRadiationChartShowTop5 = event.detail.headlineInitialTop5;
		configStore.update((storeValues) => {
			storeValues.TherapyRadiationChartShowTop5 = !storeValues.TherapyRadiationChartShowTop5;
			return storeValues;
		});
	}

	function handleNull(event: any) {
		TherapyRadiationChartShowNull = event.detail.headlineNull;
		configStore.update((storeValues) => {
			storeValues.TherapyRadiationChartShowNull = !storeValues.TherapyRadiationChartShowNull;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		TherapyRadiationChartShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.TherapyRadiationChartShowLogarithm = !storeValues.TherapyRadiationChartShowLogarithm;
			return storeValues;
		});
	}

	function changedGenericChartDropdown(event: any) {
		const newDropdownValue = event.detail.initialDropdownValue;
		TherapyRadiationChartInitialDropdown = newDropdownValue;
		configStore.update((storeValues) => {
			storeValues.TherapyRadiationChartInitialDropdown = newDropdownValue;
			return storeValues;
		});
	}

	
</script>

<GenericCategoryChart
	aspectRatioMin={2.1}
	collection={'therapy'}
	{dropdownObject}
	headlineTitle={$t("radiationChartTitle")}
	headlineTooltip={"<p><b>"+$t("radiationChartTitle")+"</b><hr></p>"+$t("tooltip_GenericChart")}
	initialDropdownValue={TherapyRadiationChartInitialDropdown}
	legendPosition={'right'}
	maxStoreValue={maximizeTherapyRadiationChart}
	showChartStoreValue={TherapyRadiationChartShowChart}
	showTop5StoreValue={TherapyRadiationChartShowTop5}
	showNullStoreValue={TherapyRadiationChartShowNull}
	showLogarithmStoreValue={TherapyRadiationChartShowLogarithm}
	tableShownRowsMin={7}
	on:maximized={handleMaximized}
	on:chartToggled={handleChartToggled}
	on:top5Toggled={handleTop5Toggled}
	on:nullToggled={handleNull}
	on:logarithmToggled={handleLogarithmToggled}
	on:changedGenericChartDropdown={changedGenericChartDropdown}
/>