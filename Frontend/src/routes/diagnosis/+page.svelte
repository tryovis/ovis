<script lang="ts">
	import DiagnosisBarChart from './DiagnosisBarChart.svelte';
	import DiagnosisDiagnosticTable from './DiagnosisDiagnosticTable.svelte';
	import DiagnosisHistologyTable from './DiagnosisHistologyTable.svelte';
	import DiagnosisBodymap from './DiagnosisBodymap.svelte';
	import { maxStore } from '../../store/maxStore';
	import { onMount } from 'svelte';
	import { variantStore } from '../../store/variantStore.js';

	let isCCP: boolean;
	variantStore.subscribe((value: any) => {
		({ isCCP } = value);
	});
	
    // Access the store variables
    let maximizeDiagnosisBarChart: boolean;
    let maximizeDiagnosisDiagnosticTable: boolean;
    let maximizeDiagnosisHistologyTable: boolean;

	maxStore.subscribe((value: any) => {
        ({ maximizeDiagnosisBarChart, maximizeDiagnosisDiagnosticTable, maximizeDiagnosisHistologyTable } = value);
    });

	        //Bei betreten der Seite alle Maximierungen zurücksetzen
	onMount(async () => {
		maxStore.update((storeValues) => {
          storeValues.maximizeDiagnosisBarChart = false;
          storeValues.maximizeDiagnosisDiagnosticTable = false;
          storeValues.maximizeDiagnosisHistologyTable = false;
          return storeValues; 
        });
       });
</script>


<div class:grid-container-diagnosis-page="{!isCCP && !maximizeDiagnosisBarChart && !maximizeDiagnosisDiagnosticTable && !maximizeDiagnosisHistologyTable }" class:grid-container-diagnosis-page-ccp="{isCCP && !maximizeDiagnosisBarChart && !maximizeDiagnosisDiagnosticTable && !maximizeDiagnosisHistologyTable}">


	<div class="diagnosis-bar-control-panel box_style box_level2" style="display: {!maximizeDiagnosisDiagnosticTable && !maximizeDiagnosisHistologyTable  ? 'block' : 'none'}">
		<DiagnosisBarChart />
	</div>
	<div class="bodymap box_style box_level2" style="display: {!maximizeDiagnosisBarChart && !maximizeDiagnosisDiagnosticTable && !maximizeDiagnosisHistologyTable  ? 'block' : 'none'}">
		<DiagnosisBodymap />
	</div>
	<div class="histology-table box_style box_level2" style="display: {!maximizeDiagnosisBarChart && !maximizeDiagnosisDiagnosticTable   ? 'block' : 'none'}">
		<DiagnosisHistologyTable />
	</div>
	{#if !isCCP}
	<div class="diagnostic-table box_style box_level2" style="display: {!maximizeDiagnosisBarChart  && !maximizeDiagnosisHistologyTable  ? 'block' : 'none'}">
		<DiagnosisDiagnosticTable />
	</div>
	{/if}
</div>

<style>
	.grid-container-diagnosis-page {
		overflow: hidden;
		min-width: 0;
		min-height: 0;
		display: grid;
		position: relative;
		height: 100%;
		grid-template-columns: 30% 30% 39%;
		grid-template-rows: 60% 40%;
		grid-template-areas:
			'diagnosis-bar-control-panel diagnosis-bar-control-panel bodymap'
			'histology-table diagnostic-table bodymap';
	}

	.grid-container-diagnosis-page-ccp {
		overflow: hidden;
		min-width: 0;
		min-height: 0;
			display: grid;
			position: relative;
			height: 100%;
			grid-template-columns: 60% 39%;
			grid-template-rows: 60% 40%;
			grid-template-areas:
				'diagnosis-bar-control-panel  bodymap'
				'histology-table bodymap';
	}

	.diagnosis-bar-control-panel {
		grid-area: diagnosis-bar-control-panel;
	}

	.bodymap {
		grid-area: bodymap;		
		
	}

	.histology-table {
		grid-area: histology-table;
	}
	.diagnostic-table {
		grid-area: diagnostic-table;
	}

    .diagnosis-bar-control-panel,
    .bodymap,
    .histology-table,
    .diagnostic-table {
        min-width: 0;
        min-height: 0;
    }

</style>
