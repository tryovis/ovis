<script lang="ts">
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import { updateUser, type UserInput } from '../../graphQl/gql-userManagement';
	import { t } from '../../store/languageStore';
	import { userStore } from '../../store/userStore';
	import { applyChartDisplayPreferences } from '../../store/configStore';
	import { resolveChartDisplayPreferences } from '../../store/chartDisplayPreferences';
	import { iconPath } from '$lib/path-utils';

	const top5ActiveIcon = iconPath('star-fill.svg');
	const top5InactiveIcon = iconPath('star.svg');
	const nullValuesVisibleIcon = iconPath('null-on.svg');
	const nullValuesHiddenIcon = iconPath('null-off.svg');

	let currentUser = '';
	let chartShowTop5 = true;
	let chartHideNullValues = true;
	let saving = false;
	let saveFailed = false;

	const unsubscribe = userStore.subscribe((user) => {
		currentUser = user.currentUser;
		({ showTop5: chartShowTop5, hideNullValues: chartHideNullValues } =
			resolveChartDisplayPreferences(user));
	});

	onDestroy(unsubscribe);

	async function savePreferences(input: UserInput) {
		if (!currentUser || saving) return;

		saving = true;
		saveFailed = false;

		try {
			await updateUser(currentUser, input);
			userStore.update((user) => ({ ...user, ...input }));

			const updatedUser = get(userStore);
			localStorage.setItem('loggedInUser', JSON.stringify(updatedUser));

			const preferences = resolveChartDisplayPreferences(updatedUser);
			applyChartDisplayPreferences(preferences);
		} catch (error) {
			saveFailed = true;
			console.error('Failed to update chart display preferences:', error);
		} finally {
			saving = false;
		}
	}
</script>

<fieldset disabled={saving}>
	<legend><b>{$t('chartDisplaySettings')}</b></legend>

	<div class="setting-row">
		<div class="setting-options" role="group" aria-label={$t('chartShowTop5ByDefault')}>
			<label>
				<input
					type="radio"
					name="chartShowTop5"
					checked={chartShowTop5}
					on:change={() => savePreferences({ chartShowTop5: true })}
				/>
				{$t('yes')}
			</label>
			<label>
				<input
					type="radio"
					name="chartShowTop5"
					checked={!chartShowTop5}
					on:change={() => savePreferences({ chartShowTop5: false })}
				/>
				{$t('no')}
			</label>
		</div>
		<div class="setting-description">
			<img
				src={chartShowTop5 ? top5ActiveIcon : top5InactiveIcon}
				alt=""
				aria-hidden="true"
				class="setting-icon"
			/>
			<span>{$t('chartShowTop5ByDefault')}</span>
		</div>
	</div>

	<div class="setting-row">
		<div class="setting-options" role="group" aria-label={$t('chartHideNullValuesByDefault')}>
			<label>
				<input
					type="radio"
					name="chartHideNullValues"
					checked={chartHideNullValues}
					on:change={() => savePreferences({ chartHideNullValues: true })}
				/>
				{$t('yes')}
			</label>
			<label>
				<input
					type="radio"
					name="chartHideNullValues"
					checked={!chartHideNullValues}
					on:change={() => savePreferences({ chartHideNullValues: false })}
				/>
				{$t('no')}
			</label>
		</div>
		<div class="setting-description">
			<img
				src={chartHideNullValues ? nullValuesHiddenIcon : nullValuesVisibleIcon}
				alt=""
				aria-hidden="true"
				class="setting-icon"
			/>
			<span>{$t('chartHideNullValuesByDefault')}</span>
		</div>
	</div>

	<p class="hint">{$t('chartDisplaySettingsHint')}</p>
	{#if saveFailed}
		<p class="error" role="alert">{$t('chartDisplaySettingsSaveError')}</p>
	{/if}
</fieldset>

<style>
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
	}

	legend {
		margin-bottom: 12px;
	}

	.setting-row {
		display: flex;
		align-items: center;
		gap: 16px;
		min-height: 32px;
		margin: 6px 0 6px 100px;
	}

	.setting-description,
	.setting-options {
		display: flex;
		align-items: center;
	}

	.setting-description {
		gap: 10px;
	}

	.setting-options {
		gap: 16px;
		min-width: 112px;
	}

	.setting-icon {
		width: 22px;
		height: 22px;
		flex: 0 0 22px;
	}

	label {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	.hint {
		color: var(--font-color);
		font-size: 0.9rem;
		margin: 12px 0 0;
		opacity: 0.75;
	}

	.error {
		color: #b00020;
		margin-bottom: 0;
	}

	@media (max-width: 700px) {
		.setting-row {
			align-items: flex-start;
			flex-direction: column;
			gap: 8px;
			margin-left: 32px;
			margin-bottom: 14px;
		}

		.setting-description {
			padding-left: 0;
		}
	}
</style>
