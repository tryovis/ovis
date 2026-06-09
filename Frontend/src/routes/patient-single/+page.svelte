<script lang="ts">
	import PatientSingleHeader from './PatientSingleHeader.svelte';
	import PatientSingleHistoryTables from './PatientSingleHistoryTables.svelte';
	import PatientSingleEventChart from './PatientSingleEventChart.svelte';
	import PatientSingleMetastasisMap from './PatientSingleMetastasisMap.svelte';
	import PatientSingleDiagnosisMap from './PatientSingleDiagnosisMap.svelte';
	import { maxStore } from '../../store/maxStore';
	import { onMount } from 'svelte';
	import { singlePatientStore } from '../../store/singlePatientStore.js';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { appPath } from '$lib/path-utils';

	$: if (browser && $singlePatientStore?.singlePatient === '') {
		goto(appPath('/patient-cohort'));
	}

	// Access the store variables
	let maximizePatientSingleHistoryTable: boolean;
	let maximizePatientSingleEventChart: boolean;
	let maximizePatientSingleMetastasisMap: boolean;
	let maximizePatientSingleDiagnosisMap: boolean;

	maxStore.subscribe((value: any) => {
		({
			maximizePatientSingleHistoryTable,
			maximizePatientSingleEventChart,
			maximizePatientSingleMetastasisMap,
			maximizePatientSingleDiagnosisMap
		} = value);
	});

	//Bei betreten der Seite alle Maximierungen zurücksetzen
	onMount(async () => {
		maxStore.update((storeValues) => {
			storeValues.maximizePatientSingleHistoryTable = false;
			storeValues.maximizePatientSingleEventChart = false;
			storeValues.maximizePatientSingleMetastasisMap = false;
			storeValues.maximizePatientSingleDiagnosisMap = false;
			return storeValues;
		});
	});
</script>

<div
	class:grid-container-patient-single={!maximizePatientSingleHistoryTable &&
		!maximizePatientSingleEventChart &&
		!maximizePatientSingleMetastasisMap &&
		!maximizePatientSingleDiagnosisMap}
>
	<div
		class="patient-single-overview box_style box_level2"
		style="display: {!maximizePatientSingleHistoryTable &&
		!maximizePatientSingleEventChart &&
		!maximizePatientSingleMetastasisMap &&
		!maximizePatientSingleDiagnosisMap
			? 'block'
			: 'none'}"
	>
		<PatientSingleHeader />
	</div>
	<div
		class="patient-single-diagnosis-table box_style box_level2"
		style="display: {!maximizePatientSingleEventChart &&
		!maximizePatientSingleMetastasisMap &&
		!maximizePatientSingleDiagnosisMap
			? 'block'
			: 'none'}"
	>
		<PatientSingleHistoryTables />
	</div>
	<div
		class="patient-single-event-chart box_style box_level2"
		style="display: {!maximizePatientSingleHistoryTable &&
		!maximizePatientSingleMetastasisMap &&
		!maximizePatientSingleDiagnosisMap
			? 'block'
			: 'none'}"
	>
		<PatientSingleEventChart />
	</div>
	<div
		class="patient-single-diagnosis-image box_style box_level2"
		style="display: {!maximizePatientSingleHistoryTable &&
		!maximizePatientSingleEventChart &&
		!maximizePatientSingleMetastasisMap
			? 'block'
			: 'none'}"
	>
		<PatientSingleDiagnosisMap />
	</div>
	<div
		class="patient-single-metastasis-image box_style box_level2"
		style="display: {!maximizePatientSingleHistoryTable &&
		!maximizePatientSingleEventChart &&
		!maximizePatientSingleDiagnosisMap
			? 'block'
			: 'none'}"
	>
		<PatientSingleMetastasisMap />
	</div>
</div>

<style>
    .grid-container-patient-single {
        display: grid;
        position: relative;
        height: 100%;
        grid-template-columns: 73% 27%;
        grid-template-rows: 15% 35% 50%;
        grid-template-areas: 'patient-single-overview patient-single-diagnosis-image'
                            'patient-single-diagnosis-table patient-single-diagnosis-image'
                            'patient-single-event-chart patient-single-metastasis-image'

    }

    .patient-single-overview {
        grid-area: patient-single-overview;
    }

    .patient-single-diagnosis-table {
        grid-area: patient-single-diagnosis-table;
    }

    .patient-single-event-chart {
        grid-area: patient-single-event-chart;
    }

    .patient-single-event-table {
        grid-area: patient-single-event-table;
    }

    .patient-single-diagnosis-image {
        grid-area: patient-single-diagnosis-image;
    }

    .patient-single-metastasis-image {
        grid-area: patient-single-metastasis-image;
    }
</style>
