<script lang="ts">
    import { userStore } from '../../store/userStore';
    import { updateUser } from '../../graphQl/gql-userManagement';
    import { onMount } from 'svelte';
    import { iconPath } from '$lib/path-utils';

    let currentUser = "";
    let darkMode: boolean;



	onMount(() => {
		userStore.subscribe((value: any) => {
        	({ currentUser, darkMode } = value);
   		 });
	});


    const darkIcon = iconPath('light-mode.svg');
    const lightIcon = iconPath('nightlight.svg');

    function setTheme() {
        // Toggelt den Dark-Mode
        darkMode = !darkMode;
        // Ändert das Klassenattribut des Body-Tags entsprechend dem Dark-Mode
        document.body.classList.toggle('dark-mode', darkMode);
        // Aktualisiert den Dark-Mode im User Store
        userStore.update(store => ({
            ...store,
            darkMode: darkMode
        }));
        // Aktualisiert den Dark-Mode in der Datenbank
        updateUser(currentUser, { darkMode: darkMode });
    }
</script>

<label class="custom-label" for="colorPicker"><b>Theme:</b></label>
<div class="themediv">
    <input type="radio" id="lightTheme" name="theme" on:change={() => setTheme()} checked={!darkMode} />
    Light <img src={darkIcon} class="menuebar-icon" alt="light icon" />
</div>

<div class="themediv">
    <input type="radio" id="darkTheme" name="theme" on:change={() => setTheme()} checked={darkMode} />
    Dark <img src={lightIcon} class="menuebar-icon" alt="dark icon" />
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
