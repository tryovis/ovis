<script lang="ts">
	import { t, locale } from '../store/languageStore';
	import { iconPath } from '$lib/path-utils';

	export let ready = false;
	export let showTopSummary = false;
	export let shownCategories = 0;
	export let totalCategories = 0;
	export let missingValuesHidden = false;
	export let missingValueCount = 0;

	const topIcon = iconPath('star-fill.svg');
	const missingIcon = iconPath('null-off.svg');

	$: numberLocale = $locale === 'de' ? 'de-DE' : 'en-US';
	$: numberFormatter = new Intl.NumberFormat(numberLocale);
	$: topText =
		ready && showTopSummary && shownCategories < totalCategories
			? $t('chartStatusTop', {
					shown: numberFormatter.format(shownCategories),
					total: numberFormatter.format(totalCategories)
			  })
			: '';
	$: missingText =
		ready && missingValuesHidden && missingValueCount > 0
			? $t('chartStatusMissingHidden', { count: numberFormatter.format(missingValueCount) })
			: '';
	$: statusText = [topText, missingText].filter(Boolean).join(' · ');
</script>

{#if statusText}
	<div class="chart-status-line" title={statusText} aria-live="polite">
		{#if topText}
			<span class="status-item">
				<span
					class="status-icon"
					style={`--status-icon: url("${topIcon}")`}
					aria-hidden="true"
				></span>
				{topText}
			</span>
		{/if}
		{#if topText && missingText}<span class="separator" aria-hidden="true">·</span>{/if}
		{#if missingText}
			<span class="status-item">
				<span
					class="status-icon"
					style={`--status-icon: url("${missingIcon}")`}
					aria-hidden="true"
				></span>
				{missingText}
			</span>
		{/if}
	</div>
{/if}

<style>
	.chart-status-line {
		box-sizing: border-box;
		display: flex;
		flex: 0 0 auto;
		align-items: center;
		gap: 0.35rem;
		min-height: 1rem;
		padding: 6px 10px 0;
		overflow: hidden;
		color: var(--font-color);
		font-size: 0.72rem;
		font-style: italic;
		line-height: 1rem;
		text-align: left;
		text-overflow: ellipsis;
		white-space: nowrap;
		opacity: 0.5;
	}

	.status-item {
		display: inline-flex;
		align-items: center;
		min-width: 0;
	}

	.status-icon {
		width: 0.78rem;
		height: 0.78rem;
		margin-right: 0.2rem;
		flex: 0 0 auto;
		background-color: currentColor;
		-webkit-mask: var(--status-icon) center / contain no-repeat;
		mask: var(--status-icon) center / contain no-repeat;
	}

	.separator {
		flex: 0 0 auto;
	}
</style>
