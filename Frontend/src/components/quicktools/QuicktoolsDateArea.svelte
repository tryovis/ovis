<script lang="ts">
	import { datePickerStore } from '../../store/datePickerStore';
	import { t, locale, locales } from "../../store/languageStore";
	interface Option {
		anzeigename: string;
		collection: string;
		feldwert: string;
	}

	let options: Option[] = [
		{ anzeigename: $t("diagnosisDateLong"), collection: "diagnosis", feldwert: "diagnosisDate" },
		{ anzeigename: $t("therapyDateLong"), collection: "therapy", feldwert: "therapyOccurrenceDate" },
		{ anzeigename: $t("progressDateLong"), collection: "progress", feldwert: "progressOccurrenceDate" },
		{ anzeigename: $t("tumorBoardDateLong"), collection: "tumorBoard", feldwert: "tumorBoardOccurrenceDate" },
		{ anzeigename: $t("consultationDateLong"), collection: "consultation", feldwert: "consultationOccurrenceDate" }
	];

	let selectedOption: Option | null = null;

	function addSelectedOption() {
		if (selectedOption) {
			const today = new Date().toLocaleDateString('de-DE');

			datePickerStore.set({
				show: true,
				selectedDate: today,
				collection: selectedOption.collection,
				typeOfDate: selectedOption.feldwert        
			});
			console.log(`Option hinzugefügt: ${selectedOption.anzeigename}`);
		} else {
			console.log("Keine Option ausgewählt.");
		}
		// Zurücksetzen auf den Ausgangszustand
		selectedOption = null;
	}
</script>

<div class="dropdown-container">
	<label for="optionDropdown" class="dropdown-label">{$t("date")}:</label>
	<div class="input-container">
		<select 
			id="optionDropdown" 
			class="input-field {selectedOption === null ? 'placeholder-active' : ''}" 
			bind:value={selectedOption} 
			on:change={addSelectedOption}>
			<option value={null} disabled selected class="placeholder">{$t("select")} {$t("dateSmall")}</option>
			{#each options as option}
				<option value={option} class="dropdown-option">{option.anzeigename}</option>
			{/each}
		</select>
	</div>
</div>

<style>
	.dropdown-container {
		display: flex;
		align-items: center;
		flex: 1;
	}

	.dropdown-label {
		min-width: 100px;
		margin-right: 10px;
	}

	.input-container {
		flex: 1;
		position: relative;
	}

	.placeholder {
		font-style: italic;
		color: gray;
	}

	.placeholder-active {
		font-style: italic;
		color: gray;
	}

	.dropdown-option {
		font-style: normal;
		color: var(--font-color);
	}
</style>
