<script lang="ts">
    import BioMaterialTable from './BioMaterialTable.svelte'
    import BioMaterialChart from './BioMaterialChart.svelte'

    import { maxStore } from '../../store/maxStore';
    import { onMount } from 'svelte';
  
      // Access the store variables
      let maximizeBioMaterialChart: boolean
      let maximizeBioMaterialTable: boolean
  
   
      maxStore.subscribe((value: any) => {
          ({ maximizeBioMaterialChart, maximizeBioMaterialTable} = value);
      });
      
          //Bei betreten der Seite alle Maximierungen zurücksetzen
        onMount(async () => {
          maxStore.update((storeValues) => {
            storeValues.maximizeBioMaterialChart = false;
            storeValues.maximizeBioMaterialTable = false;
            return storeValues; 
          });
         });
  </script>
  
  
    <div class:grid-container-progress="{!maximizeBioMaterialChart && !maximizeBioMaterialTable}">
      <div class="table-chart box_style box_level2" style="display: {!maximizeBioMaterialChart ? 'block' : 'none'}">
        <BioMaterialTable />
      </div>
      <div class="bar-chart box_style box_level2" style="display: { !maximizeBioMaterialTable ? 'block' : 'none'}">
        <BioMaterialChart />
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