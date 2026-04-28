<script lang="ts">
    import { onMount } from 'svelte';
    import { datePickerStore, toggleDatePicker } from '../store/datePickerStore';
	import { reloadOnly } from '../store/reloadStore';
	import { t, locale, locales } from "../store/languageStore";
	import type {LensDataPasser} from "@samply/lens"
	import { iconPath } from '$lib/path-utils';



    const removeIcon = iconPath('times-circle.svg');
    const infoIcon = iconPath('info-outlined.svg');

    const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")); // ["01", ..., "31"]
    const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")); // ["01", ..., "12"]
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: currentYear - 1900 + 1 }, (_, i) => String(1900 + i)).reverse(); // ["2024", ..., "1900"]
    let selectedOption = "datum"; // Standardmäßig "datum" ausgewählt
	let dataPasser: LensDataPasser;

    onMount(async () => {
        await import("@samply/lens");
    });

    function getDay(date: string | null): string {
        if (!date) return "01"; // Default-Wert
        const parts = date.split(".");
        return parts[0] || "01";
    }

    function getMonth(date: string | null): string {
        if (!date) return "01";
        const parts = date.split(".");
        return parts[1] || "01";
    }

    function getYear(date: string | null): string {
        if (!date) return "1900";
        const parts = date.split(".");
        return parts[2] || "1900";
    }

    function getCurrentDate() {
        const now = new Date();
        return {
            day: String(now.getDate()).padStart(2, "0"),
            month: String(now.getMonth() + 1).padStart(2, "0"), // Monate sind nullbasiert
            year: String(now.getFullYear())
        };
    }

    // Statische Werte
    const staticLowerDate = getCurrentDate(); // Aktuelles Datum
    const staticUpperDate = { day: "01", month: "01", year: "1900" }; // 01.01.1900

    // Initialwerte aus dem Store
    $: selectedUpperDay = getDay($datePickerStore.selectedDate);
    $: selectedUpperMonth = getMonth($datePickerStore.selectedDate);
    $: selectedUpperYear = getYear($datePickerStore.selectedDate);
    
    $: collection = $datePickerStore.collection;
    $: typeOfDate = $datePickerStore.typeOfDate;

    $: lowerDay = getDay($datePickerStore.selectedDate);
    $: lowerMonth = getMonth($datePickerStore.selectedDate);
    $: lowerYear = getYear($datePickerStore.selectedDate);

    let selectedOperator = "=";
    let previousOperator = "="; // Zum Speichern des vorherigen Operators

    // Funktion zum Zurücksetzen auf die Ausgangswerte beim Wechsel des Operators
    function resetValuesOnOperatorChange() {
        if (selectedOperator === ">") {
            // Untere Zeile statisch auf aktuelles Datum setzen
            lowerDay = staticLowerDate.day;
            lowerMonth = staticLowerDate.month;
            lowerYear = staticLowerDate.year;

            // Obere Zeile zurücksetzen auf Ausgangswerte, wenn sie aktiv ist
            if (previousOperator !== ">") {
                selectedUpperDay = getDay($datePickerStore.selectedDate);
                selectedUpperMonth = getMonth($datePickerStore.selectedDate);
                selectedUpperYear = getYear($datePickerStore.selectedDate);
            }
        } else if (selectedOperator === "<") {
            // Obere Zeile statisch auf 01.01.1900 setzen
            selectedUpperDay = staticUpperDate.day;
            selectedUpperMonth = staticUpperDate.month;
            selectedUpperYear = staticUpperDate.year;

            // Untere Zeile zurücksetzen auf Ausgangswerte, wenn sie aktiv ist
            if (previousOperator !== "<") {
                lowerDay = getDay($datePickerStore.selectedDate);
                lowerMonth = getMonth($datePickerStore.selectedDate);
                lowerYear = getYear($datePickerStore.selectedDate);
            }
        } else {
            // Für `=` oder andere Operatoren: Reset auf Ausgangswerte (initial selectedDate)
            selectedUpperDay = getDay($datePickerStore.selectedDate);
            selectedUpperMonth = getMonth($datePickerStore.selectedDate);
            selectedUpperYear = getYear($datePickerStore.selectedDate);

            lowerDay = selectedUpperDay;
            lowerMonth = selectedUpperMonth;
            lowerYear = selectedUpperYear;
        }

        // Aktualisiere den vorherigen Operator
        previousOperator = selectedOperator;
    }

    // Event-Handler zur Synchronisierung bei `=`
    function handleUpperChange() {
        if (selectedOperator === "=") {
            lowerDay = selectedUpperDay;
            lowerMonth = selectedUpperMonth;
            lowerYear = selectedUpperYear;
        }
    }

    function handleLowerChange() {
        if (selectedOperator === "=") {
            selectedUpperDay = lowerDay;
            selectedUpperMonth = lowerMonth;
            selectedUpperYear = lowerYear;
        }
    }

    $: isUpperDisabled = selectedOperator === "<"; // Obere Zeile deaktiviert bei `<`
    $: isLowerDisabled = selectedOperator === ">" || selectedOperator === "="; // Untere Zeile deaktiviert bei `>` und `=`

    function toComparableDate(day: string, month: string, year: string): number {
        return parseInt(year + month + day, 10);
    }

    $: isConfirmDisabled = selectedOperator === "[]" &&
        toComparableDate(lowerDay, lowerMonth, lowerYear) < toComparableDate(selectedUpperDay, selectedUpperMonth, selectedUpperYear);
    $: confirmTooltip = isConfirmDisabled ? "Kein gültiges Interval" : "";

    function addDate() {
    // Oberes Datum
    const upperDate = selectedOption === "datum"
        ? `${selectedUpperMonth}.${selectedUpperDay}.${selectedUpperYear}` // Wenn Tag und Monat verfügbar sind
        : `01.01.${selectedUpperYear}`; // Nur Jahr verfügbar (default: 01.01)

    // Unteres Datum
    const lowerDate = selectedOption === "datum"
        ? `${lowerMonth}.${lowerDay}.${lowerYear}` // Wenn Tag und Monat verfügbar sind
        : `12.31.${lowerYear}`; // Nur Jahr verfügbar (default: 31.12)

    // Ausgabe des Datums
    console.log("Oberes Datum:", upperDate);
    console.log("Unteres Datum:", lowerDate);
    
    if(collection === "histology"){
        collection = "diagnosis"
    }
	dataPasser.addStratifierToQueryAPI(
        { label: `${upperDate} - ${lowerDate}`,  catalogueGroupCode: typeOfDate+"", parentGroupCode: collection+""}
        //{ label: `${upperDate} - ${lowerDate}`, catalogueGroupCode: typeOfDate+"", parentGroupCode: collection+""}
    );
    reloadOnly()
    // Schließt die Date-Picker-Komponente
    toggleDatePicker(false);
}



</script>



<lens-data-passer bind:this={dataPasser} />
<div class="disclaimer box_style box_level1">
    <b>Filter {collection}:{typeOfDate}</b>
    <button class="iconRoundButton tooltip">
        <span class="tooltiptext">{@html $t("tooltip_datePicker")}</span>
        <img src="{infoIcon}" alt="info" class="iconRound" />
    </button>
    <button class="iconRoundButton" style="float:right" on:click={() => toggleDatePicker(false)}>
        x
    </button>
    <div class="disclaimer-content grid-date-container">
        <div class="box_style box_level2 operator">
            <!-- Schriftzug -->
            <div class="operator-label">
                {#if selectedOperator === "="}
                    Equals
                {:else if selectedOperator === ">"}
                    Greater
                {:else if selectedOperator === "<"}
                    Lower
                {:else if selectedOperator === "[]"}
                    Between
                {/if}
            </div>
            <br>
            <!-- Dropdown -->
            <select class="operator-select input-field" bind:value={selectedOperator} on:change={resetValuesOnOperatorChange}>
                <option value="=">=</option>
                <option value=">">&gt;</option>
                <option value="<">&lt;</option>
                <option value="[]">[  ]</option>
            </select>
        </div>
        
            
<!-- Header Zeile mit Radiobuttons -->
<div class="box_style box_level2 headerRow">
    <div class="date-item">
        <input
            type="radio"
            id="datum"
            name="dateOption"
            value="datum"
            bind:group={selectedOption}
        />
        <label for="datum">Datum</label>
    </div>
    <div class="date-item">
        <input
            type="radio"
            id="jahr"
            name="dateOption"
            value="jahr"
            bind:group={selectedOption}
        />
        <label for="jahr">Jahr</label>
    </div>
</div>
    
 <!-- Obere Zeile -->
<div class="box_style box_level2 upperRow">
    <div class="date-item">
        Von:
    </div>
    {#if selectedOption === "datum"}
    <div class="date-item">
        <select class ="input-field" bind:value={selectedUpperDay} disabled={isUpperDisabled} on:change={handleUpperChange}>
            {#each days as day}
                <option value={day}>{day}</option>
            {/each}
        </select>
    </div>

    <div class="date-item">
        <select class ="input-field" bind:value={selectedUpperMonth} disabled={isUpperDisabled} on:change={handleUpperChange}>
            {#each months as month}
                <option value={month}>{month}</option>
            {/each}
        </select>
    </div>
    {/if}
    <div class="date-item">
        <select class ="input-field" bind:value={selectedUpperYear} disabled={isUpperDisabled} on:change={handleUpperChange}>
            {#each years as year}
                <option value={year}>{year}</option>
            {/each}
        </select>
    </div>
</div>

<!-- Untere Zeile -->
<div class="box_style box_level2 lowerRow">
    <div class="date-item">
        Bis:
    </div>
    {#if selectedOption === "datum"}
    <div class="date-item">
        <select class ="input-field" bind:value={lowerDay} disabled={isLowerDisabled} on:change={handleLowerChange}>
            {#each days as day}
                <option value={day}>{day}</option>
            {/each}
        </select>
    </div>

    <div class="date-item">
        <select class ="input-field" bind:value={lowerMonth} disabled={isLowerDisabled} on:change={handleLowerChange}>
            {#each months as month}
                <option value={month}>{month}</option>
            {/each}
        </select>
    </div>
    {/if}
    <div class="date-item">
        <select class ="input-field" bind:value={lowerYear} disabled={isLowerDisabled} on:change={handleLowerChange}>
            {#each years as year}
                <option value={year}>{year}</option>
            {/each}
        </select>
    </div>
</div>


    </div>
    
<!-- Confirm Button mit Tooltip -->
<div class="confirm-button-container">
    <button
        class="confirm-button tooltip"
        disabled={isConfirmDisabled}
        on:click={addDate}
    >
        Confirm
        {#if isConfirmDisabled}
            <span class="tooltiptext">{confirmTooltip}</span>
        {/if}
    </button>
</div>

</div>

<!-- Half-transparent overlay -->
<div class="overlay overlay-visible"></div>

<style>

   .headerRow {
        display: flex;
        align-items: center;
        gap: 10px; /* Abstand zwischen Radiobuttons */
    }
    .grid-date-container {
        display: grid;
        grid-template-columns: 25% 75%;
        grid-template-rows: auto auto auto;
        grid-template-areas:
            'operator headerRow'
            'operator upperRow'
            'operator lowerRow';
    }

    .operator {
        grid-area: operator;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .operator-select {
        font-size: 1.2em;
        font-weight: bold;
        padding-right: 15px;
    }

    .upperRow, .lowerRow {
        display: flex;
        align-items: center;
        gap: 15px;
        justify-content: flex-start;
    }

    .date-item {
        display: flex;
        align-items: center;
        gap: 5px;
        width: 24%;
    }

    .disclaimer {
        width: 420px;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: #fff;
        padding: 10px;
        border: 1px solid #ccc;
        border-radius: 5px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        z-index: 9999;
    }

    .overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: -1;
        display: none;
    }

    .overlay-visible {
        display: block;
        z-index: 9998;
    }
    .operator {
    grid-area: operator;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
}

.operator-label {
    font-size: 1em;
    font-weight: bold;
    margin-bottom: 5px;
    text-align: center;
}

.operator-select {
    font-size: 1.2em;
    font-weight: bold;
    padding-right: 15px;
}
.confirm-button-container {
    position: relative;
    display: flex; /* Ändern von inline-block auf flex */
    justify-content: center; /* Horizontale Zentrierung */
    align-items: center; /* Vertikale Zentrierung */
    margin: 5px;
    width: 100%; /* Optionale Breite für flexible Layouts */
    height: 100%; /* Optional, falls vertikale Zentrierung gewünscht ist */
}


.confirm-button {
    font-size: 1em; /* Schriftgröße */
    padding: 10px 20px; /* Innenabstand */
    border: 1px solid var(--border-color); /* Gleicher Rand wie die Input-Felder */
    border-radius: 5px; /* Abgerundete Ecken */
    background-color: rgb(235, 235, 235); /* Leicht dunklere Hintergrundfarbe */
    color: var(--font-color); /* Textfarbe passend zur Farbpalette */
    cursor: pointer; /* Zeiger ändern */
    transition: background-color 0.3s ease, box-shadow 0.3s ease; /* Weiche Übergänge */
}

.confirm-button:hover {
    background-color: rgb(220, 220, 220); /* Etwas dunklerer Hover-Effekt */
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); /* Dezenter Schatten beim Hovern */
}

.confirm-button:disabled {
    cursor: not-allowed; /* Kein Zeiger bei deaktiviertem Button */
    background-color: #f7f7f7; /* Sehr helles Grau */
    color: #aaa; /* Blassere Textfarbe */
    border: 1px solid #ddd; /* Hellerer Rand */
}


.tooltip {
    position: relative;
    display: inline-block;
}



.tooltip:hover .tooltiptext {
    visibility: visible;
    opacity: 1;
}


</style>
