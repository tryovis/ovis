<script lang="ts">
    import SupplementaryTable from './SupplementaryTable.svelte'
    import SupplementaryChart from './SupplementaryChart.svelte'

    import { maxStore } from '../../store/maxStore';
    import { onMount } from 'svelte';
  
      // Access the store variables
      let maximizeSupplementaryChart: boolean
      let maximizeSupplementaryTable: boolean
  
   
      maxStore.subscribe((value: any) => {
          ({ maximizeSupplementaryChart, maximizeSupplementaryTable} = value);
      });
      
          //Bei betreten der Seite alle Maximierungen zurücksetzen
        onMount(async () => {
          maxStore.update((storeValues) => {
            storeValues.maximizeSupplementaryChart = false;
            storeValues.maximizeSupplementaryTable = false;
            return storeValues; 
          });
         });
  </script>
  
  
    <div class:grid-container-progress="{!maximizeSupplementaryChart && !maximizeSupplementaryTable}">
      <div class="table-chart box_style box_level2" style="display: {!maximizeSupplementaryChart ? 'block' : 'none'}">
        <SupplementaryTable />
      </div>
      <div class="bar-chart box_style box_level2" style="display: { !maximizeSupplementaryTable ? 'block' : 'none'}">
        <SupplementaryChart />
      </div>
  </div>
  
  
  <style>
      
      .grid-container-progress {
          display: grid;
          position: relative;
          height: 100%;
          grid-template-columns: 50% 50%;
          grid-template-rows: 50% 50%;
          grid-template-areas: 'table-chart bar-chart'
                              'table-chart bar-chart';
      }
  
      .bar-chart {
          grid-area: bar-chart;
      }
    
      .table-chart {
          grid-area: table-chart;
      }
  

  
  </style>