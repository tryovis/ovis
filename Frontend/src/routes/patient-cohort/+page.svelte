<script lang="ts">
	import PatientCohortMapChart from './PatientCohortMapChart.svelte';
	import PatientCohortOverviewTable from './PatientCohortOverviewTable.svelte';
	import PatientCohortAgeChart from './PatientCohortAgeChart.svelte';
	import PatientCohortGenderChart from './PatientCohortGenderChart.svelte';
	import PatientCohortDeathChart from './PatientCohortDeathChart.svelte';
	//import PatientCohortCCP from './PatientCohortCCP.svelte';
	import { maxStore } from '../../store/maxStore';
	import { onMount } from 'svelte';
	import { variantStore } from '../../store/variantStore.js';
	import { t, locale, locales } from "../../store/languageStore";
	import PatientCohortPatientTable from './PatientCohortPatientTable.svelte';
	import PatientCohortHistoryTable from './PatientCohortHistoryTable.svelte';

	let isCCP: boolean;
	variantStore.subscribe((value: any) => {
        ({ isCCP } = value);
    });

	let maximizePatientCohortAgeChart: boolean;
	let maximizePatientCohortDeathChart: boolean;
	let maximizePatientCohortGenderChart: boolean;
	let maximizePatientCohortMapChart: boolean;
	let maximizePatientCohortOverviewTable: boolean;
	let maximizePatientCohortHistoryTable: boolean;
	let maximizePatientCohortPatientTable: boolean;

	maxStore.subscribe((value: any) => {
		({
			maximizePatientCohortAgeChart,
			maximizePatientCohortDeathChart,
			maximizePatientCohortGenderChart,
			maximizePatientCohortMapChart,
			maximizePatientCohortOverviewTable,			
			maximizePatientCohortHistoryTable,
			maximizePatientCohortPatientTable
		} = value);
	});

        //Bei betreten der Seite alle Maximierungen zurücksetzen
		onMount(async () => {
        maxStore.update((storeValues) => {
          storeValues.maximizePatientCohortAgeChart = false;
          storeValues.maximizePatientCohortDeathChart = false;
          storeValues.maximizePatientCohortGenderChart = false;
		  storeValues.maximizePatientCohortMapChart = false;
          storeValues.maximizePatientCohortOverviewTable = false;
		  storeValues.maximizePatientCohortHistoryTable = false;
          storeValues.maximizePatientCohortPatientTable= false;
          return storeValues; 
        });
       });

</script>
{#if !isCCP}
<div 
	class:grid-container-cohort={!maximizePatientCohortAgeChart &&
		!maximizePatientCohortDeathChart &&
		!maximizePatientCohortGenderChart &&
		!maximizePatientCohortMapChart &&
		!maximizePatientCohortOverviewTable}
>
	<div
		class="patient-overview-table box_style box_level2"
		style="display: {!maximizePatientCohortAgeChart &&
		!maximizePatientCohortDeathChart &&
		!maximizePatientCohortGenderChart &&
		!maximizePatientCohortMapChart 
			? 'block'
			: 'none'}"
	>
		<PatientCohortOverviewTable />
	</div>
	
	<div
		class="map-view box_style box_level2"
		style="display: {!maximizePatientCohortAgeChart &&
		!maximizePatientCohortDeathChart &&
		!maximizePatientCohortGenderChart &&
		!maximizePatientCohortOverviewTable
			? 'block'
			: 'none'}"
			
	>
	<PatientCohortMapChart />
	</div>

	<div
		class="gender-container box_style box_level2"
		style="display: {!maximizePatientCohortAgeChart &&
		!maximizePatientCohortDeathChart &&
		!maximizePatientCohortMapChart &&
		!maximizePatientCohortOverviewTable
			? 'block'
			: 'none'}"
	>
		<PatientCohortGenderChart />
	</div>
	<div
		class="vital-container box_style box_level2"
		style="display: {!maximizePatientCohortAgeChart &&
		!maximizePatientCohortGenderChart &&
		!maximizePatientCohortMapChart &&
		!maximizePatientCohortOverviewTable
			? 'block'
			: 'none'}"
	>
		<PatientCohortDeathChart />
	</div>

	<div
		class="age-group-chart box_style box_level2"
		style="display: {
		!maximizePatientCohortDeathChart &&
		!maximizePatientCohortGenderChart &&
		!maximizePatientCohortMapChart &&
		!maximizePatientCohortOverviewTable
			? 'block'
			: 'none'}"
	>
		<PatientCohortAgeChart />
	</div>
</div>
{:else} <!-- CCP VARIANT ---------------------------------------------------------------->
<div 
	class:grid-container-cohort-ccp={!maximizePatientCohortAgeChart &&
		!maximizePatientCohortDeathChart &&
		!maximizePatientCohortGenderChart &&
		!maximizePatientCohortHistoryTable &&
		!maximizePatientCohortPatientTable }
>
	<div
		class="patient-table box_style box_level2"
		style="display: {!maximizePatientCohortAgeChart &&
		!maximizePatientCohortDeathChart &&
		!maximizePatientCohortGenderChart &&
		!maximizePatientCohortHistoryTable
				? 'block'
			: 'none'}"
	>
		<PatientCohortPatientTable/>
	</div>
	<div
		class="history-table box_style box_level2"
		style="display: {!maximizePatientCohortAgeChart &&
		!maximizePatientCohortDeathChart &&
		!maximizePatientCohortGenderChart &&
		!maximizePatientCohortPatientTable
				? 'block'
			: 'none'}"
	>
		<PatientCohortHistoryTable/>
	</div>


	<div
		class="gender-container box_style box_level2"
		style="display: {!maximizePatientCohortAgeChart &&
		!maximizePatientCohortDeathChart &&
		!maximizePatientCohortMapChart &&
		!maximizePatientCohortHistoryTable &&
		!maximizePatientCohortPatientTable
				? 'block'
			: 'none'}"
	>
		<PatientCohortGenderChart />
	</div>
	<div
		class="vital-container box_style box_level2"
		style="display: {!maximizePatientCohortAgeChart &&
		!maximizePatientCohortGenderChart &&
		!maximizePatientCohortMapChart &&
		!maximizePatientCohortHistoryTable &&
		!maximizePatientCohortPatientTable
				? 'block'
			: 'none'}"
	>
		<PatientCohortDeathChart />
	</div>

	<div
		class="age-group-chart box_style box_level2"
		style="display: {
		!maximizePatientCohortDeathChart &&
		!maximizePatientCohortGenderChart &&
		!maximizePatientCohortMapChart &&
		!maximizePatientCohortHistoryTable &&
		!maximizePatientCohortPatientTable
				? 'block'
			: 'none'}"
	>
		<PatientCohortAgeChart />
	</div>
</div>
{/if}
<style>
	.grid-container-cohort {
		display: grid;
		position: relative;
		height: 100%;
		grid-template-columns: 50% 25% 25%;
		grid-template-rows: 34% 33% 33%;
		grid-template-areas:
			'patient-overview-table map-view map-view'
			'patient-overview-table map-view map-view'
			'age-group-chart gender-container vital-container';
	}

	.grid-container-cohort-ccp {
		display: grid;
		position: relative;
		height: 100%;
		grid-template-columns: 50% 25% 25%;
		grid-template-rows: 50% 50%;
		grid-template-areas:
			'patient-table age-group-chart age-group-chart'
			'history-table gender-container vital-container';
	}

	.vital-container {
		display: grid;
		position: relative;
		grid-area: vital-container;
	}
	.gender-container {
		display: grid;
		position: relative;
		grid-area: gender-container;
	}

	/*TODO: gender-chart + vital-state-chart layout !!*/

	.patient-overview-table {
		grid-area: patient-overview-table;
	}

	.patient-table {
		grid-area: patient-table;
	}

	.history-table {
		grid-area: history-table;
	}

	.map-view {
		grid-area: map-view;
	}

	.age-group-chart {
		grid-area: age-group-chart;
		/*height: 100%;*/
	}
</style>
