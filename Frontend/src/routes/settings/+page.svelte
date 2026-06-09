<script lang="ts">
	import UserSettingsColorPicker from './UserSettingsColorPicker.svelte';
	import UserSettingsThemePicker from './UserSettingsThemePicker.svelte';
	import UserSettingsLanguagePicker from './UserSettingsLanguagePicker.svelte';
	import UserSettingsFilterDisplay from './UserSettingsFilterDisplay.svelte';
	import { t, locale, locales } from '../../store/languageStore';
	import { iconPath } from '$lib/path-utils';

	const settingsIcon = iconPath('user-icon.svg');
	const backIcon = iconPath('back.svg');
	function goBack() {
		window.history.back(); // Go back to the last visited page
	}
</script>

<div class="box_style box_level2 table-chart">
	<h1 style="padding-left:10px">
		{$t('userSettings')}
		<img
			src={settingsIcon}
			alt="info"
			style="height:40px;vertical-align: text-bottom;"
			class="menuebar-icon"
		/>
		<button on:click={goBack} class="iconRoundButton"
			><img src={backIcon} alt="back" class="iconRound" /></button
		>
	</h1>
</div>

<div class="box_style box_level2">
	<UserSettingsColorPicker />
</div>

<div class="box_style box_level2 table-chart">
	<UserSettingsThemePicker />
</div>

<div class="box_style box_level2 table-chart">
	<UserSettingsLanguagePicker />
</div>

<div class="box_style box_level2 table-chart">
	<UserSettingsFilterDisplay />
</div>

<style>
	.custom-label {
		width: 100px;
		display: inline-block; /* Hinzugefügte Zeile, um die Breite zu berücksichtigen */
	}
</style>
