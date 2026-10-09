<script lang="ts">
	import { onDestroy } from 'svelte';
	import { t } from '../../store/languageStore';
	import { showToast } from '../../store/toastStore';
	import { iconPath } from '$lib/path-utils';
	import { createViewportTooltipStyle } from '$lib/tooltip-popover';
	import type { Field } from './model';

	export let id: string;
	export let tableLabel: string;
	export let parentLabel: string;
	export let dateField: Field | undefined = undefined;
	export let selectionUnavailableHint = '';

	let trigger: HTMLButtonElement;
	let content: HTMLDivElement;
	let body: HTMLDivElement;
	let hideTimer: ReturnType<typeof setTimeout> | undefined;

	$: title = $t('exportConnectionFor', { table: tableLabel });

	function cancelHide() {
		clearTimeout(hideTimer);
	}

	function showInfo() {
		cancelHide();
		const rect = trigger.getBoundingClientRect();
		const opensAbove = rect.top + rect.height / 2 > window.innerHeight / 2;
		const availableHeight = opensAbove ? rect.top - 16 : window.innerHeight - rect.bottom - 16;
		content.style.cssText =
			createViewportTooltipStyle(rect, window.innerWidth, window.innerHeight) +
			`max-height:${Math.max(0, availableHeight)}px;`;
		if (!content.matches(':popover-open')) content.showPopover();
		const bounds = content.getBoundingClientRect();
		if (bounds.left < 12) {
			content.style.left = '12px';
			content.style.right = 'auto';
		} else if (bounds.right > window.innerWidth - 12) {
			content.style.left = 'auto';
			content.style.right = '12px';
		}
	}

	function hideInfo() {
		cancelHide();
		if (content?.matches(':popover-open')) content.hidePopover();
	}

	function scheduleHide() {
		cancelHide();
		hideTimer = setTimeout(() => {
			if (
				!trigger.matches(':hover') &&
				!content.matches(':hover') &&
				document.activeElement !== trigger &&
				!content.contains(document.activeElement)
			)
				hideInfo();
		}, 200);
	}

	async function copyInfo() {
		showInfo();
		try {
			await navigator.clipboard.writeText(`${title}\n\n${body.innerText}`);
			showToast($t('infoCopied'));
		} catch {
			showToast($t('infoCopyError'));
		}
	}

	onDestroy(cancelHide);
</script>

<svelte:window
	on:resize={hideInfo}
	on:keydown={(event) => {
		if (event.key === 'Escape') hideInfo();
	}}
/>

<div class="tooltip connection-info">
	<button
		type="button"
		class="iconRoundButton"
		aria-label={title}
		aria-describedby={id}
		bind:this={trigger}
		on:mouseenter={showInfo}
		on:mouseleave={scheduleHide}
		on:focus={showInfo}
		on:blur={scheduleHide}
		on:click={copyInfo}
	>
		<img src={iconPath('info-outlined.svg')} class="iconRound" alt="" aria-hidden="true" />
	</button>
	<div
		{id}
		class="tooltiptext connection-info-content"
		role="tooltip"
		popover="auto"
		bind:this={content}
		on:mouseenter={cancelHide}
		on:mouseleave={scheduleHide}
		on:focusin={cancelHide}
		on:focusout={scheduleHide}
	>
		<p><b>{title}</b></p>
		<hr />
		<div class="connection-info-body" bind:this={body}>
			<p><b>{$t('exportJoinRecommendation')}</b></p>
			<p>
				<b>{$t('exportLeftJoin')}</b><br />{$t('exportOptionalExplanation', { table: tableLabel })}
			</p>
			<p>
				<b>{$t('exportInnerJoin')}</b><br />{$t('exportRequiredExplanation', { table: tableLabel })}
			</p>
			<p>{$t('exportJoinExample', { parent: parentLabel, table: tableLabel })}</p>
			<p>{$t('exportJoinAllMatches')}</p>
			<p><b>{$t('exportEntrySelection')}</b><br />{$t('exportSelectionAllExplanation')}</p>
			{#if dateField}
				<p>
					{$t('exportSelectionDateExplanation', {
						field: `${$t(dateField.label)} (${dateField.id})`
					})}
				</p>
				<p>{$t('exportSelectionGrouping', { parent: parentLabel })}</p>
				<p>{$t('exportSelectionDateRules')}</p>
			{/if}
			{#if selectionUnavailableHint}<p>{selectionUnavailableHint}</p>{/if}
			<p>{$t('exportJoinScope')}</p>
		</div>
		<hr />
		<p><i>{$t('infoButton')}</i></p>
	</div>
</div>

<style>
	.connection-info {
		display: inline-flex;
		align-items: center;
		flex: 0 0 auto;
	}
	.connection-info-content[popover]:not(:popover-open) {
		display: none;
	}
	.connection-info-body {
		text-align: left;
	}
</style>
