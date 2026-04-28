<script lang="ts">
	import GenericCategoryChart from '../../components/GenericCategoryChart.svelte';

	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { configStore } from '../../store/configStore';

	let dropdownObject = [
        {label:'Klinik (kurz)',value:'organisationShort'},
		{label:'Klinik (voll)',value:'organisationFull'},
        {label:'Status',value: 'status'},
        {label:'Phase', value:'phase'},
	];

	let maximizeStudyChart: boolean;
	let StudyChartShowChart: boolean;
	let StudyChartShowTop5: boolean;
	let StudyChartShowNull: boolean;
	let StudyChartShowLogarithm: boolean;
	let StudyChartInitialDropdown: string;

	maxStore.subscribe((value: any) => {
		({ maximizeStudyChart } = value);
	});

	configStore.subscribe((value: any) => {
		StudyChartShowChart = value.StudyChartShowChart;
  		StudyChartShowTop5 = value.StudyChartShowTop5;
		StudyChartShowNull = value.StudyChartShowNull;
		StudyChartShowLogarithm = value.StudyChartShowLogarithm;
		StudyChartInitialDropdown = value.StudyChartInitialDropdown;
	});

	function handleMaximized(event: any) {
		maximizeStudyChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeStudyChart = !storeValues.maximizeStudyChart;
			return storeValues;
		});
	}

	function handleChartToggled(event: any) {
		StudyChartShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.StudyChartShowChart = !storeValues.StudyChartShowChart;
			return storeValues;
		});
	}

	function handleTop5Toggled(event: any) {
		StudyChartShowTop5 = event.detail.headlineInitialTop5;
		configStore.update((storeValues) => {
			storeValues.StudyChartShowTop5 = !storeValues.StudyChartShowTop5;
			return storeValues;
		});
	}

	function handleNull(event: any) {
		StudyChartShowNull = event.detail.headlineNull;
		configStore.update((storeValues) => {
			storeValues.StudyChartShowNull = !storeValues.StudyChartShowNull;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		StudyChartShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.StudyChartShowLogarithm = !storeValues.StudyChartShowLogarithm;
			return storeValues;
		});
	}

	function changedGenericChartDropdown(event: any) {
		const newDropdownValue = event.detail.initialDropdownValue;
		StudyChartInitialDropdown = newDropdownValue;
		configStore.update((storeValues) => {
			storeValues.StudyChartInitialDropdown = newDropdownValue;
			return storeValues;
		});
	}

	
</script>

<GenericCategoryChart
	aspectRatioMin={2}
	collection={'study'}
	{dropdownObject}
	headlineTitle={$t("studyChartTitle")}
	headlineTooltip={"<p><b>"+$t("studyChartTitle")+"</b><hr></p>"+$t("tooltip_GenericChart")}
	initialDropdownValue={StudyChartInitialDropdown}
	legendPosition={'right'}
	maxStoreValue={maximizeStudyChart}
	showChartStoreValue={StudyChartShowChart}
	showTop5StoreValue={StudyChartShowTop5}
	showNullStoreValue={StudyChartShowNull}
	showLogarithmStoreValue={StudyChartShowLogarithm}
	tableShownRowsMin={7}
	on:maximized={handleMaximized}
	on:chartToggled={handleChartToggled}
	on:top5Toggled={handleTop5Toggled}
	on:nullToggled={handleNull}
	on:logarithmToggled={handleLogarithmToggled}
	on:changedGenericChartDropdown={changedGenericChartDropdown}
/>