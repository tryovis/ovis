<script lang="ts">
	import { t } from '../../store/languageStore';
	import { updateUser } from '../../graphQl/gql-userManagement';
	import { userStore } from '../../store/userStore';
	import { applyUserAppearance, platformConfigStore } from '../../store/platformConfigStore';
	import { colorArrays } from '../../components/ColorArray.js';

	type Palette = { name: string; colors: string[] };

	let savingPalette = '';

	function buildAvailablePalettes(): Palette[] {
		const palettes: Palette[] = colorArrays.map(({ name, colors }) => ({
			name,
			colors: [...colors]
		}));
		const addPalette = (name: string, colors: string[]) => {
			if (name && colors?.length >= 2 && !palettes.some((palette) => palette.name === name)) {
				palettes.push({ name, colors: [...colors] });
			}
		};

		addPalette($platformConfigStore.colorTheme, $platformConfigStore.colorPalette);
		addPalette($userStore.paletteName, $userStore.colorPalette);
		return palettes;
	}

	$: availablePalettes = buildAvailablePalettes();

	async function setColorArray(colors: string[], name: string) {
		if (savingPalette || name === $userStore.paletteName) return;
		savingPalette = name;
		try {
			await updateUser($userStore.currentUser, { colorTheme: name, colorPalette: colors });
			applyUserAppearance(
				{
					language: $userStore.currentLanguage,
					colorTheme: name,
					colorPalette: colors
				},
				$platformConfigStore
			);
		} catch (error) {
			console.error('User color scheme could not be updated:', error);
		} finally {
			savingPalette = '';
		}
	}
</script>

<div class="labeldiv">
	<strong>{$t('userColorTheme')}:</strong>
</div>

{#each availablePalettes as { name, colors }, index (name)}
	<label class:selected={$userStore.paletteName === name} class="themediv">
		<input
			type="radio"
			id={`user-palette-${index}`}
			name="user-color-theme"
			checked={$userStore.paletteName === name}
			disabled={savingPalette !== ''}
			on:change={() => setColorArray(colors, name)}
		/>
		<span class="swatches" aria-label={name}>
			{#each colors as color}
				<span style:background-color={color} class="color-point" />
			{/each}
		</span>
		<strong>{name}</strong>
	</label>
{/each}

<style>
	.labeldiv,
	.themediv,
	.swatches {
		display: flex;
		align-items: center;
	}

	.themediv {
		gap: 10px;
		min-height: 32px;
		margin-left: 100px;
		cursor: pointer;
	}

	.themediv.selected {
		color: var(--link-color, #017c40);
	}

	.themediv input {
		margin: 0;
	}

	.swatches {
		width: min(360px, 55vw);
	}

	.color-point {
		min-width: 8px;
		height: 22px;
		border: 1px solid rgba(0, 0, 0, 0.2);
		flex: 1 1 0;
	}
</style>
