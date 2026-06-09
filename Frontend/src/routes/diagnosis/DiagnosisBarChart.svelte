<script lang="ts">
	// @ts-nocheck
    import { Chart , registerables} from 'chart.js';
    import type { ChartConfiguration, ChartDataset } from 'chart.js';
    import { onMount } from 'svelte';
    import noUiSlider from 'nouislider';
    import '../../nouislider.css';
    import { getDiagnosisBarChart } from '../../graphQl/gql-diagnosis';

    import Headline from "../../components/Headline.svelte";
    import { maxStore } from '../../store/maxStore';
    Chart.register(...registerables);
    import { userStore } from '../../store/userStore';
    import { variantStore } from '../../store/variantStore.js';
    import { t, locale, locales } from "../../store/languageStore";
	import 'jszip/dist/jszip';
    import { createTable, changeRowCount } from '../../tableBuilder';
    import type {LensDataPasser} from "@samply/lens"
    import { reloadOnly } from '../../store/reloadStore';
    import { filterActiveStore } from '../../store/filterActiveStore.js';
    import { configStore } from '../../store/configStore';
    import {addUserFilter} from '../../components/UserFilter'
    import { iconPath } from '$lib/path-utils';
    let filterActive = true;

    // Abonnieren des filterActiveStore und den Wert aktualisieren
    filterActiveStore.subscribe((value) => {
        filterActive = value.filterActive; // Hier den Wert direkt zuweisen
    });

	let DiagnosisBarChartShowChart: boolean;
	let DiagnosisBarChartShowTop5: boolean;
    let DiagnosisBarChartSelectedFeature:any;
    let DiagnosisBarChartSelectedGender:boolean;
    let DiagnosisBarChartSelectedAbscissa:any;


    let dataPasser: LensDataPasser;

    let isCCP: boolean;
    variantStore.subscribe((value: any) => {
        ({ isCCP } = value);
    });

    let primaryColor: string;
    let colorPalette: string[];
    const loadingIcon = iconPath('spinner.svg')
    userStore.subscribe((value: any) => {
        ({ primaryColor, colorPalette } = value);
    });

    const tableShownRowsMax = 19;
    const tableShownRowsMin = 8;
    const sortingIndex = 4;
    const aspectRatioMax = 2.3;
    const aspectRatioMin = 2.6;

    type InputType = {
        category: string[],
        groups: [
            { count: number[], gender: string, label: string, description: string }
        ]
    }

    let columns = [
        { data: 'category' }, //X-Achse
        { data: 'gender' }, //Geschlecht
        { data: 'label' }, //Feature
		{ data: 'description' }, //Langtext
		{ data: 'count' } //Anzahl
	];

    let diagnosisBarChartTable: any;
	let tableShownRows: number = tableShownRowsMin;
    let aspectRatio: number = aspectRatioMin;
    let selectedAbscissa = { value: "years", label: $t("years") };
    let oldSelectedAbscissa = { value: "years", label: $t("years") };
    let selectedAbscissaChanged = false;
    let selectedGender = false;
    let selectedFeature = { value: "ICD_ICD10Group", label: $t("ICD10_grouped") };
    let barChart: HTMLCanvasElement;
    let chartInstance: Chart;
    let slider: any;
    let inputArray: InputType;
    let tableData: TableType[] = [];
    let headers: any;
    let barChartData: ChartDataset[] = [];
    let barChartData2: ChartDataset[] = [];
    let minSliderLabel = 0;
    let maxSliderLabel = 0;
    let leftSlider = 0;
    let rightSlider = 0;
    let x2axis = "";
    let sliderChanged = false;
    let mounted: boolean;
    let genderTypes = [
        { value: false, label: "-" },
        { value: true, label: $t("gender") },
        //{value: false, label: "Altersgruppe"}
    ];
    let maximizeDiagnosisBarChart : boolean;
    let showChart: boolean;
    let showTop5: boolean;
	
    maxStore.subscribe((value: any) => {
        ({ maximizeDiagnosisBarChart } = value);
    });

    function registerAbscissaChange() {
        if (selectedAbscissa !== oldSelectedAbscissa) {
            oldSelectedAbscissa = selectedAbscissa;
            selectedAbscissaChanged = true;
        }
    }

    function mergeColorsToLabels(keys: string[], vals: string[]) {
        const map: any = {};
        const vallength = vals.length;
        Array.from(keys).forEach((key:any, index:number) => { 
            map[key] = vals[index % vallength]
        });
        return map;
    }
    
    function mergeCountsToLabels(groups: { count: number[], gender: string, label: string, description: string }[]) {
        const map: { [key: string]: { count: number[], gender: string, label: string, description: string } } = {};

        groups.forEach(element => {
            if (!map[element.label]) {
                map[element.label] = {
                    count: element.count,
                    gender: element.gender,
                    label: element.label,
                    description: element.description
                };
            } else {
                // Falls es bereits einen Eintrag für das Label gibt, addiere die Werte der Zähler (count) hinzu
                map[element.label].count = map[element.label].count.map((value, index) => value + element.count[index]);
            }
        });

        return map;
    }

    $: {
        showTop5;
        selectedAbscissa;
        selectedFeature;
        selectedGender;
        aspectRatio
        sliderChanged; //Schaltet immer wenn ich den Slider change zwischen true und false hin und her
        registerAbscissaChange()
        if (isMounted()) {           
            createBarChart();
            updateConfigStoreValues();
        }
    }

    function updateConfigStoreValues(){
        configStore.update((storeValues) => {
			storeValues.DiagnosisBarChartSelectedFeature = selectedFeature;
            storeValues.DiagnosisBarChartSelectedGender = selectedGender;
            storeValues.DiagnosisBarChartSelectedAbscissa = selectedAbscissa;
			return storeValues;
		});
    }

    function isMounted() {
        return mounted;
    }
    let filter = JSON.stringify({ "operand": "OR", "children": [] });
    let abscissaKey = "";

    onMount(async () => {
        await import("@samply/lens");
        if (filterActive) {
            filter = JSON.stringify(dataPasser.getAstAPI());
        }
        filter = JSON.stringify(await addUserFilter(JSON.parse(filter)));
        mounted = false;

        configStore.subscribe((value: any) => {
		    DiagnosisBarChartShowChart = value.DiagnosisBarChartShowChart;
            DiagnosisBarChartShowTop5 = value.DiagnosisBarChartShowTop5;
            DiagnosisBarChartSelectedFeature = value.DiagnosisBarChartSelectedFeature;
            DiagnosisBarChartSelectedGender = value.DiagnosisBarChartSelectedGender;
            DiagnosisBarChartSelectedAbscissa = value.DiagnosisBarChartSelectedAbscissa;
	    });
        showChart = DiagnosisBarChartShowChart;
        showTop5 = DiagnosisBarChartShowTop5;
        selectedFeature = DiagnosisBarChartSelectedFeature;
        selectedGender = DiagnosisBarChartSelectedGender;
        selectedAbscissa= DiagnosisBarChartSelectedAbscissa;

        abscissaKey = typeof selectedAbscissa.label === "string" 
                        ? (selectedAbscissa.label.startsWith("Total") 
                            ? null 
                            : selectedAbscissa.label.startsWith("Entity") 
                                ? "ICD_ICD10_3" 
                                : "diagnosisDate")
                        : null; 

        createBarChart()
    });

    function handleMaximized(event: any) {
        maximizeDiagnosisBarChart  = event.detail.headlineMaximize;
        maxStore.update((storeValues) => {
            storeValues.maximizeDiagnosisBarChart = !storeValues.maximizeDiagnosisBarChart ;
            return storeValues; // Return the updated values
        });
        if (maximizeDiagnosisBarChart) {
            aspectRatio = aspectRatioMax;
            tableShownRows = tableShownRowsMax;
            changeRowCount(diagnosisBarChartTable, tableShownRows);
        } else {
            aspectRatio = aspectRatioMin;
            tableShownRows = tableShownRowsMin;
            changeRowCount(diagnosisBarChartTable, tableShownRows);
        }
	}
    
    function handleChartToggled(event: any) {
        showChart = event.detail.headlineShowChart;
        configStore.update((storeValues) => {
			storeValues.DiagnosisBarChartShowChart = showChart;
			return storeValues;
		});
        if(!showChart) {
            diagnosisBarChartTable = createTable(
                "diagnosis",
                dataPasser,
                'diagnosisBarChartTable',
                tableData,
                columns,
                tableShownRows,
                sortingIndex);
        }
    }  
    
    function handleTop5Toggled(event: any) {
        showTop5 = event.detail.headlineInitialTop5;
        configStore.update((storeValues) => {
			storeValues.DiagnosisBarChartShowTop5 = showTop5;
			return storeValues;
		});
    }

    const addItem = (queryObject: QueryItem): void => {
        
        dataPasser.addStratifierToQueryAPI({ label: queryObject.values[0].value ,catalogueGroupCode: queryObject.key, parentGroupCode:queryObject.system});
        console.log(dataPasser.getQueryAPI());
    };

    async function createBarChart() {
        tableData = [];
       // console.log("SELECTED FEATURE", selectedFeature.value)
        const result = await getDiagnosisBarChart( {
            "genderWise": selectedGender,
            "group": selectedFeature.value,
            "abscissa": selectedAbscissa.value
        }, filter);
        barChartData = [];
        barChartData2 = [];
        inputArray = result;
        if(selectedAbscissa.value === "none"){
            inputArray.category = inputArray.category.map(c => c === null ? "Total" : c);
        }
        // Find the index of the null value in the category array
        const nullIndex = inputArray.category.indexOf(null);

        // If null is found, remove it and the corresponding entries in each group's count array
        if (nullIndex !== -1) {
            inputArray.category.splice(nullIndex, 1);
            inputArray.groups.forEach(group => {
                group.count.splice(nullIndex, 1);
            });
        }

        //console.log("Input Array", inputArray);
                
        if (!inputArray.category[0]) {
            inputArray.category[0] = "Gesamtkohorte";
        }
        //console.log("Input Array", inputArray);
     
         for (let i = 0; i < inputArray.groups.length; i++) {
            inputArray.category.forEach((category, index) => {
                let count = inputArray.groups[i].count[index];
                let gender = inputArray.groups[i].gender || "x";
                let label = inputArray.groups[i].label;
                let description = inputArray.groups[i].description;

                tableData.push({
                    [abscissaKey]: category,
                    "gender": gender,
                    [selectedFeature.value+"Text"]: description,
                    [selectedFeature.value] : label,
                    "count": count
                });
                columns = [
                    { data: abscissaKey }, //selectedAbscissa.label
                    { data: 'gender' }, //Geschlecht
                    { data: selectedFeature.value}, //Feature
                    { data: selectedFeature.value+"Text"}, //Langtext
                    { data: 'count' } //Anzahl
                ];
            });
        }

        diagnosisBarChartTable = createTable(
            "diagnosis",
            dataPasser,
            'diagnosisBarChartTable',
            tableData,
            columns,
            tableShownRows,
            sortingIndex);
                
        if (showTop5) {
            
            let countHashMap = mergeCountsToLabels(inputArray.groups);
            let sortedHashMap = Object.entries(countHashMap).sort((a,b) => b[1] - a[1]);
            let sumOther = 0;
            for(let i = 5; i < sortedHashMap.length; i++) {
                sumOther += sortedHashMap[i][1];
            }
            let top5HashMap = sortedHashMap.slice(0, 5);
            
            let topCategoriesInputArray = inputArray.groups.filter(element => top5HashMap.some(item => item[0] === element.label));
            let restInputArray = inputArray.groups.filter(element => !top5HashMap.some(item => item[0] === element.label));
            let countsObjectArray: any[] = [];
            restInputArray.forEach((element) => {
                let found = countsObjectArray.find(felement => element.gender === felement.gender);
                if (!found) {
                    countsObjectArray.push({count:Array(inputArray.category.length).fill(0), label: "Sonstige", gender: element.gender});
                    found = countsObjectArray[countsObjectArray.length - 1];
                }    
                element.count.forEach((celement, cindex) => {
                    found.count[cindex]+= celement;
                });
            });
        
            topCategoriesInputArray.push(...countsObjectArray);
            inputArray.groups = topCategoriesInputArray;
    
        }

        let uniqueLabels: any = new Set(inputArray.groups.map(element => element.label));
        let uniqueStackLabels: any = new Set(inputArray.groups.map(element => element.gender));
        uniqueStackLabels = new Set([...uniqueStackLabels].map((value) => value === null ? "x" : value));
        x2axis = [...uniqueStackLabels].join(" | ");
    
        let colorHashMap = mergeColorsToLabels(uniqueLabels, colorPalette);
        setSlider();
        inputArray.category = inputArray.category.slice(leftSlider, rightSlider+1);
        inputArray.groups.forEach((group) => {
            group.count = group.count.slice(leftSlider, rightSlider + 1);
        });
                
        inputArray.groups.forEach((dataset, index) => {
            barChartData.push({
                //label: `${dataset.label}_${dataset.gender}`,
                label: `${dataset.label}`, // Dies erstellt ein Array mit einem String-Element. Wenn Sie nur einen String möchten, verwenden Sie: label: `${dataset.label}`,
                data: dataset.count,
                backgroundColor: colorHashMap[dataset.label],
                borderWidth: 1,
                order: [...uniqueStackLabels].indexOf(dataset.gender),
                stack: dataset.gender ? dataset.gender : "x"  // Sicherstellen, dass stack nie undefined ist
            });
        });
            
        mounted = true;
        
        let ctx = barChart.getContext('2d');
    
        const chartConfig: ChartConfiguration = {
            type: 'bar',
            data: {
                labels: inputArray.category, // Verwenden Sie die Jahre für die X-Achse
                datasets: barChartData
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        type:  'linear',
                        beginAtZero: true,
                        stacked: true, // Balken stapeln
                        title: {
                            display: true,
                            text: $t("numOfTumorCases")
                        }
                    },
                    x: {
                        stacked: true,
                        ticks: {
                            font: {
                                size: 10
                            },
                            callback: () => x2axis
                        },
                        display: selectedGender ? true : false 
                    },
                    x2: {
                        border: {
                            display: false
                        },
                        grid: {
                            display: false
                        }
                    },
                },
                aspectRatio: aspectRatio, 
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            generateLabels: function (chart) {
                                const originalLabels = Chart.defaults.plugins.legend.labels.generateLabels(chart);            
                                // Hier die eindeutigen Labels konsolidieren
                                const consolidatedLabels = mergeLabels(originalLabels.map((label) => label.text));            
                                // Fügen Sie " X" am Ende jedes Labels hinzu
                                let i = 0;
                                const updatedLabels = consolidatedLabels.map((label) => {
                                    return {
                                        text: label,
                                        fillStyle: colorHashMap[label], // Fügen Sie die Farbe zum Label hinzu
                                        lineWidth: 0,
                                        hidden: chart.getDatasetMeta(0).data.some((element) => element.custom && element.custom === label)
                                    };
                                });

                                return updatedLabels;
                            },
                        },
                        onClick: (e, legendItem, legend) => {
                            // Hier können Sie den Klick auf die Legende anpassen
                            const chart = legend.chart;
                            const labelToToggle = legendItem.text;
                        
                            chart.data.datasets.forEach((dataset) => {
                                if (dataset.label === labelToToggle) {
                                    dataset.hidden = !dataset.hidden;
                                }
                            });
                        
                            chart.update();
                        },
                    },
                },
                        onClick: (e, elements) => {
            if (elements.length > 0) {
                const elementIndex = elements[0].index; 
                const datasetIndex = elements[0].datasetIndex;
                const label = chartConfig.data.datasets[datasetIndex].label;
                const gender = chartConfig.data.datasets[datasetIndex]?.stack || "unknown";
                const category = chartConfig.data.labels[elementIndex];
                
                if(label !== "Sonstige"){
                    let queryItem1 = {
                        id: "Random generierte UUID",
                        key: selectedFeature.value, 
                        name: "childCategorie.name",
                        system: "diagnosis",
                        type: "EQUALS",
                        values: [
                        {   "name": label,
                            "value": label,
                            "queryBindId": "Auch eine random UUID"
                        }]
                    };
                    addItem(queryItem1);
                } else {
                    let nonTop5Labels = inputArray.groups
                        .filter(g => g.label !== "Sonstige")
                        .map(g => g.label);
                    
                    nonTop5Labels.forEach(label => {
                        let queryItem = {
                            id: "Random generierte UUID",
                            key: "!"+selectedFeature.value, 
                            name: "childCategorie.name",
                            system: "diagnosis",
                            type: "NEQUALS",
                            values: [
                            {   "name": label,
                                "value": label,
                                "queryBindId": "Auch eine random UUID"
                            }]
                        };
                        addItem(queryItem);
                    });
                }
                        // Wenn gender definiert ist, füge es zur Ausgabe hinzu
                        console.log("GENDER?", chartConfig.data.datasets[datasetIndex])
                        //console.log("Click", queryItem1)
                        if (selectedGender) {
                            if(gender !== "x"){
                            console.log(`Bar clicked: ${label} in category ${selectedAbscissa.label}: ${category} with gender ${gender}`);
                            let queryItem2 = {
                                id: "Random generierte UUID",//uuidv4(),
                                key: "gender", 
                                system: "patient",
                                name: "childCategorie.name", //Im Katalog hinterlegt
                                type: "EQUALS",
                                values: [
                                {   "name": label, //Anzeigename
                                    "value": gender, // theoreitsch label z.B. BRA Backendvalue
                                    "queryBindId": "Auch eine random UUID" //Storebindung
                                }]
                                
                            }
                            console.log("Click2", queryItem2)
                            addItem(queryItem2);
                        }
                        } else {
                            console.log(`Bar clicked: ${label} in category ${selectedAbscissa.label}: ${category}`);
                        }
                        
                        if (abscissaKey) {
                            console.log("ENTERED ABSCICSSA KEY", abscissaKey)
                            let queryItem3 = {
                                    id: "Random generierte UUID",//uuidv4(),
                                    key: abscissaKey, //theoretisch metastasis => Im Katalog hinterlegt
                                    name: "childCategorie.name", //Im Katalog hinterlegt
                                    type: "EQUALS",
                                    system: "diagnosis",
                                    values: [
                                    {   "name": category, //Anzeigename
                                        "value": category, // theoreitsch label z.B. BRA Backendvalue
                                        "queryBindId": "Auch eine random UUID" //Storebindung
                                    }]
                                };

                                if (abscissaKey === "diagnosisDate") {
                                    console.log("📌 ENTER DIAGNOSISDATE CLICK");

                                    let minDate: number | null = null;
                                    let maxDate: number | null = null;

                                    if (/^\d{4}$/.test(category)) {
                                        // 🟢 Jahr (z. B. "2015")
                                        minDate = new Date(parseInt(category), 0, 1, 0, 0, 0).getTime();
                                        maxDate = new Date(parseInt(category), 11, 31, 23, 59, 59).getTime();
                                    } else if (/^\d{4}-Q[1-4]$/.test(category)) {
                                    // 🟢 Quartal erkannt, z. B. "2022-Q1"
                                    const [year, quarter] = category.split("-Q");
                                    const quarterMap = {
                                        "1": { start: [0, 1], end: [2, 31] },  // Januar - März
                                        "2": { start: [3, 1], end: [5, 30] },  // April - Juni
                                        "3": { start: [6, 1], end: [8, 30] },  // Juli - September
                                        "4": { start: [9, 1], end: [11, 31] }  // Oktober - Dezember
                                    };

                                    if (quarterMap[quarter]) {
                                        minDate = new Date(parseInt(year), quarterMap[quarter].start[0], quarterMap[quarter].start[1], 0, 0, 0).getTime();
                                        maxDate = new Date(parseInt(year), quarterMap[quarter].end[0], quarterMap[quarter].end[1], 23, 59, 59).getTime();
                                    }
                                }
                                else if (/^\d{4}-\d{2}$/.test(category)) {
                                    // 🟢 Monat erkannt, z. B. "2023-07"
                                    const [year, month] = category.split("-");
                                    const parsedMonth = parseInt(month) - 1; // JS-Monate sind 0-basiert (Januar = 0)

                                    minDate = new Date(parseInt(year), parsedMonth, 1, 0, 0, 0).getTime();
                                    maxDate = new Date(parseInt(year), parsedMonth + 1, 0, 23, 59, 59).getTime();
                                }else if (/^\d{4}-W\d{2}$/.test(category)) {
                                        // ✅ Woche (z. B. "2023-W52")
                                        console.log("🟢 Woche erkannt:", category);
                                        const [year, week] = category.split("-W");
                                        const firstThursday = new Date(parseInt(year), 0, 4); // 4. Januar als Anker für KW1
                                        const firstWeekday = firstThursday.getDay(); // Wochentag ermitteln

                                        // Montag der ersten KW berechnen
                                        const firstMonday = new Date(firstThursday);
                                        firstMonday.setDate(firstThursday.getDate() - firstWeekday + 1);

                                        // Start der gewählten Woche berechnen
                                        minDate = new Date(firstMonday);
                                        minDate.setDate(minDate.getDate() + (parseInt(week) - 1) * 7);
                                        minDate.setHours(0, 0, 0, 0);

                                        // Ende der gewählten Woche berechnen (Sonntag)
                                        maxDate = new Date(minDate);
                                        maxDate.setDate(maxDate.getDate() + 6);
                                        maxDate.setHours(23, 59, 59, 999);
                                    }



                                    // 🔥 DEBUGGING: Prüfen, ob beide Werte korrekt gesetzt sind
                                    console.log(`✅ minDate: ${minDate}, maxDate: ${maxDate}`);

                                    // ❌ Falls minDate oder maxDate nicht gesetzt sind → Fehler ausgeben
                                    if (!minDate || isNaN(minDate) || !maxDate || isNaN(maxDate)) {
                                        console.error("❌ FEHLER: minDate oder maxDate ist NaN!", { category, minDate, maxDate });
                                        return;
                                    }

                                    // **🟢 Datum in MM.TT.YYYY formatieren**
                                    const formatDate = (timestamp: number) => {
                                        const date = new Date(timestamp);
                                        return `${(date.getMonth() + 1).toString().padStart(2, "0")}.${date.getDate().toString().padStart(2, "0")}.${date.getFullYear()}`;
                                    };

                                    const lowerDate = formatDate(minDate);
                                    const upperDate = formatDate(maxDate);

                                    console.log(`🟢 Diagnosis Date Query: VON ${lowerDate} BIS ${upperDate}`);

                                    dataPasser.addStratifierToQueryAPI({
                                        label: `${lowerDate} - ${upperDate}`,
                                        catalogueGroupCode: "diagnosisDate",
                                        parentGroupCode: "diagnosis"
                                    });

                                    console.log("🟢 DiagnosisDate erfolgreich hinzugefügt.");
                                }
                    } else {
                        console.log('No bar clicked');
                    }
                    reloadOnly();
                }
            },
        }
        };

        headers = [ selectedAbscissa.label, $t("gender"), selectedFeature.label, $t("longText"), $t("count") ];
    
        // Das Chart-Objekt erstellen oder aktualisieren
        if (ctx) {
            if (chartInstance) {
                chartInstance.destroy(); // Vorheriges Chart-Objekt löschen, falls vorhanden
            }
            chartInstance = new Chart(ctx, chartConfig); // Chart-Objekt in der separaten Variable speichern
        }
    }

    function mergeLabels(labels: string[]): string[] {
        const uniqueLabels = new Set(labels);
        return Array.from(uniqueLabels);
    }

    function destroySlider() {
        if (slider) {
            slider.noUiSlider.destroy(); // Zerstört den bestehenden Slider
        }
    }
    
    function setSlider() {
        destroySlider();
        slider = document.getElementById('slider-round') as any; // 'as any' Typumwandlung
        let sliderMaxValue = inputArray.category.length-1
        if (!mounted || selectedAbscissaChanged) {
            leftSlider = Math.max(sliderMaxValue - 15, 0);
            rightSlider = sliderMaxValue;
            selectedAbscissaChanged = false;
        }
        noUiSlider.create(slider, {
            start: [ leftSlider, rightSlider ],
            range: {
                min: 0,
                max: sliderMaxValue,
            }
        });
    
        // Binden Sie das 'slide'-Event an den Slider und rufen Sie handleSliderChange auf
        slider.noUiSlider.on('change', (values: string[], handle: number) => {
            if (handle === 0) {
                leftSlider = parseInt(values[0]);
            } else {
                rightSlider = parseInt(values[1]);
            }
            sliderChanged = !sliderChanged; //slider Changed wird nur benötigt für reactive verhalten
        });
    
        minSliderLabel = inputArray.category[leftSlider];
        maxSliderLabel = inputArray.category[rightSlider]; 
    }

</script>

<Headline
    headlineTitle={$t("tumorFrequencies")}
    headlineTooltip={$t("tooltip_DiagnosisBarChart")}
	headlineMaximize={maximizeDiagnosisBarChart}
    headlineShowChart={showChart}
	headlineIsChart={true}
	headlineInitialTop5={showTop5}
    headlineInitialLogarithm={null}
    headlineInputTableData={tableData}
    headlineInputTableHeader={headers}
	headlineChartJSElement={barChart}
	headlineD3Element={null}
    on:chartToggled={handleChartToggled} 
    on:top5Toggled={handleTop5Toggled} 
    on:maximized={handleMaximized}
/>
<lens-data-passer bind:this={dataPasser} />  
<div class="straight-line-container">
    <div class="dropdown-container">
        <div class="hdropdown">
            <label for="dimension">{$t("xAxis")}:</label><br>
            <div class="menu">
                <ul>
                    <li>
                        {selectedAbscissa.label}<select class="carret-decoration"></select>
                        <ul>
                            <li class="link">
                                <button on:click={() => selectedAbscissa = { value: "none", label: $t("totalCohort") }}>{$t("totalCohort")}</button>
                            </li>
                            <li class="link">
                                <button on:click={() => selectedAbscissa = { value: "ICD_ICD10_3", label: $t("entityICD10_3digit") }}>{$t("entityICD10_3digit")}</button>
                            </li>
                            <li>
                                {$t("time")}
                                <ul>
                                    <li class="link"><button on:click={() => selectedAbscissa = { value: "weeks", label: $t("weeks") }}>{$t("weeks")}</button></li>
                                    <li class="link"><button on:click={() => selectedAbscissa = { value: "months", label: $t("months") }}>{$t("months")}</button></li>
                                    <li class="link"><button on:click={() => selectedAbscissa = { value: "quarters", label: $t("quarters") }}>{$t("quarters")}</button></li>
                                    <li class="link"><button on:click={() => selectedAbscissa = { value: "years", label: $t("years") }}>{$t("years")}</button></li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>
            </div>
        </div>

        <div class="dropdown">
            <label for="dimension">{$t("grouping")}:</label><br>
            <select class="dropbtn" bind:value={selectedGender}>
                {#each genderTypes as option}
                    <option class="dropdown-option" value={option.value}>{option.label}</option>
                {/each}
            </select>
        </div>
    
    <div class="hdropdown">
        <label for="dimension">{$t("selectionImportantFeatures")}:</label><br>
        <div class="menu">
            <ul>
                <li>
                    {selectedFeature.label}<select class="carret-decoration"></select>
                    <ul>
                        <li class="link"><button on:click={() => selectedFeature = { value: "noGroup", label: $t("noSelection")}}>{$t("noSelection")}</button></li>   
                        <li>
                            {$t("tumorFeature")}
                            <ul>
                                <li>ICD-10
                                    <ul>
                                        <li class="link"><button on:click={() => selectedFeature = { value: "ICD_ICD10Group", label: $t("ICD10_grouped")}}>{$t("ICD10_grouped")}</button></li>
                                        <li class="link"><button on:click={() => selectedFeature = { value: "ICD_ICD10_3", label: $t("ICD10_3digit")}}>{$t("ICD10_3digit")}</button></li>
                                        <li class="link"><button on:click={() => selectedFeature = { value: "ICD_ICD10", label: $t("ICD10_detailed")}}>{$t("ICD10_detailed")}</button></li>
                                    </ul>
                                </li>
                            
                                <li>{$t("grading")}
                                    <ul>
                                        <li class="link"><button on:click={() => selectedFeature = { value: "grading_first", label: $t("gradingFirst")}}>{$t("gradingFirst")}</button></li>
                                        <li class="link"><button on:click={() => selectedFeature = { value: "grading_last", label: $t("gradingLast")}}>{$t("gradingLast")}</button></li>
                                        <li class="link"><button on:click={() => selectedFeature = { value: "grading_lowest", label: $t("gradingLowest")}}>{$t("gradingLowest")}</button></li>
                                        <li class="link"><button on:click={() => selectedFeature = { value: "grading_highest", label: $t("gradingHighest")}}>{$t("gradingHighest")}</button></li>
                                    </ul>
                                </li>
                                <li class="link"><button on:click={() => selectedFeature = { value: "metastasis", label: $t("metastases")}}>{$t("metastases")}</button></li>
                                <li class="link"><button on:click={() => selectedFeature = { value: "ICDO_localizationCode", label: $t("ICDO_localization")}}>{$t("ICDO_localization")}</button></li>
                                <li class="link"><button on:click={() => selectedFeature = { value: "ICDO_histologyCode", label: $t("ICDO_histology")}}>{$t("ICDO_histology")}</button></li>
                                <li class="link"><button on:click={() => selectedFeature = { value: "side", label: $t("side")}}>{$t("side")}</button></li>

                                {#if !isCCP}
                                <li class="link"><button on:click={() => selectedFeature = { value: "diagnosisAssurance", label: $t("diagnosisConfirmation")}}>{$t("diagnosisConfirmation")}</button></li>
                                <li class="link"><button on:click={() => selectedFeature = { value: "diagnosisReason", label: $t("diagnosisReason")}}>{$t("diagnosisReason")}</button></li>
                                {/if}
     
                            </ul>
                        </li>
            <li>
                {$t("therapyDiagnostic")}
                <ul>
                    <li class="link"><button on:click={() => selectedFeature = { value: "previousTherapy_surgery", label: $t("receivedSurgery")}}>{$t("receivedSurgery")}</button></li>
                    <li class="link"><button on:click={() => selectedFeature = { value: "previousTherapy_radiation", label: $t("receivedRadiation")}}>{$t("receivedRadiation")}</button></li>
                    <li class="link"><button on:click={() => selectedFeature = { value: "previousTherapy_systemic", label: $t("receivedSystemicTherapy")}}>{$t("receivedSystemicTherapy")}</button></li>
                    <li class="link"><button on:click={() => selectedFeature = { value: "previousDiagnostic_radiology", label: $t("receivedRadiologicalDiagnostics")}}>{$t("receivedRadiologicalDiagnostics")}</button></li>
                    <!--<li class="link"><button on:click={() => selectedFeature = { value: "Intern / Extern", label: "Intern / Extern" }}>Intern / Extern</button></li>
                    <li class="link"><button on:click={() => selectedFeature = { value: "Ambulant / Stationär", label: "Ambulant / Stationär" }}>Ambulant / Stationär</button></li>
                    <li class="link"><button on:click={() => selectedFeature = { value: "Fachliche Abteilung", label: "Fachliche Abteilung" }}>Fachliche Abteilung</button></li>-->
                </ul>
            </li>
            <li>
                {$t("patientCondition")}
                <ul>
                    {#if !isCCP}
                    <li>ECOG
                        <ul>
                            <li class="link"><button on:click={() => selectedFeature = { value: "ECOG_first", label: $t("ECOGFirst")}}>{$t("ECOGFirst")}</button></li>
                            <li class="link"><button on:click={() => selectedFeature = { value: "ECOG_last", label: $t("ECOGLast")}}>{$t("ECOGLast")}</button></li>
                            <li class="link"><button on:click={() => selectedFeature = { value: "ECOG_lowest", label: $t("ECOGLowest")}}>{$t("ECOGLowest")}</button></li>
                            <li class="link"><button on:click={() => selectedFeature = { value: "ECOG_highest", label: $t("ECOGHighest")}}>{$t("ECOGHighest")}</button></li>
                        </ul>
                    </li>
                    <li class="link"><button on:click={() => selectedFeature = { value: "distress", label: $t("distressPresent")}}>{$t("distressPresent")}</button></li>
                    <!--<li class="link"><button on:click={() => selectedFeature = { value: "MenopauseStatus", label: $t("menopause") }}>{$t("menopause")}</button></li>-->
                    {/if}
                    <li class="link"><button on:click={() => selectedFeature = { value: "VitalState", label: $t("vitalStatus")}}>{$t("vitalStatus")}</button></li>
                    <li class="link"><button on:click={() => selectedFeature = { value: "ageAtDiagnosis", label: $t("ageGroupAtDiagnosis")}}>{$t("ageGroupAtDiagnosis")}</button></li>
                </ul>
            </li>

            {#if !isCCP}
            <li>
                {$t("tumorboards")}
                <ul>
                    <li class="link"><button on:click={() => selectedFeature = { value: "previousTumorboard_any", label: $t("tumorboardAny") }}>{$t("tumorboardAny")}</button></li>
                    <li class="link"><button on:click={() => selectedFeature = { value: "previousTumorboard_prae", label: $t("tumorboardPrae") }}>{$t("tumorboardPrae")}</button></li>
                    <li class="link"><button on:click={() => selectedFeature = { value: "previousTumorboard_post", label: $t("tumorboardPost") }}>{$t("tumorboardPost")}</button></li>
                    <li class="link"><button on:click={() => selectedFeature = { value: "previousTumorboard_mtb", label: $t("tumorboardMTB") }}>{$t("tumorboardMTB")}</button></li>
                </ul>
            </li>
            <li>
                {$t("consultations")}
                <ul>
                    <li class="link"><button on:click={() => selectedFeature = { value: "previousConsultation_social", label: $t("social") }}>{$t("social")}</button></li>
                    <li class="link"><button on:click={() => selectedFeature = { value: "previousConsultation_psycho", label: $t("psychooncological") }}>{$t("psychooncological")}</button></li>
                    <li class="link"><button on:click={() => selectedFeature = { value: "previousConsultation_nutrition", label: $t("nutrition") }}>{$t("nutrition")}</button></li>
                    <li class="link"><button on:click={() => selectedFeature = { value: "previousConsultation_genetic", label: $t("genetic") }}>{$t("genetic")}</button></li>
                </ul>
            </li>
            
            <li> 
                {$t("organizational")}
                <ul>
                    <li class="link"><button on:click={() => selectedFeature = { value: "primaryCase", label: $t("primaryCase") }}>{$t("primaryCase")}</button></li>
                    <li class="link"><button on:click={() => selectedFeature = { value: "centerCase", label: $t("centerCase") }}>{$t("centerCase")}</button></li>
                    <!--<li class="link"><button on:click={() => selectedFeature = { value: "patientCase", label: $t("patientCase") }}>{$t("patientCase")}</button></li>-->
                    <li class="link"><button on:click={() => selectedFeature = { value: "recurrence", label: $t("recurrence") }}>{$t("recurrence")}</button></li>
                    <li class="link"><button on:click={() => selectedFeature = { value: "organizationalUnit", label: $t("organizationalUnit") }}>{$t("organizationalUnit")}</button></li>
                    <li class="link"><button on:click={() => selectedFeature = { value: "internal", label: $t("internalExternal")}}>{$t("internalExternal")}</button></li>
                    <!--<li class="link"><button on:click={() => selectedFeature = { value: "Ambulant/Stationär", label: $t("organizationalUnit") }}>{$t("organizationalUnit")}</button></li>-->
                </ul>
            </li>
            {/if}
            </ul>
          </li>
    
        </ul>
    </div>
    </div> 
    </div>
    </div>

    <div style={showChart ? '' : 'display: none;'}>
        <div style={mounted? '' : 'display: none;'}>
        <div class="chart-container" >
            <canvas bind:this={barChart}></canvas>
        </div>
        <div class="straight-line-container">
            <span class="min-slider">{minSliderLabel}</span>
            <div class="slider-container">
                <div id="slider-round"></div>
            </div>
            <span class="max-slider">{maxSliderLabel}</span>
        </div>
    </div>
  
</div>
<div style={!mounted? '' : 'display: none;'} class="bigSpinnerContainer">
    <button class="bigSpinnerButton"><img class="bigSpinner"  id="spinner" src={loadingIcon} alt="Spinner"></button>
</div>
<div class="data">
	<div class="data-table" style={!showChart ? '' : 'display: none;'}>
		<div class="data-table">
            <table id="diagnosisBarChartTable" class="display" style="width:100%">
                <thead>
                    <tr>    
                        <th class="{abscissaKey === 'diagnosisDate' ? 'dateColumn' : ''}">{$t("xAxis")}</th>
                        <th>{$t("gender")}</th>
                        <th>{selectedFeature.label}</th>
                        <th>{$t("longText")}</th>
                        <th>{$t("count")}</th>
                    </tr>
                </thead>
            </table>
        </div>
    </div>
</div>
