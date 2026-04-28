<script lang="ts">
	import GenericTimeChart from '../../components/GenericTimeChart.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { configStore } from '../../store/configStore';

    const dropdownObject = [
        {label:'Art',value:'type'},
    ];



	let maximizeTumorboardTimeChart: boolean;

	let TumorboardTimeChartShowLogarithm: boolean;
	let TumorboardTimeChartTimeUnit: string;
	let TumorboardTimeChartDatediff: boolean;
	let TumorboardTimeChartMedian: string;
	let TumorboardTimeChartEvent: string;
	let TumorboardTimeChartDropdown: string;

	maxStore.subscribe((value: any) => {
		({ maximizeTumorboardTimeChart } = value);
	});

	configStore.subscribe((value: any) => {
		TumorboardTimeChartShowLogarithm = value.TumorboardTimeChartShowLogarithm;
		TumorboardTimeChartTimeUnit = value.TumorboardTimeChartTimeUnit;
		TumorboardTimeChartDatediff = value.TumorboardTimeChartDatediff;
		TumorboardTimeChartMedian = value.TumorboardTimeChartMedian;
		TumorboardTimeChartEvent = value.TumorboardTimeChartEvent;
		TumorboardTimeChartDropdown = value.TumorboardTimeChartDropdown;
	});

	function handleMaximized(event: any) {
		maximizeTumorboardTimeChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTumorboardTimeChart = !storeValues.maximizeTumorboardTimeChart;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		TumorboardTimeChartShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.TumorboardTimeChartShowLogarithm = !storeValues.TumorboardTimeChartShowLogarithm;
			return storeValues;
		});
	}

	function changedMedian(event: any) {
		TumorboardTimeChartMedian = event.detail.selectedDimensionType;
		if (TumorboardTimeChartMedian.includes("de")){ //de für deaktiviert
			TumorboardTimeChartMedian = "indicatorDeactivated"
		}else{
			TumorboardTimeChartMedian = "indicatorActivated"
		}
		configStore.update((storeValues) => {
			storeValues.TumorboardTimeChartMedian = TumorboardTimeChartMedian;
			return storeValues;
		});
	}

	function changedTimeUnit(event: any) {
		const newTimeUnit = event.detail.initialTimeUnit;
		TumorboardTimeChartTimeUnit = newTimeUnit;
		const newDatediff = event.detail.initialDatediff;
		TumorboardTimeChartDatediff = newDatediff;
		configStore.update((storeValues) => {
			storeValues.TumorboardTimeChartTimeUnit = newTimeUnit;
			storeValues.TumorboardTimeChartDatediff = newDatediff;
			return storeValues;
		});
	}

	function changedEvent(event: any) {
		const newTimeUnit = event.detail.selectedEventType;
		TumorboardTimeChartEvent = newTimeUnit;
		configStore.update((storeValues) => {
			storeValues.TumorboardTimeChartEvent = newTimeUnit;
			return storeValues;
		});
	}

	function changedDropdown(event: any) {
		const newTimeUnit = event.detail.initialDropdownValue;
		TumorboardTimeChartDropdown = newTimeUnit;
		configStore.update((storeValues) => {
			storeValues.TumorboardTimeChartDropdown = newTimeUnit;
			return storeValues;
		});
	}

</script>

<GenericTimeChart
  aspectRatioMin={3.5}
  {dropdownObject}
  initialDropdownValue={TumorboardTimeChartDropdown}
  initialTimeUnit={TumorboardTimeChartTimeUnit}
  initialDatediff={TumorboardTimeChartDatediff}
  initialMedian={TumorboardTimeChartMedian}
  selectedEventType={TumorboardTimeChartEvent}
  headlineTitle={$t("timeChartTitleTumorboard")}
  maxStoreValue={maximizeTumorboardTimeChart}
  showLogarithmStoreValue={TumorboardTimeChartShowLogarithm}
  collection={"tumorBoard"}
  on:maximized={handleMaximized}
  on:logarithmToggled={handleLogarithmToggled}
  on:changedTimeUnit={changedTimeUnit}
  on:changedMedian={changedMedian}
  on:changedEvent={changedEvent}
  on:changedDropdown={changedDropdown}
/>


