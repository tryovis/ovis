<script lang="ts">
    import TherapyOperationTable from './TherapyOperationTable.svelte'
    import TherapyOperationOpsCodeTable from './TherapyOperationOpsCodeTable.svelte'
    import TherapyOperationOpsCategoryTable from './TherapyOperationOpsCategoryTable.svelte'
    import TherapyOperationChart from './TherapyOperationChart.svelte'
    import { onMount } from 'svelte';
    import { maxStore } from '../../store/maxStore';

    // Access the store variables
    let maximizeTherapyOperationTable: boolean
    let maximizeTherapyOperationOpsCodeTable: boolean
    let maximizeTherapyOperationOpsCategoryTable: boolean
    let maximizeTherapyOperationChart: boolean
 
 
    maxStore.subscribe((value: any) => {
        ({ maximizeTherapyOperationTable, maximizeTherapyOperationOpsCodeTable, maximizeTherapyOperationOpsCategoryTable,maximizeTherapyOperationChart } = value);
    });

     //Bei betreten der Seite alle Maximierungen zurücksetzen
     onMount(async () => {
      
		  maxStore.update((storeValues) => {
          storeValues.maximizeTherapyOperationTable = false;
          storeValues.maximizeTherapyOperationOpsCodeTable = false;
          storeValues.maximizeTherapyOperationOpsCategoryTable = false;
          storeValues.maximizeTherapyOperationChart = false;
          return storeValues; 
        });
    });


	
  </script>
  
  <div class:grid-container-progress="{!maximizeTherapyOperationTable && !maximizeTherapyOperationOpsCategoryTable && !maximizeTherapyOperationOpsCodeTable &&!maximizeTherapyOperationChart }">
    <div class="ops-code box_style box_level2" style="display: {!maximizeTherapyOperationTable &&!maximizeTherapyOperationOpsCategoryTable && !maximizeTherapyOperationChart ? 'block' : 'none'}">
        <TherapyOperationOpsCodeTable />
      </div>
      <div class="ops-category box_style box_level2" style="display: {!maximizeTherapyOperationTable &&!maximizeTherapyOperationOpsCodeTable && !maximizeTherapyOperationChart ? 'block' : 'none'}">
        <TherapyOperationOpsCategoryTable />
      </div>
    
      <div class="pie-chart box_style box_level2" style="display: {!maximizeTherapyOperationOpsCategoryTable && !maximizeTherapyOperationOpsCodeTable &&!maximizeTherapyOperationTable ? 'block' : 'none'}">
        <TherapyOperationChart />
      </div>
    
      <div class="table-chart box_style box_level2" style="display: {!maximizeTherapyOperationOpsCategoryTable && !maximizeTherapyOperationOpsCodeTable &&!maximizeTherapyOperationChart ? 'block' : 'none'}">
        <TherapyOperationTable />
      </div>  
  </div>
  
  
  <style>
      
      .grid-container-progress {
          display: grid;
          position: relative;
          height: 100%;
          grid-template-columns: 33% 27% 40%;
          grid-template-rows: 50% 50%;
         
          grid-template-areas: 'ops-code ops-category pie-chart'
                              'table-chart table-chart table-chart';

      }
  
      .ops-code {
          grid-area: ops-code;
      }

      .ops-category{
          grid-area: ops-category;
      }
  
      .pie-chart {
          grid-area: pie-chart;
      }
  
      .table-chart {
          grid-area: table-chart;
      }
  
  </style>