<script lang="ts">
    import TherapySystemicTable from './TherapySystemicTable.svelte'
    import TherapySystemicSubstanceTable from './TherapySystemicSubstanceTable.svelte'
    import TherapySystemicChart from './TherapySystemicChart.svelte'
    import { onMount } from 'svelte';
    import { maxStore } from '../../store/maxStore';

    // Access the store variables
    let maximizeTherapySystemicTable: boolean
    let therapySystemicSubstanceTable: boolean
    let maximizeTherapySystemicChart: boolean
 
 
    maxStore.subscribe((value: any) => {
        ({ maximizeTherapySystemicTable, therapySystemicSubstanceTable, maximizeTherapySystemicChart } = value);
    });

          //Bei betreten der Seite alle Maximierungen zurücksetzen
      onMount(async () => {
        maxStore.update((storeValues) => {
          storeValues.maximizeTherapySystemicTable = false;
          storeValues.maximizeTherapySystemicSubstanceTable = false;
          storeValues.maximizeTherapySystemicChart = false;
          return storeValues; 
        });
       });

  </script>
  
  <div class:grid-container-progress="{!maximizeTherapySystemicTable && !therapySystemicSubstanceTable && !maximizeTherapySystemicChart }">
    <div class="bar-chart box_style box_level2" style="display: {!maximizeTherapySystemicTable && !maximizeTherapySystemicChart ? 'block' : 'none'}">
        <TherapySystemicSubstanceTable />
      </div>
    
      <div class="pie-chart box_style box_level2" style="display: {!therapySystemicSubstanceTable && !maximizeTherapySystemicTable ? 'block' : 'none'}">
        <TherapySystemicChart />
      </div>
    
      <div class="table-chart box_style box_level2" style="display: {!therapySystemicSubstanceTable && !maximizeTherapySystemicChart ? 'block' : 'none'}">
        <TherapySystemicTable />
      </div>  
  </div>
  
  
  <style>
      
      .grid-container-progress {
          display: grid;
          position: relative;
          height: 100%;
          grid-template-columns: 50% 50%;
          grid-template-rows: 50% 50%;
          grid-template-areas: 'bar-chart pie-chart'
                              'table-chart table-chart';
      }
  
      .bar-chart {
          grid-area: bar-chart;
      }
  
      .pie-chart {
          grid-area: pie-chart;
      }
  
      .table-chart {
          grid-area: table-chart;
      }
  
  </style>