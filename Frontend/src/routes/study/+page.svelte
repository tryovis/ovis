<script lang="ts">
    import StudyTable from './StudyOverviewTable.svelte'
    import StudyPatientChart from './StudyPatientChart.svelte'
    import StudyChart from './StudyChart.svelte'
    import StudyPatientTable from './StudyPatientTable.svelte'
    import { onMount } from 'svelte';
    import { maxStore } from '../../store/maxStore.js';
  
      // Access the store variables
      let maximizeStudyChart: boolean
      let maximizeStudyOverviewTable: boolean
      let maximizeStudyPatientChart: boolean
      let maximizeStudyPatientTable: boolean
   
      maxStore.subscribe((value: any) => {
          ({ maximizeStudyChart, maximizeStudyOverviewTable, maximizeStudyPatientChart,maximizeStudyPatientTable } = value);
      });

     //Bei betreten der Seite alle Maximierungen zurücksetzen
    onMount(async () => {
		maxStore.update((storeValues) => {
          storeValues.maximizeStudyChart = false;
          storeValues.maximizeStudyOverviewTable = false;
          storeValues.maximizeStudyPatientChart = false;
          storeValues.maximizeStudyPatientTable  = false;
          return storeValues; 
        });
    });
  </script>
  
  
    <div class:grid-container-progress="{!maximizeStudyChart && !maximizeStudyOverviewTable && !maximizeStudyPatientChart && !maximizeStudyPatientTable}">
      <div class="bar-chart box_style box_level2" style="display: {!maximizeStudyChart && !maximizeStudyOverviewTable && !maximizeStudyPatientTable ? 'block' : 'none'}">
        <StudyPatientChart />
      </div>
      <div class="pie-chart box_style box_level2" style="display: { !maximizeStudyOverviewTable && !maximizeStudyPatientChart && !maximizeStudyPatientTable ? 'block' : 'none'}">
        <StudyChart />
      </div>
      <div class="study-table box_style box_level2" style="display: {!maximizeStudyChart && !maximizeStudyPatientChart && !maximizeStudyPatientTable ? 'block' : 'none'}">
       <StudyTable />
      </div>
      <div class="patient-table box_style box_level2" style="display: {!maximizeStudyChart && !maximizeStudyOverviewTable && !maximizeStudyPatientChart  ? 'block' : 'none'}">
        <StudyPatientTable/>
      </div>
  </div>
  
  
  <style>
      
      .grid-container-progress {
          display: grid;
          position: relative;
          height: 100%;
          grid-template-columns: 60% 40%;
          grid-template-rows: 50% 50%;
          grid-template-areas: 'bar-chart pie-chart'
                              'study-table patient-table';
      }
  
      .bar-chart {
          grid-area: bar-chart;
      }
  
      .pie-chart {
          grid-area: pie-chart;
      }
  
      .study-table {
          grid-area: study-table;
      }
  
      .patient-table{
          grid-area: patient-table;
      }
  
  </style>