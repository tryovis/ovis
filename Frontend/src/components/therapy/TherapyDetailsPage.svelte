<script lang="ts">
	import { onMount } from 'svelte';
	import GenericCategoryChart from '../GenericCategoryChart.svelte';
	import GenericTable from '../GenericTable.svelte';
	import { t } from '../../store/languageStore';
	import { maxStore } from '../../store/maxStore';
	import { configStore } from '../../store/configStore';
	import {
		getSpecializedTherapyTable,
		therapyTypeFilter,
		type SpecializedTherapyType
	} from '../../graphQl/gql-therapy-specialized';

	export let therapyType: SpecializedTherapyType;

	$: isNuclear = therapyType === 'nuclear';
	$: chartPrefix = isNuclear ? 'TherapyNuclearChart' : 'TherapyOtherChart';
	$: chartMaxKey = isNuclear ? 'maximizeTherapyNuclearChart' : 'maximizeTherapyOtherChart';
	$: tableMaxKey = isNuclear ? 'maximizeTherapyNuclearTable' : 'maximizeTherapyOtherTable';
	$: chartMaximized = $maxStore[chartMaxKey];
	$: tableMaximized = $maxStore[tableMaxKey];
	$: fixedFilter = therapyTypeFilter(therapyType);
	$: chartTitle = $t(isNuclear ? 'nuclearChartTitle' : 'otherTherapyChartTitle');
	$: tableTitle = $t(isNuclear ? 'nuclearDetails' : 'otherTherapyDetails');

	$: columns = [
		{ data: 'therapyID', header: 'ID', tooltip: $t('therapyIdentifier') },
		{ data: 'patID', header: $t('PID'), tooltip: $t('patientIdentifier') },
		{ data: 'tumorID', header: $t('TID'), tooltip: $t('tumorIdentifier') },
		{
			data: 'therapyOccurrenceDate',
			header: $t('therapyStart'),
			tooltip: $t('therapyStart'),
			date: true
		},
		{ data: 'therapyEndDate', header: $t('therapyEnd'), tooltip: $t('therapyEnd'), date: true },
		{
			data: 'therapyDaysSinceDiagnosis',
			header: 'TsD',
			tooltip: $t('therapyDaysSinceDiagnosis')
		},
		{ data: 'subType', header: $t('type'), tooltip: $t('therapyType') },
		{ data: 'subTypeCode', header: $t('therapyTypeCodeShort'), tooltip: $t('therapyTypeCode') },
		...(isNuclear
			? [
					{ data: 'radioNuclid', header: $t('nuclidShort'), tooltip: $t('radioNuclid') },
					{
						data: 'radioNuclidCode',
						header: $t('radioNuclidCodeShort'),
						tooltip: $t('radioNuclidCode')
					},
					{
						data: 'radiopharmaceutical',
						header: $t('radiopharmaceuticalShort'),
						tooltip: $t('radiopharmaceutical')
					},
					{
						data: 'radiopharmaceuticalCode',
						header: $t('radiopharmaceuticalCodeShort'),
						tooltip: $t('radiopharmaceuticalCode')
					}
			  ]
			: [])
	];

	$: dropdownObject = [
		{ label: $t('therapyType'), value: 'subType' },
		{ label: $t('therapyDetail'), value: 'subTypeDetail' },
		...(isNuclear
			? [
					{ label: $t('radioNuclid'), value: 'radioNuclid' },
					{ label: $t('radiopharmaceutical'), value: 'radiopharmaceutical' }
			  ]
			: []),
		{ label: $t('status'), value: 'status' },
		{ label: $t('therapyIntention'), value: 'intention' },
		{ label: $t('organizationalUnit'), value: 'organizationalUnit' }
	];

	onMount(() => {
		maxStore.update((values) => ({ ...values, [chartMaxKey]: false, [tableMaxKey]: false }));
	});

	function setMaximized(panel: 'chart' | 'table', event: CustomEvent<{ maxStoreValue: boolean }>) {
		maxStore.update((values) => ({
			...values,
			[panel === 'chart' ? chartMaxKey : tableMaxKey]: event.detail.maxStoreValue
		}));
	}

	function setChartPreference(
		key: 'ShowChart' | 'ShowTop5' | 'ShowNull' | 'ShowLogarithm' | 'InitialDropdown',
		value: boolean | string
	) {
		configStore.update((values) => ({ ...values, [`${chartPrefix}${key}`]: value }));
	}
</script>

<div class="therapy-details" class:maximized={chartMaximized || tableMaximized}>
	<div class="category-panel box_style box_level2" class:hidden={tableMaximized}>
		<GenericCategoryChart
			collection="therapy"
			{fixedFilter}
			{dropdownObject}
			headlineTitle={chartTitle}
			headlineTooltip={'<p><b>' + chartTitle + '</b></p><hr>' + $t('tooltip_GenericChart')}
			aspectRatioMin={2.5}
			legendPosition="right"
			tableShownRowsMin={7}
			initialDropdownValue={$configStore[`${chartPrefix}InitialDropdown`]}
			maxStoreValue={chartMaximized}
			showChartStoreValue={$configStore[`${chartPrefix}ShowChart`]}
			showTop5StoreValue={$configStore[`${chartPrefix}ShowTop5`]}
			showNullStoreValue={$configStore[`${chartPrefix}ShowNull`]}
			showLogarithmStoreValue={$configStore[`${chartPrefix}ShowLogarithm`]}
			on:maximized={(event) => setMaximized('chart', event)}
			on:chartToggled={(event) => setChartPreference('ShowChart', event.detail.showChartStoreValue)}
			on:top5Toggled={(event) => setChartPreference('ShowTop5', event.detail.showTop5StoreValue)}
			on:nullToggled={(event) => setChartPreference('ShowNull', event.detail.showNullStoreValue)}
			on:logarithmToggled={(event) =>
				setChartPreference('ShowLogarithm', event.detail.showLogarithmStoreValue)}
			on:changedGenericChartDropdown={(event) =>
				setChartPreference('InitialDropdown', event.detail.initialDropdownValue)}
		/>
	</div>
	<div class="table-panel box_style box_level2" class:hidden={chartMaximized}>
		<GenericTable
			collection="therapy"
			{fixedFilter}
			{columns}
			getTableData={getSpecializedTherapyTable}
			sortingIndex={3}
			tableIdName={isNuclear ? 'therapyNuclearTable' : 'therapyOtherTable'}
			headlineTitle={tableTitle}
			loadingActive={true}
			maxStoreValue={tableMaximized}
			on:maximized={(event) => setMaximized('table', event)}
		/>
	</div>
</div>

<style>
	.therapy-details {
		display: grid;
		grid-template-rows: minmax(250px, 42%) minmax(0, 58%);
		height: 100%;
		min-width: 0;
	}

	.therapy-details.maximized {
		grid-template-rows: minmax(0, 1fr);
	}

	.category-panel,
	.table-panel {
		min-width: 0;
		min-height: 0;
	}

	.hidden {
		display: none;
	}
</style>
