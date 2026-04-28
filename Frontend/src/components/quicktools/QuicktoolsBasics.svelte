<script lang="ts">
	import { onMount } from 'svelte';
	import {
		getQuicktoolsBasicsIcd10,
		getQuicktoolsBasicsHistology
	} from '../../graphQl/gql-quicktools';
	import { t } from '../../store/languageStore';
	import type { LensDataPasser } from '@samply/lens';
	import { reloadOnly } from '../../store/reloadStore';
	import { genderButtons, genderOtherExclusions } from '../../config/quicktools';
	import { iconPath } from '$lib/path-utils';

	let dataPasser: LensDataPasser;

	const maleIcon = iconPath('male.svg');
	const femaleIcon = iconPath('female.svg');
	const maleFemaleIcon = iconPath('male-female.svg');
	const genderButtonConfigs = genderButtons.map((button, index) => ({
		...button,
		icon: index === 0 ? maleIcon : index === 1 ? femaleIcon : maleFemaleIcon,
		className: index === 0 ? 'male-button' : index === 1 ? 'female-button' : 'male-female-button'
	}));
	const genderOtherExclusionSet = new Set(genderOtherExclusions);
	const genderOtherExclusionList = Array.from(genderOtherExclusionSet);
	const makeBindId = (prefix: string, value: string) =>
		`${prefix}-${String(value).replace(/\s+/g, '-').toLowerCase()}`;
	let selectedDiagnose = '';
	let selectedHistologie = '';
	let selectedGeschlecht = '';

	let diagnoseOptions = [];
	let histologieOptions = [];
	let diagnoseError = '';
	let histologieError = '';

	// API-Daten für Diagnose laden
	async function loadDiagnoseOptions() {
		try {
			//console.log("Lade Diagnose-Optionen...");
			const response = await getQuicktoolsBasicsIcd10();
			diagnoseOptions = Array.isArray(response) ? response.filter((option) => option) : []; // Entferne null-Werte
		} catch (error) {
			diagnoseError = 'Fehler beim Laden der Diagnosen: ' + error.message;
			console.error(diagnoseError);
		}
	}

	// API-Daten für Histologie laden
	async function loadHistologieOptions() {
		try {
			//console.log("Lade Histologie-Optionen...");
			const response = await getQuicktoolsBasicsHistology();
			histologieOptions = Array.isArray(response) ? response.filter((option) => option) : []; // Entferne null-Werte
		} catch (error) {
			histologieError = 'Fehler beim Laden der Histologien: ' + error.message;
			console.error(histologieError);
		}
	}

	// Daten laden bei Initialisierung
	onMount(async () => {
		await import('@samply/lens');
		await loadDiagnoseOptions();
		await loadHistologieOptions();
	});

	// Funktion bei Diagnose-Auswahl
	function addDiagnosis(diagnose: string) {
		const code = diagnose.split('→')[0].trim(); // Extrahiere den Teil vor dem Pfeil und trimme Leerzeichen
		console.log(`Diagnose hinzugefügt: ${code}`);
		selectedDiagnose = ''; // Auswahl zurücksetzen

		// Bestimme den Key basierend auf dem Vorhandensein eines Bindestrichs
		const key = code.includes('-') ? 'ICD_ICD10Group' : 'ICD_ICD10_3';

		// Beispiel-Objekt zur weiteren Verarbeitung
		let queryObject = {
			id: 'Random generierte UUID', // UUID kann hier eingefügt werden
			key: key, // Dynamischer Key basierend auf der Bedingung
			name: 'childCategorie.name', // Beispielhafter Name
			system: 'diagnosis',
			type: 'EQUALS',
			values: [
				{
					name: code, // Anzeigename
					value: code, // Wert für Backend
					queryBindId: 'Auch eine random UUID' // Beispielhafter Bind-Id
				}
			]
		};

		dataPasser.addStratifierToQueryAPI({
			label: queryObject.values[0].value,
			catalogueGroupCode: queryObject.key,
			parentGroupCode: queryObject.system
		});
		reloadOnly();
	}

	// Funktion bei Histologie-Auswahl
	function addHistology(histology: string) {
		const code = histology.split('→')[0].trim(); // Extrahiere den Teil vor dem Pfeil und trimme Leerzeichen
		console.log(`Histologie hinzugefügt: ${code}`);
		selectedHistologie = ''; // Auswahl zurücksetzen

		let queryObject = {
			id: 'Random generierte UUID', // UUID kann hier eingefügt werden
			key: 'ICDO_histologyCode', // TODO
			name: 'childCategorie.name', // Beispielhafter Name
			system: 'diagnosis',
			type: 'EQUALS',
			values: [
				{
					name: code, // Anzeigename
					value: code, // Wert für Backend
					queryBindId: 'Auch eine random UUID' // Beispielhafter Bind-Id
				}
			]
		};

		dataPasser.addStratifierToQueryAPI({
			label: queryObject.values[0].value,
			catalogueGroupCode: queryObject.key,
			parentGroupCode: queryObject.system
		});
		reloadOnly();
	}

	// Funktion zur Hinzufügung von Gender
	function addGender(gender: string) {
		const queryObject = {
			id: `gender`,
			key: 'gender',
			name: 'Gender',
			type: 'EQUALS',
			system: 'patient',
			values: [
				{
					name: gender,
					value: gender,
					queryBindId: makeBindId('gender-equals', gender)
				}
			]
		};

		dataPasser.addStratifierToQueryAPI({
			label: queryObject.values[0].value,
			catalogueGroupCode: queryObject.key,
			parentGroupCode: queryObject.system
		});
		console.log(`Added gender: ${gender}`);
		reloadOnly();
	}

	// Funktionen für männlich, weiblich und andere Gender
	function addOtherGender() {
		genderOtherExclusionList.forEach((exclusion) => {
			const value = exclusion;
			const queryObject = {
				id: `gender`,
				key: '!gender',
				name: 'Gender',
				type: 'NEQUALS',
				system: 'patient',
				values: [
					{
						name: value,
						value,
						queryBindId: makeBindId('gender-nequals', value)
					}
				]
			};

			dataPasser.addStratifierToQueryAPI({
				label: queryObject.values[0].value,
				catalogueGroupCode: queryObject.key,
				parentGroupCode: queryObject.system
			});
		});
		reloadOnly();
	}

	function handleGenderButton(button: { label: string; value: string }) {
		if (genderOtherExclusionSet.has(button.value)) {
			addGender(button.value);
		} else {
			addOtherGender();
		}
	}
</script>

<lens-data-passer bind:this={dataPasser} />



<!-- Diagnose Dropdown -->
<div class="dropdown-container">
    <label for="diagnoseDropdown" class="dropdown-label">{$t("diagnosis")}-Code:</label>
    <div class="input-container">
		<select
		id="diagnoseDropdown"
		bind:value={selectedDiagnose}
		class="input-field {selectedDiagnose === '' ? 'placeholder-active' : ''}"
		on:change={() => addDiagnosis(selectedDiagnose)}
	>
		<option value="" disabled selected class="placeholder">{$t("select")} {$t("diagnosisSmall")}</option>
		{#if diagnoseError}
			<option disabled>{diagnoseError}</option>
		{:else if diagnoseOptions.length === 0}
			<option disabled>Keine Daten verfügbar</option>
		{:else}
			{#each diagnoseOptions as option}
				<option value={option} class="dropdown-option">{option}</option>
			{/each}
		{/if}
	</select>


    </div>
</div>

<!-- Histologie Dropdown -->
<div class="dropdown-container">
    <label for="histologieDropdown" class="dropdown-label">{$t("histology")}-Code:</label>
    <div class="input-container">
		<select
		id="histologieDropdown"
		bind:value={selectedHistologie}
		class="input-field {selectedHistologie === '' ? 'placeholder-active' : ''}"
		on:change={() => addHistology(selectedHistologie)}
	>
		<option value="" disabled selected class="placeholder">{$t("select")} {$t("histologySmall")}</option>
		{#if histologieError}
			<option disabled>{histologieError}</option>
		{:else if histologieOptions.length === 0}
			<option disabled>Keine Daten verfügbar</option>
		{:else}
			{#each histologieOptions as option}
				<option value={option} class="dropdown-option">{option}</option>
			{/each}
		{/if}
	</select>


    </div>
</div>

<!-- Gender Buttons -->
<div class="dropdown-container">
    <label class="dropdown-label">{$t("gender")}:</label>
    <div class="gender-buttons">
        {#each genderButtonConfigs as button (button.value)}
            <img
                src={button.icon}
                alt={button.label}
                title={button.label}
                class={`iconRound gender-button ${button.className}`}
                on:click={() => handleGenderButton(button)}
            />
        {/each}
    </div>
</div>

<style>
.input-field {
    font-style: normal;
    color: black;
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
    color: black;
}




    .dropdown-container {
        display: flex;
        align-items: center;

    }

    .dropdown-label {
        text-align: left;
        min-width: 100px;
        margin-right: 10px;
    }

    .input-container {
        flex: 1;
        display: flex;
        align-items: center;
    }

    .gender-buttons {
        display: flex;
        align-items: center;
    }

    .gender-buttons > img {
        margin-left: 0.7em;
        margin-right: 0.5em;
        cursor: pointer;
    }

    .male-button:hover {
        background: lightblue;
    }

    .female-button:hover {
        background: pink;
    }

    .male-female-button:hover {
        background: linear-gradient(
            180deg,
            #ff6b6b 16.66%,
            #ffb266 16.66%,
            33.32%,
            #ffd966 33.32%,
            49.98%,
            #afff6b 49.98%,
            66.64%,
            #6bbfff 66.64%,
            83.3%,
            #b66bff 83.3%
        );
    }
</style>
