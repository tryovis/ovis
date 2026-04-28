<script lang="ts">
	import { onMount } from 'svelte';
	import Headline from '../../components/Headline.svelte';
	import { createTable, changeRowCount } from '../../tableBuilder';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
	import { getTherapyOperationOpsCodeTable } from '../../graphQl/gql-therapy-operation';
	import { filterActiveStore } from '../../store/filterActiveStore.js';
	import type { LensDataPasser } from "@samply/lens";


    let filterActive = true;
    let filter = JSON.stringify({ "operand": "OR", "children": [] });;
    filterActiveStore.subscribe((value) => {
        filterActive = value.filterActive; // Hier den Wert direkt zuweisen
    });

	let dataPasser: LensDataPasser;

	let therapyOperationOpsCategoryTable: any;
	let tableShownRows = 6;
	let tableShownRowsMax = 20;
	let sortingIndex = 2;
	let tableInput: any;

	let maximizeTherapyOperationOpsCategoryTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeTherapyOperationOpsCategoryTable } = value);
	});

	function handleMaximized(event: any) {
		maximizeTherapyOperationOpsCategoryTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTherapyOperationOpsCategoryTable = !storeValues.maximizeTherapyOperationOpsCategoryTable;
			return storeValues;
		});
		setTimeout(() => {
			if (maximizeTherapyOperationOpsCategoryTable) {
				changeRowCount(therapyOperationOpsCategoryTable, tableShownRowsMax);
			} else {
				changeRowCount(therapyOperationOpsCategoryTable, tableShownRows);
			}
		}, 0);
	}

	let columns = [
		{ data: 'ops_ops4', header: 'Code' },
		{ data: 'ops_text4', header: $t("category") },	
		{ data: 'ops_count', header: $t("count") }
	];

	const headers = columns.length > 0 && columns.some(column => column.header)
		? columns.map(column => column.header)  // Use actual headers if available
		: columns.map((_, index) => `col${index + 1}`);  // Fallback to default column names

	type TherapyOperationOpsCategoryTableType = {
		ops_ops4: string;
		ops_text4: string;
		ops_text: string;
	};

	onMount(async () => { 
		await import("@samply/lens");

		if (filterActive) {
			filter = JSON.stringify(dataPasser.getAstAPI());
		}
		let initialData = await getTherapyOperationOpsCodeTable(null, 100, filter);
		
		tableInput = initialData.category.map((item: any) => {
			return {
				ops_ops4: item.code,   // Schlüssel wird zu ops_code
				ops_text4: item.text,   // Schlüssel wird zu ops_text
				ops_count: item.count  // Schlüssel wird zu ops_count
			};
		});
	
		therapyOperationOpsCategoryTable = createTable(
			"therapy",
			dataPasser,
			'therapyOperationOpsCategoryTable',
			tableInput,
			columns,
			tableShownRows,
			sortingIndex
		);
	});
</script>
<lens-data-passer bind:this={dataPasser} />

<Headline
	headlineTitle={$t("opsCategoryFrequencies")}
	headlineTooltip={$t("tooltip_TherapyOperationOPSCategoryTable")}
	headlineMaximize={maximizeTherapyOperationOpsCategoryTable}
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

<div>
	<div class="data-table">
		<table id="therapyOperationOpsCategoryTable" class="display" style="width:100%">
			<thead>
				<tr>
					<th>Code</th>
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
