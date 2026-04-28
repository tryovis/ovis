<script lang="ts">
	import { onMount } from 'svelte';
	import { t, locale, locales } from "../../store/languageStore";
	import Headline from '../../components/Headline.svelte';
	import { createTable, changeRowCount } from '../../tableBuilder';
	import { maxStore } from '../../store/maxStore';
	import type { LensDataPasser } from "@samply/lens";
    import { filterActiveStore } from '../../store/filterActiveStore.js';
	import { getTherapyOperationOpsCodeTable } from '../../graphQl/gql-therapy-operation';


    let filterActive = true;
    let filter = JSON.stringify({ "operand": "OR", "children": [] });;
    filterActiveStore.subscribe((value) => {
        filterActive = value.filterActive; // Hier den Wert direkt zuweisen
    });


	let dataPasser: LensDataPasser;

	let therapyOperationOpsCodeTable: any;
	let tableShownRows = 6;
	let tableShownRowsMax = 20;
	let sortingIndex = 3;
	let tableInput: any;

	let maximizeTherapyOperationOpsCodeTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeTherapyOperationOpsCodeTable } = value);
	});

	function handleMaximized(event: any) {
		maximizeTherapyOperationOpsCodeTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTherapyOperationOpsCodeTable = !storeValues.maximizeTherapyOperationOpsCodeTable;
			return storeValues; // Return the updated values
		});
		setTimeout(() => {
			if (maximizeTherapyOperationOpsCodeTable) {
				changeRowCount(therapyOperationOpsCodeTable, tableShownRowsMax);
			} else {
				changeRowCount(therapyOperationOpsCodeTable, tableShownRows);
			}
		}, 0);
	}

	let columns = [
		{ data: 'ops_code', header: 'Code' },
		{ data: 'ops_text', header: $t("descriptions") },
		{ data: 'ops_category', header: $t("category") },
		{ data: 'count', header: $t("count") }
			
	];

	const headers = columns.length > 0 && columns.some(column => column.header)
		? columns.map(column => column.header)  // Use actual headers if available
		: columns.map((_, index) => `col${index + 1}`);  // Fallback to default column names

	type TherapyOperationOpsCodeTableType = {
		code: string;
		text: string;
		category: string;
		count: string;
	};


	onMount(async () => {
		await import("@samply/lens");

		if (filterActive) {
			filter = JSON.stringify(dataPasser.getAstAPI());
		}
		let initialData = await getTherapyOperationOpsCodeTable(null, 100, filter);

		initialData = stringifyTextObject(initialData.code)

		tableInput = initialData.map((item: any) => {
			return {
				ops_code: item.code,   // Schlüssel wird zu ops_code
				ops_text: item.text,   // Schlüssel wird zu ops_text
				ops_count: item.count  // Schlüssel wird zu ops_count
			};
		});

		

		tableInput = initialData.map((item: any) => {
			return {
				ops_code: item.code,   
				ops_text: item.text,  
				ops_category: item.category,  
				count:item.count
			};
		});

		
		therapyOperationOpsCodeTable = createTable(
			"therapy",
			dataPasser,
			'therapyOperationOpsCodeTable',
			tableInput,
			columns,
			tableShownRows,
			sortingIndex
		);

	});

	function stringifyTextObject(remainingData: any) {
		remainingData.forEach(element => {
			if (element.text) {
				let opsString = element.text.reduce((acc: string, currentValue: any) => {
					acc += currentValue + ",";
					return acc;
				}, "");
				
				// Nur das letzte Komma entfernen (falls vorhanden)
				if (opsString.endsWith(",")) {
					opsString = opsString.slice(0, -1);
				}
				
				// Trimmen von überflüssigen Leerzeichen
				element.text = opsString.trim();
			}
		});
		return remainingData;
	}

</script>

<Headline
	headlineTitle={$t("opsCodeFrequencies")}
	headlineTooltip={$t("tooltip_TherapyOperationOPSCodeTable")}
	headlineMaximize={maximizeTherapyOperationOpsCodeTable}
	headlineShowChart={null}
	headlineIsChart={false}
	headlineInitialTop5={null}
	headlineInitialLogarithm={null}
	headlineInputTableData={tableInput}
	headlineInputTableHeader={headers}
	headlineChartJSElement={null}
	headlineD3Element={null}
	on:maximized={handleMaximized}
/>
<lens-data-passer bind:this={dataPasser} />
<div>
	<div class="data-table">
		<table id="therapyOperationOpsCodeTable" class="display" style="width:100%">
			<thead>
				<tr>
					<th>Code</th>
					<th>{$t("descriptions")}</th>
					<th>{$t("category")}</th>
					<th>{$t("count")}</th>
				</tr>
			</thead>
		</table>
	</div>
</div>

<style>
	@import 'datatables.net-dt/css/jquery.dataTables.css';
</style>
