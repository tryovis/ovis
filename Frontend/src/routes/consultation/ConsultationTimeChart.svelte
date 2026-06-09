<script lang="ts">
	import GenericTimeChart from '../../components/GenericTimeChart.svelte';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { configStore } from '../../store/configStore';

    const dropdownObject = [
        {label:'Art',value:'type'},
        {label:'Status',value: 'status'}
    ];


	let maximizeConsultationTimeChart: boolean;

	let ConsultationTimeChartShowLogarithm: boolean;
	let ConsultationTimeChartTimeUnit: string;
	let ConsultationTimeChartDatediff: boolean;
	let ConsultationTimeChartMedian: string;
	let ConsultationTimeChartEvent: string;
	let ConsultationTimeChartDropdown: string;

	maxStore.subscribe((value: any) => {
		({ maximizeConsultationTimeChart } = value);
	});

	configStore.subscribe((value: any) => {
		ConsultationTimeChartShowLogarithm = value.ConsultationTimeChartShowLogarithm;
		ConsultationTimeChartTimeUnit = value.ConsultationTimeChartTimeUnit;
		ConsultationTimeChartDatediff = value.ConsultationTimeChartDatediff;
		ConsultationTimeChartMedian = value.ConsultationTimeChartMedian;
		ConsultationTimeChartEvent = value.ConsultationTimeChartEvent;
		ConsultationTimeChartDropdown = value.ConsultationTimeChartDropdown;
	});

	function handleMaximized(event: any) {
		maximizeConsultationTimeChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeConsultationTimeChart = !storeValues.maximizeConsultationTimeChart;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: any) {
		ConsultationTimeChartShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.ConsultationTimeChartShowLogarithm = !storeValues.ConsultationTimeChartShowLogarithm;
			return storeValues;
		});
	}

	function changedMedian(event: any) {
		ConsultationTimeChartMedian = event.detail.selectedDimensionType;
		if (ConsultationTimeChartMedian.includes("de")){ //de für deaktiviert
			ConsultationTimeChartMedian = "indicatorDeactivated"
		}else{
			ConsultationTimeChartMedian = "indicatorActivated"
		}
		configStore.update((storeValues) => {
			storeValues.ConsultationTimeChartMedian = ConsultationTimeChartMedian;
			return storeValues;
		});
	}

	function changedTimeUnit(event: any) {
		const newTimeUnit = event.detail.initialTimeUnit;
		ConsultationTimeChartTimeUnit = newTimeUnit;
		const newDatediff = event.detail.initialDatediff;
		ConsultationTimeChartDatediff = newDatediff;
		configStore.update((storeValues) => {
			storeValues.ConsultationTimeChartTimeUnit = newTimeUnit;
			storeValues.ConsultationTimeChartDatediff = newDatediff;
			return storeValues;
		});
	}

	function changedEvent(event: any) {
		const newTimeUnit = event.detail.selectedEventType;
		ConsultationTimeChartEvent = newTimeUnit;
		configStore.update((storeValues) => {
			storeValues.ConsultationTimeChartEvent = newTimeUnit;
			return storeValues;
		});
	}

	function changedDropdown(event: any) {
		const newTimeUnit = event.detail.initialDropdownValue;
		ConsultationTimeChartDropdown = newTimeUnit;
		configStore.update((storeValues) => {
			storeValues.ConsultationTimeChartDropdown = newTimeUnit;
			return storeValues;
		});
	}

</script>

<GenericTimeChart
  aspectRatioMin={3.5}
  {dropdownObject}
  initialDropdownValue={ConsultationTimeChartDropdown}
  initialTimeUnit={ConsultationTimeChartTimeUnit}
  initialDatediff={ConsultationTimeChartDatediff}
  initialMedian={ConsultationTimeChartMedian}
  selectedEventType={ConsultationTimeChartEvent}
  headlineTitle={$t("timeChartTitleConsultation")}
  maxStoreValue={maximizeConsultationTimeChart}
  showLogarithmStoreValue={ConsultationTimeChartShowLogarithm}
  collection={"consultation"}
  on:maximized={handleMaximized}
  on:logarithmToggled={handleLogarithmToggled}
  on:changedTimeUnit={changedTimeUnit}
  on:changedMedian={changedMedian}
  on:changedEvent={changedEvent}
  on:changedDropdown={changedDropdown}
/>


