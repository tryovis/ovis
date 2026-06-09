<script lang="ts">
	import { t, locale, locales } from "../../store/languageStore";
    import { updateUser } from '../../graphQl/gql-userManagement';
	import { userStore } from '../../store/userStore';
	import { iconPath } from '$lib/path-utils';

	let currentUser="";

	userStore.subscribe((value: any) => {
		({  currentUser } = value);
	});

    const enIcon = iconPath('en.png');
    const deIcon = iconPath('de.png');

    // Funktion, um Benutzer zu aktualisieren
    function updateUserData(language) {
        const input = { language }; // Das zu aktualisierende Feld und der neue Wert
        // Annahme: currentUser ist bereits definiert
        updateUser(currentUser, input)
            .then(response => {
                // Erfolgreich aktualisiert
                console.log("Benutzer aktualisiert:", response);
            })
            .catch(error => {
                // Fehler beim Aktualisieren des Benutzers
                console.error("Fehler beim Aktualisieren des Benutzers:", error);
            });
    }
</script>

<label class="custom-label" for="colorPicker"><b>{$t("language")}:</b></label>

<div class="themediv">
    <input type="radio" id="german" name="language" bind:group={$locale} value="de" on:change={() => updateUserData('de')} />
    Deutsch <img src={deIcon} class="menuebar-icon no-invert" alt="de-icon" />
</div>

<div class="themediv">
    <input type="radio" id="english" name="language" bind:group={$locale} value="en" on:change={() => updateUserData('en')} />
    Englisch <img src={enIcon} class="menuebar-icon no-invert" alt="en-icon" />
</div>

<style>
    .themediv {
        display: flex;
        align-items: center;
        margin-left: 100px;
    }

    .themediv input {
        margin-right: 10px;
    }

    img {
        width: 20px;
        height: 20px;
        margin-right: 10px; /* Abstand zwischen Bild und Text */
        margin-left: 10px;
    }
</style>
