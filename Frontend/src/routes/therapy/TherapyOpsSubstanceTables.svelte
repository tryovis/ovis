<script lang="ts">
	// @ts-nocheck

    import Headline from '../../components/Headline.svelte';
	import { createTable, changeRowCount } from '../../tableBuilder';
	import { maxStore } from '../../store/maxStore';
	import { t, locale, locales } from "../../store/languageStore";
    import { getTherapyOperationOpsCodeTable } from '../../graphQl/gql-therapy-operation';
    import { getTherapySystemicSubstanceTable } from '../../graphQl/gql-therapy-systemic';
    import { onMount } from 'svelte';

    let showOpsFull = true;
	let showOpsShort = false;
	let showSubstance = false;

    let therapyOpsfullTable: any;
    let therapyOpsshortTable: any;
    let therapySubstanceTable: any;

	let tableShownRows = 6;
	let tableShownRowsMax = 20;
	//let truncateLength = 20;
	let sortingIndex_opsfull = 3;
    let sortingIndex_opsshort = 2;
	let sortingIndexSubstance = 1;

	let maximizeTherapyOpsSubstanceTable: boolean;
	maxStore.subscribe((value: any) => {
		({ maximizeTherapyOpsSubstanceTable } = value);
	});

    let columns_opsfull = [
		{ data: 'code' },
		{ data: 'text' },
		{ data: 'category' },
		{ data: 'count' }
			
	];

    let columns_opsshort = [
		{ data: 'code' },
		{ data: 'text' },	
		{ data: 'count' }
	];
    
    let columns_substance = [
		{ data: 'label' },
		{ data: 'count' },	
	];

    let combinedData:any;
    let initialData:any;
    let substanceData:any;

    function handleMaximized(event: any) {
		maximizeTherapyOpsSubstanceTable = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTherapyOpsSubstanceTable = !storeValues.maximizeTherapyOpsSubstanceTable;
			return storeValues; // Return the updated values
		});
		setTimeout(() => {
			if (maximizeTherapyOpsSubstanceTable) {
				changeRowCount(therapyOpsfullTable, tableShownRowsMax);
                changeRowCount(therapyOpsshortTable, tableShownRowsMax);
                changeRowCount(therapySubstanceTable, tableShownRowsMax);
			} else {
				changeRowCount(therapyOpsfullTable, tableShownRows);
                changeRowCount(therapyOpsshortTable, tableShownRows);
                changeRowCount(therapySubstanceTable, tableShownRows);
			}
		}, 0);
	}
    
    onMount(async () => {
        substanceData = await getTherapySystemicSubstanceTable();
	    initialData = await getTherapyOperationOpsCodeTable(null, 100);
        let opscodes =  stringifyTextObject(initialData.code)
        let opscategories =  initialData.category

		therapyOpsfullTable = createTable(
			'opsfullTable',
			opscodes,
			columns_opsfull,
			tableShownRows,
			//truncateLength,
			sortingIndex_opsfull
		);

        therapyOpsshortTable = createTable(
			'opsshortTable',
			opscategories,
			columns_opsshort,
			tableShownRows,
			//truncateLength,
			sortingIndex_opsshort
		);

        therapySubstanceTable = createTable(
			'substanceTable',
			substanceData,
			columns_substance,
			tableShownRows,
			//truncateLength,
			sortingIndexSubstance
		);
	
	});




    async function showTable(category: string) {
		if (category === 'opsfull') {
			showOpsShort = false;
			showOpsFull = true;
			showSubstance = false;
		}
		if (category === 'opsshort') {
			showOpsShort = true;
			showOpsFull = false;
			showSubstance = false;
			/*if (historyLoaded === false) {
				let initialData: PatientHistoryType[] = await getPatientCohortHistoryTable(null, 100);
				combinedData2 = initialData;
				//loadingStatus = initialData.length;
				patientCohortHistoryTable = createTable(
					'patientCohortHistoryTable',
					initialData,
					columnsHistory,
					tableShownRows,
					truncateLength,
					sortingIndex2
				);
				loadRemainingData2(initialData, initialData?.at(-1)?._id, getPatientCohortHistoryTable);
				historyLoaded = true;
            }*/
			}
		
		if (category === 'substance') {
			showOpsShort = false;
			showOpsFull = false;
			showSubstance = true;
		}
	}

	function stringifyTextObject(remainingData:any){
        console.log("RemainingData", remainingData)
        remainingData.forEach(element => {
            if (element.text) {
                let opsString = element.text.reduce((acc:string,currentValue:any)=>{
                    acc += currentValue + ","
                    return acc
                },"").slice(0,-2) //Schneidet das hintere Komma und Leerzeichen weg
                element.text = opsString;
            }
        });
        return remainingData;
    }
</script>

<div class="straight-line-container">
	<div class="navbar">
		<button class={showOpsFull? 'current_selection' : ''} on:click={() => showTable('opsfull')}
			>{$t("OPSFull")}</button
		>
		<button class={showOpsShort ? 'current_selection' : ''} on:click={() => showTable('opsshort')}
			>{$t("OPSShort")}</button
		>
        <button class={showSubstance ? 'current_selection' : ''} on:click={() => showTable('substance')}
			>{$t("substances")}</button>
	</div>
	<Headline
		headlineTitle={''}
		headlineTooltip={"bla"}
		headlineMaximize={maximizeTherapyOpsSubstanceTable}
		headlineShowChart={null}
		headlineIsChart={false}
		headlineInitialTop5={null}
		headlineInitialLogarithm={null}
		headlineInputTableData={showOpsFull
			? null
			: showOpsShort
			? null
			: null}
		headlineChartJSElement={null}
		headlineD3Element={null}
		on:maximized={handleMaximized}
	/>
</div>
<div style={showOpsFull ? '' : 'display: none;'}>
        <div class="data-table" style="overflow-x: hidden;">
            <table id="opsfullTable" class="display" style="width:100%">
                <thead>
                    <tr>
                        <th>Code</th>
                        <th>Beschreibung(en)</th>
                        <th>Kategorie</th>
                        <th>Anzahl</th>
                    </tr>
                </thead>
            </table>
        </div>
</div>
<div style={showOpsShort? '' : 'display: none;'}>
        <div class="data-table" style="overflow-x: hidden;">
            <table id="opsshortTable" class="display" style="width:100%">
                <thead>
                    <tr>
                        <th>Code</th>
                        <th>Kategorie</th>
                        <th>Anzahl</th>
                    </tr>
                </thead>
            </table>
        </div>
</div>
<div style={showSubstance ? '' : 'display: none;'}>
    <div>
        <div class="data-table" style="overflow-x: hidden;">
            <table id="substanceTable" class="display" style="width:100%">
                <thead>
                    <tr>
                        <th>Wirkstoff</th>
                        <th>Anzahl</th>
                    </tr>
                </thead>
            </table>
        </div>
    </div>
</div>

<style>
	@import 'datatables.net-dt/css/jquery.dataTables.min.css';
	@import 'datatables.net-fixedheader-dt/css/fixedHeader.dataTables.min.css';
</style>