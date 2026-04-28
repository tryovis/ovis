<script lang="ts">
	import GenericCategoryChart from '../../components/GenericCategoryChart.svelte';

	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { configStore } from '../../store/configStore';

	let dropdownObject = [
        {label:'Art',value:'type'},
        {label:'Status',value: 'status'},
	];


	let maximizeConsultationChart: boolean;
	let ConsultationChartShowChart: boolean;
	let ConsultationChartShowTop5: boolean;
	let ConsultationChartShowNull: boolean;
	let ConsultationChartShowLogarithm: boolean;
	let ConsultationChartInitialDropdown: string;

	maxStore.subscribe((value: any) => {
		({ maximizeConsultationChart } = value);
	});

	configStore.subscribe((value: any) => {
		ConsultationChartShowChart = value.ConsultationChartShowChart;
  		ConsultationChartShowTop5 = value.ConsultationChartShowTop5;
		ConsultationChartShowNull = value.ConsultationChartShowNull;
		ConsultationChartShowLogarithm = value.ConsultationChartShowLogarithm;
		ConsultationChartInitialDropdown = value.ConsultationChartInitialDropdown;
	});

	function handleMaximized(event: any) {
		maximizeConsultationChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeConsultationChart = !storeValues.maximizeConsultationChart;
			return storeValues;
		});
	}

	function handleChartToggled(event: any) {
		ConsultationChartShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.ConsultationChartShowChart = !storeValues.ConsultationChartShowChart;
			return storeValues;
		});
	}

	function handleTop5Toggled(event: any) {
		ConsultationChartShowTop5 = event.detail.headlineInitialTop5;
		configStore.update((storeValues) => {
			storeValues.ConsultationChartShowTop5 = !storeValues.ConsultationChartShowTop5;
			return storeValues;
		});
	}

	function handleNull(event: any) {
		ConsultationChartShowNull = event.detail.headlineNull;
		configStore.update((storeValues) => {
			storeValues.ConsultationChartShowNull = !storeValues.ConsultationChartShowNull;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		ConsultationChartShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.ConsultationChartShowLogarithm = !storeValues.ConsultationChartShowLogarithm;
			return storeValues;
		});
	}

	function changedGenericChartDropdown(event: any) {
		const newDropdownValue = event.detail.initialDropdownValue;
		ConsultationChartInitialDropdown = newDropdownValue;
		configStore.update((storeValues) => {
			storeValues.ConsultationChartInitialDropdown = newDropdownValue;
			return storeValues;
		});
	}

	
</script>

<GenericCategoryChart
	aspectRatioMin={2}
	collection={'consultation'}
	{dropdownObject}
	headlineTitle={$t("consultationChartTitle")}
	headlineTooltip={"<p><b>"+$t("consultationChartTitle")+"</b><hr></p>"+$t("tooltip_GenericChart")}
	initialDropdownValue={ConsultationChartInitialDropdown}
	legendPosition={'right'}
	maxStoreValue={maximizeConsultationChart}
	showChartStoreValue={ConsultationChartShowChart}
	showTop5StoreValue={ConsultationChartShowTop5}
	showNullStoreValue={ConsultationChartShowNull}
	showLogarithmStoreValue={ConsultationChartShowLogarithm}
	tableShownRowsMin={7}
	on:maximized={handleMaximized}
	on:chartToggled={handleChartToggled}
	on:top5Toggled={handleTop5Toggled}
	on:nullToggled={handleNull}
	on:logarithmToggled={handleLogarithmToggled}
	on:changedGenericChartDropdown={changedGenericChartDropdown}
/>