<script lang="ts">
	import AnalyticsDashboard from './AnalyticsDashboard.svelte';
	import ExportAuditLog from './ExportAuditLog.svelte';
	import { userStore } from '../../store/userStore';
	import { t } from '../../store/languageStore';
	let activeView: 'usage' | 'exports' = 'usage';
	$: canReadAudit = ['admin', 'super-admin'].includes($userStore.currentRole);
	$: if (!canReadAudit) activeView = 'usage';
</script>

{#if $userStore.currentRole !== 'user'}
	<div class="analytics-page">
		{#if canReadAudit}
			<div class="analytics-tabs box_style box_level2" role="group" aria-label={$t('analytics')}>
				<button
					type="button"
					class:current_selection={activeView === 'usage'}
					aria-pressed={activeView === 'usage'}
					on:click={() => (activeView = 'usage')}>{$t('exportAuditUsageTab')}</button
				>
				<button
					type="button"
					class:current_selection={activeView === 'exports'}
					aria-pressed={activeView === 'exports'}
					on:click={() => (activeView = 'exports')}>{$t('exportAuditTitle')}</button
				>
			</div>
		{/if}
		<div class="analytics-content">
			{#if activeView === 'exports' && canReadAudit}<ExportAuditLog />{:else}<AnalyticsDashboard
				/>{/if}
		</div>
	</div>
{:else}
	As a normal "user" you do not have permission to enter this page.
{/if}

<style>
	.analytics-page {
		height: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.analytics-tabs {
		display: flex;
		gap: 8px;
		padding: 8px;
		flex-wrap: wrap;
	}
	.analytics-tabs button {
		padding: 6px 12px;
	}
	.analytics-content {
		flex: 1;
		min-height: 0;
	}
</style>
