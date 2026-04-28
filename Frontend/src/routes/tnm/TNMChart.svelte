<script lang="ts">
	import GenericCategoryChart from '../../components/GenericCategoryChart.svelte';

	import { maxStore } from '../../store/maxStore';
	import { configStore } from '../../store/configStore';
	import { get } from 'svelte/store';
	import { t } from '../../store/languageStore';

	const translate = (key: string): string => get(t)(key);

	let dropdownObject = [
		{ label: 'a: ' + translate('autopsyContext'), value: 'a' },
		{ label: 'L: ' + translate('lymphVesselInvasion'), value: 'L' },
		{ label: 'm: ' + translate('multiplePrimaryTumors'), value: 'multipleT' },
		{ label: 'Pn: ' + translate('perineuralInvasion'), value: 'Pn' },
		{ label: 'r: ' + translate('recurrenceContext'), value: 'r' },
		{ label: 'R: ' + translate('rClassification'), value: 'RClass' },
		{ label: 'S: ' + translate('serumTumorMarker'), value: 'S' },
		{ label: translate('tnmType'), value: 'type' },
		{ label: translate('tnmVersion'), value: 'version' },
		{ label: translate('UICC'), value: 'UICC' },
		{ label: 'V: ' + translate('venousInvasion'), value: 'V' },
		{ label: 'y: ' + translate('multimodal'), value: 'y' }
	];

	let maximizeTNMChart: boolean;

	let TNMChartShowChart: boolean;
	let TNMChartShowTop5: boolean;
	let TNMChartShowNull: boolean;
	let TNMChartShowLogarithm: boolean;
	let TNMChartInitialDropdown: string;

	maxStore.subscribe((value: { maximizeTNMChart: boolean }) => {
		({ maximizeTNMChart } = value);
	});

	configStore.subscribe((value: {
		TNMChartShowChart: boolean;
		TNMChartShowTop5: boolean;
		TNMChartShowNull: boolean;
		TNMChartShowLogarithm: boolean;
		TNMChartInitialDropdown: string;
	}) => {
		TNMChartShowChart = value.TNMChartShowChart;
		TNMChartShowTop5 = value.TNMChartShowTop5;
		TNMChartShowNull = value.TNMChartShowNull;
		TNMChartShowLogarithm = value.TNMChartShowLogarithm;
		TNMChartInitialDropdown = value.TNMChartInitialDropdown;
	});

	function handleMaximized(event: { detail: { headlineMaximize: boolean } }) {
		maximizeTNMChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTNMChart = !storeValues.maximizeTNMChart;
			return storeValues;
		});
	}

	function handleChartToggled(event: { detail: { headlineShowChart: boolean } }) {
		TNMChartShowChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.TNMChartShowChart = !storeValues.TNMChartShowChart;
			return storeValues;
		});
	}

	function handleTop5Toggled(event: { detail: { headlineInitialTop5: boolean } }) {
		TNMChartShowTop5 = event.detail.headlineInitialTop5;
		configStore.update((storeValues) => {
			storeValues.TNMChartShowTop5 = !storeValues.TNMChartShowTop5;
			return storeValues;
		});
	}

	function handleNull(event: { detail: { headlineNull: boolean } }) {
		TNMChartShowNull = event.detail.headlineNull;
		configStore.update((storeValues) => {
			storeValues.TNMChartShowNull = !storeValues.TNMChartShowNull;
			return storeValues;
		});
	}

	function handleLogarithmToggled(event: { detail: { headlineInitialLogarithm: boolean } }) {
		TNMChartShowLogarithm = event.detail.headlineInitialLogarithm;
		configStore.update((storeValues) => {
			storeValues.TNMChartShowLogarithm = !storeValues.TNMChartShowLogarithm;
			return storeValues;
		});
	}

	function changedGenericChartDropdown(event: { detail: { initialDropdownValue: string } }) {
		const newDropdownValue = event.detail.initialDropdownValue;
		TNMChartInitialDropdown = newDropdownValue;
		configStore.update((storeValues) => {
			storeValues.TNMChartInitialDropdown = newDropdownValue;
			return storeValues;
		});
	}
</script>

<GenericCategoryChart
	aspectRatioMin={1}
	collection={'tnm'}
	{dropdownObject}
	headlineTitle={translate('tnmChartTitle')}
	headlineTooltip={'<p><b>' + translate('tnmChartTitle') + '</b><hr></p>' + translate('tooltip_GenericChart')}
	initialDropdownValue={TNMChartInitialDropdown}
	legendPosition={'top'}
	maxStoreValue={maximizeTNMChart}
	showChartStoreValue={TNMChartShowChart}
	showTop5StoreValue={TNMChartShowTop5}
	showNullStoreValue={TNMChartShowNull}
	showLogarithmStoreValue={TNMChartShowLogarithm}
	tableShownRowsMin={10}
	truncateLengthMin={25}
	on:maximized={handleMaximized}
	on:chartToggled={handleChartToggled}
	on:top5Toggled={handleTop5Toggled}
	on:nullToggled={handleNull}
	on:logarithmToggled={handleLogarithmToggled}
	on:changedGenericChartDropdown={changedGenericChartDropdown}
/>
