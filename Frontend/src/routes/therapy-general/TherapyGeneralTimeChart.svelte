<script lang="ts">
	import GenericTimeChart from '../../components/GenericTimeChart.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { configStore } from '../../store/configStore';

    const dropdownObject = [
        { label: 'Therapien', value: 'generalType' },
    ];

	let maximizeTherapyGeneralTimeChart: boolean;

	let TherapyGeneralTimeChartShowLogarithm: boolean;
	let TherapyGeneralTimeChartTimeUnit: string;
	let TherapyGeneralTimeChartDatediff: boolean;
	let TherapyGeneralTimeChartMedian: string;
	let TherapyGeneralTimeChartEvent: string;
	let TherapyGeneralTimeChartDropdown: string;

	maxStore.subscribe((value: any) => {
		({ maximizeTherapyGeneralTimeChart } = value);
	});

	configStore.subscribe((value: any) => {
		TherapyGeneralTimeChartShowLogarithm = value.TherapyGeneralTimeChartShowLogarithm;
		TherapyGeneralTimeChartTimeUnit = value.TherapyGeneralTimeChartTimeUnit;
		TherapyGeneralTimeChartDatediff = value.TherapyGeneralTimeChartDatediff;
		TherapyGeneralTimeChartMedian = value.TherapyGeneralTimeChartMedian;
		TherapyGeneralTimeChartEvent = value.TherapyGeneralTimeChartEvent;
		TherapyGeneralTimeChartDropdown = value.TherapyGeneralTimeChartDropdown;
	});

	function handleMaximized(event: any) {
		maximizeTherapyGeneralTimeChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTherapyGeneralTimeChart = !storeValues.maximizeTherapyGeneralTimeChart;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		TherapyGeneralTimeChartShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.TherapyGeneralTimeChartShowLogarithm = !storeValues.TherapyGeneralTimeChartShowLogarithm;
			return storeValues;
		});
	}

	function changedMedian(event: any) {
		TherapyGeneralTimeChartMedian = event.detail.selectedDimensionType;
		if (TherapyGeneralTimeChartMedian.includes("de")){ //de für deaktiviert
			TherapyGeneralTimeChartMedian = "indicatorDeactivated"
		}else{
			TherapyGeneralTimeChartMedian = "indicatorActivated"
		}
		configStore.update((storeValues) => {
			storeValues.TherapyGeneralTimeChartMedian = TherapyGeneralTimeChartMedian;
			return storeValues;
		});
	}

	function changedTimeUnit(event: any) {
		const newTimeUnit = event.detail.initialTimeUnit;
		TherapyGeneralTimeChartTimeUnit = newTimeUnit;
		const newDatediff = event.detail.initialDatediff;
		TherapyGeneralTimeChartDatediff = newDatediff;
		configStore.update((storeValues) => {
			storeValues.TherapyGeneralTimeChartTimeUnit = newTimeUnit;
			storeValues.TherapyGeneralTimeChartDatediff = newDatediff;
			return storeValues;
		});
	}

	function changedEvent(event: any) {
		const newTimeUnit = event.detail.selectedEventType;
		TherapyGeneralTimeChartEvent = newTimeUnit;
		configStore.update((storeValues) => {
			storeValues.TherapyGeneralTimeChartEvent = newTimeUnit;
			return storeValues;
		});
	}

	function changedDropdown(event: any) {
		const newTimeUnit = event.detail.initialDropdownValue;
		TherapyGeneralTimeChartDropdown = newTimeUnit;
		configStore.update((storeValues) => {
			storeValues.TherapyGeneralTimeChartDropdown = newTimeUnit;
			return storeValues;
		});
	}

</script>

<GenericTimeChart
  aspectRatioMin={3.8}
  {dropdownObject}
  initialDropdownValue={TherapyGeneralTimeChartDropdown}
  initialTimeUnit={TherapyGeneralTimeChartTimeUnit}
  initialDatediff={TherapyGeneralTimeChartDatediff}
  initialMedian={TherapyGeneralTimeChartMedian}
  selectedEventType={TherapyGeneralTimeChartEvent}
  headlineTitle={$t("timeChartTitleTherapy")}
  maxStoreValue={maximizeTherapyGeneralTimeChart}
  showLogarithmStoreValue={TherapyGeneralTimeChartShowLogarithm}
  collection={"therapy"}
  on:maximized={handleMaximized}
  on:logarithmToggled={handleLogarithmToggled}
  on:changedTimeUnit={changedTimeUnit}
  on:changedMedian={changedMedian}
  on:changedEvent={changedEvent}
  on:changedDropdown={changedDropdown}
/>


