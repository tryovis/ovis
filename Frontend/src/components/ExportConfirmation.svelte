<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { t } from '../store/languageStore';
	import {
		exportConfirmation,
		resolveExportConfirmation,
		type PendingExportConfirmation
	} from '../store/exportConfirmation';

	let dialog: HTMLDialogElement;
	let mounted = false;
	let shownId: number | null = null;

	function syncDialog(request: PendingExportConfirmation | null) {
		if (request) {
			shownId = request.id;
			if (!dialog.open) dialog.showModal();
		} else {
			shownId = null;
			if (dialog.open) dialog.close();
		}
	}

	function decide(accepted: boolean) {
		if (shownId !== null) {
			resolveExportConfirmation(shownId, accepted);
		}
	}

	$: if (mounted) syncDialog($exportConfirmation);
	onMount(() => {
		mounted = true;
	});
	onDestroy(() => {
		if (shownId !== null) resolveExportConfirmation(shownId, false);
	});
</script>

<dialog
	class="export-confirmation box_style box_level4"
	bind:this={dialog}
	aria-labelledby="export-confirmation-title"
	aria-describedby="export-confirmation-policy export-confirmation-audit"
	on:cancel={(event) => {
		event.preventDefault();
		decide(false);
	}}
	on:close={() => {
		if (!dialog.open) decide(false);
	}}
>
	<h2 id="export-confirmation-title">{$t('exportConfirmationTitle')}</h2>
	{#if $exportConfirmation}
		<p class="export-context">
			<strong>{$exportConfirmation.title}</strong>
			<br />{$exportConfirmation.fileName}
		</p>
	{/if}
	<p id="export-confirmation-policy">{@html $t('exportConfirmationPolicy')}</p>
	<p id="export-confirmation-audit">
		{@html $t('exportConfirmationAuditNotice')}
	</p>
	<p>{$t('exportAuditLoginRequired')}</p>
	<div class="actions">
		<button type="button" on:click={() => decide(false)}>{$t('cancel')}</button>
		<button type="button" on:click={() => decide(true)}>{$t('exportConfirmationConfirm')}</button>
	</div>
</dialog>

<style>
	.export-confirmation {
		box-sizing: border-box;
		width: min(700px, calc(100vw - 40px));
		max-height: calc(100dvh - 40px);
		margin: auto;
		padding: 20px;
		overflow-y: auto;
		color: var(--font-color);
		text-align: center;
		border: 1px solid var(--border-color);
		border-radius: 5px;
		background-color: var(--level4-bg);
		box-shadow: 0 0 10px rgb(0 0 0 / 10%);
	}
	.export-confirmation::backdrop {
		background: rgb(0 0 0 / 50%);
	}
	.export-context {
		overflow-wrap: anywhere;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 10px;
	}
	button {
		margin-top: 10px;
	}
</style>
