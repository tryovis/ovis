<script lang="ts">
	import { datePickerStore } from '../../store/datePickerStore';
	import { t } from "../../store/languageStore";
	interface Option {
		anzeigename: string;
		collection: string;
		feldwert: string;
	}

	const options: Option[] = [
		{ anzeigename: "diagnosisDateLong", collection: "diagnosis", feldwert: "diagnosisDate" },
		{ anzeigename: "therapyDateLong", collection: "therapy", feldwert: "therapyOccurrenceDate" },
		{ anzeigename: "progressDateLong", collection: "progress", feldwert: "progressOccurrenceDate" },
		{ anzeigename: "tumorBoardDateLong", collection: "tumorBoard", feldwert: "tumorBoardOccurrenceDate" },
		{ anzeigename: "consultationDateLong", collection: "consultation", feldwert: "consultationOccurrenceDate" }
	];

	function addSelectedOption(select: HTMLSelectElement) {
		const selected = options.find((option) => option.feldwert === select.value);
		if (!selected) return;
		datePickerStore.set({
			show: true,
			selectedDate: new Date().toLocaleDateString('de-DE'),
			collection: selected.collection,
			typeOfDate: selected.feldwert,
			fieldLabel: $t(selected.anzeigename)
		});
		select.value = '';
	}
</script>

<div class="dropdown-container">
	<label for="optionDropdown" class="dropdown-label">{$t("date")}:</label>
	<div class="input-container">
		<select 
			id="optionDropdown" 
			class="input-field placeholder-active"
			on:change={(event) => addSelectedOption(event.currentTarget)}>
			<option value="" disabled selected class="placeholder">{$t("select")} {$t("dateSmall")}</option>
			{#each options as option}
				<option value={option.feldwert} class="dropdown-option">{$t(option.anzeigename)}</option>
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

	@container ovis-layout (max-width: 1800px) {
		.dropdown-container,
		.input-container,
		.input-field {
			min-width: 0;
		}

		.dropdown-label {
			min-width: 92px;
			margin-right: 8px;
		}
	}

	@container ovis-layout (max-width: 1650px) {
		.dropdown-label {
			min-width: 82px;
			margin-right: 6px;
			font-size: 12px;
		}

		.input-field {
			width: 100%;
		}
	}

	.placeholder {
		font-style: italic;
		color: var(--muted-font-color);
	}

	.placeholder-active {
		font-style: italic;
		color: var(--muted-font-color);
	}

	.dropdown-option {
		font-style: normal;
		color: var(--font-color);
	}
</style>
