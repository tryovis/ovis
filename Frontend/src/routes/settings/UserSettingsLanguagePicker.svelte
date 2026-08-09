<script lang="ts">
	import { t } from '../../store/languageStore';
	import { updateUser } from '../../graphQl/gql-userManagement';
	import { userStore } from '../../store/userStore';
	import { applyUserAppearance, platformConfigStore } from '../../store/platformConfigStore';
	import { iconPath } from '$lib/path-utils';

	type Language = 'de' | 'en';

	const languages: { value: Language; label: string; icon: string }[] = [
		{ value: 'de', label: 'Deutsch', icon: iconPath('de.png') },
		{ value: 'en', label: 'English', icon: iconPath('en.png') }
	];

	let saving = false;

	async function setLanguage(language: Language) {
		if (saving || language === $userStore.currentLanguage) return;
		saving = true;
		try {
			await updateUser($userStore.currentUser, { language });
			applyUserAppearance(
				{
					language,
					colorTheme: $userStore.paletteName,
					colorPalette: $userStore.colorPalette
				},
				$platformConfigStore
			);
		} catch (error) {
			console.error('User language could not be updated:', error);
		} finally {
			saving = false;
		}
	}
</script>

<div class="custom-label"><strong>{$t('language')}:</strong></div>

{#each languages as language}
	<label class="themediv">
		<input
			type="radio"
			name="language"
			value={language.value}
			checked={$userStore.currentLanguage === language.value}
			disabled={saving}
			on:change={() => setLanguage(language.value)}
		/>
		<span>{language.label}</span>
		<img src={language.icon} class="menuebar-icon no-invert" alt={language.label} />
	</label>
{/each}

<style>
	.themediv {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-left: 100px;
		cursor: pointer;
	}

	.themediv input {
		margin: 0;
	}

	img {
		width: 20px;
		height: 20px;
	}
</style>
