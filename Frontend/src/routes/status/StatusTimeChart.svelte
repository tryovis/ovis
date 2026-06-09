<script lang="ts">
	import GenericTimeChart from '../../components/GenericTimeChart.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { configStore } from '../../store/configStore';

    const dropdownObject = [
        {label:'Art',value:'type'},
        {label:'Status',value: 'status'}
    ];


	let maximizeStatusTimeChart: boolean;

	let StatusTimeChartShowLogarithm: boolean;
	let StatusTimeChartTimeUnit: string;
	let StatusTimeChartDatediff: boolean;
	let StatusTimeChartMedian: string;
	let StatusTimeChartEvent: string;
	let StatusTimeChartDropdown: string;

	maxStore.subscribe((value: any) => {
		({ maximizeStatusTimeChart } = value);
	});

	configStore.subscribe((value: any) => {
		StatusTimeChartShowLogarithm = value.StatusTimeChartShowLogarithm;
		StatusTimeChartTimeUnit = value.StatusTimeChartTimeUnit;
		StatusTimeChartDatediff = value.StatusTimeChartDatediff;
		StatusTimeChartMedian = value.StatusTimeChartMedian;
		StatusTimeChartEvent = value.StatusTimeChartEvent;
		StatusTimeChartDropdown = value.StatusTimeChartDropdown;
	});

	function handleMaximized(event: any) {
		maximizeStatusTimeChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeStatusTimeChart = !storeValues.maximizeStatusTimeChart;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		StatusTimeChartShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.StatusTimeChartShowLogarithm = !storeValues.StatusTimeChartShowLogarithm;
			return storeValues;
		});
	}

	function changedMedian(event: any) {
		StatusTimeChartMedian = event.detail.selectedDimensionType;
		if (StatusTimeChartMedian.includes("de")){ //de für deaktiviert
			StatusTimeChartMedian = "indicatorDeactivated"
		}else{
			StatusTimeChartMedian = "indicatorActivated"
		}
		configStore.update((storeValues) => {
			storeValues.StatusTimeChartMedian = StatusTimeChartMedian;
			return storeValues;
		});
	}

	function changedTimeUnit(event: any) {
		const newTimeUnit = event.detail.initialTimeUnit;
		StatusTimeChartTimeUnit = newTimeUnit;
		const newDatediff = event.detail.initialDatediff;
		StatusTimeChartDatediff = newDatediff;
		configStore.update((storeValues) => {
			storeValues.StatusTimeChartTimeUnit = newTimeUnit;
			storeValues.StatusTimeChartDatediff = newDatediff;
			return storeValues;
		});
	}

	function changedEvent(event: any) {
		const newTimeUnit = event.detail.selectedEventType;
		StatusTimeChartEvent = newTimeUnit;
		configStore.update((storeValues) => {
			storeValues.StatusTimeChartEvent = newTimeUnit;
			return storeValues;
		});
	}

	function changedDropdown(event: any) {
		const newTimeUnit = event.detail.initialDropdownValue;
		StatusTimeChartDropdown = newTimeUnit;
		configStore.update((storeValues) => {
			storeValues.StatusTimeChartDropdown = newTimeUnit;
			return storeValues;
		});
	}

</script>

<GenericTimeChart
  aspectRatioMin={3.5}
  {dropdownObject}
  initialDropdownValue={StatusTimeChartDropdown}
  initialTimeUnit={StatusTimeChartTimeUnit}
  initialDatediff={StatusTimeChartDatediff}
  initialMedian={StatusTimeChartMedian}
  selectedEventType={StatusTimeChartEvent}
  headlineTitle={$t("timeChartTitleStatus")}
  maxStoreValue={maximizeStatusTimeChart}
  showLogarithmStoreValue={StatusTimeChartShowLogarithm}
  collection={"status"}
  on:maximized={handleMaximized}
  on:logarithmToggled={handleLogarithmToggled}
  on:changedTimeUnit={changedTimeUnit}
  on:changedMedian={changedMedian}
  on:changedEvent={changedEvent}
  on:changedDropdown={changedDropdown}
/>


