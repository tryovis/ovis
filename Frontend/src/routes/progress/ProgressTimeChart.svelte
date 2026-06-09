<script lang="ts">
	import GenericTimeChart from '../../components/GenericTimeChart.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { configStore } from '../../store/configStore';

	const dropdownObject = [
		{ label: 'Gesamtbeurt.', value: 'overallAssessment' },
		{ label: 'Lymphknoten', value: 'lymphNodeState' },
		{ label: 'Metastasen', value: 'metastasisState' },
		{ label: 'Primärtumor', value: 'tumorState' },
		{ label: 'Verlaufsgrund', value: 'progressReason' },
		{ label: 'Verlaufsquelle', value: 'progressSource' },
	];

	let maximizeProgressTimeChart: boolean;

	let ProgressTimeChartShowLogarithm: boolean;
	let ProgressTimeChartTimeUnit: string;
	let ProgressTimeChartDatediff: boolean;
	let ProgressTimeChartMedian: string;
	let ProgressTimeChartEvent: string;
	let ProgressTimeChartDropdown: string;

	maxStore.subscribe((value: any) => {
		({ maximizeProgressTimeChart } = value);
	});

	configStore.subscribe((value: any) => {
		ProgressTimeChartShowLogarithm = value.ProgressTimeChartShowLogarithm;
		ProgressTimeChartTimeUnit = value.ProgressTimeChartTimeUnit;
		ProgressTimeChartDatediff = value.ProgressTimeChartDatediff;
		ProgressTimeChartMedian = value.ProgressTimeChartMedian;
		ProgressTimeChartEvent = value.ProgressTimeChartEvent;
		ProgressTimeChartDropdown = value.ProgressTimeChartDropdown;
	});

	function handleMaximized(event: any) {
		maximizeProgressTimeChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeProgressTimeChart = !storeValues.maximizeProgressTimeChart;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		ProgressTimeChartShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.ProgressTimeChartShowLogarithm = !storeValues.ProgressTimeChartShowLogarithm;
			return storeValues;
		});
	}

	function changedMedian(event: any) {
		ProgressTimeChartMedian = event.detail.selectedDimensionType;
		if (ProgressTimeChartMedian.includes("de")){ //de für deaktiviert
			ProgressTimeChartMedian = "indicatorDeactivated"
		}else{
			ProgressTimeChartMedian = "indicatorActivated"
		}
		configStore.update((storeValues) => {
			storeValues.ProgressTimeChartMedian = ProgressTimeChartMedian;
			return storeValues;
		});
	}

	function changedTimeUnit(event: any) {
		const newTimeUnit = event.detail.initialTimeUnit;
		ProgressTimeChartTimeUnit = newTimeUnit;
		const newDatediff = event.detail.initialDatediff;
		ProgressTimeChartDatediff = newDatediff;
		configStore.update((storeValues) => {
			storeValues.ProgressTimeChartTimeUnit = newTimeUnit;
			storeValues.ProgressTimeChartDatediff = newDatediff;
			return storeValues;
		});
	}

	function changedEvent(event: any) {
		const newTimeUnit = event.detail.selectedEventType;
		ProgressTimeChartEvent = newTimeUnit;
		configStore.update((storeValues) => {
			storeValues.ProgressTimeChartEvent = newTimeUnit;
			return storeValues;
		});
	}

	function changedDropdown(event: any) {
		const newTimeUnit = event.detail.initialDropdownValue;
		ProgressTimeChartDropdown = newTimeUnit;
		configStore.update((storeValues) => {
			storeValues.ProgressTimeChartDropdown = newTimeUnit;
			return storeValues;
		});
	}

</script>

<GenericTimeChart
  aspectRatioMin={3.5}
  {dropdownObject}
  initialDropdownValue={ProgressTimeChartDropdown}
  initialTimeUnit={ProgressTimeChartTimeUnit}
  initialDatediff={ProgressTimeChartDatediff}
  initialMedian={ProgressTimeChartMedian}
  selectedEventType={ProgressTimeChartEvent}
  headlineTitle={$t("timeChartTitleProgress")}
  maxStoreValue={maximizeProgressTimeChart}
  showLogarithmStoreValue={ProgressTimeChartShowLogarithm}
  collection={"progress"}
  on:maximized={handleMaximized}
  on:logarithmToggled={handleLogarithmToggled}
  on:changedTimeUnit={changedTimeUnit}
  on:changedMedian={changedMedian}
  on:changedEvent={changedEvent}
  on:changedDropdown={changedDropdown}
/>


