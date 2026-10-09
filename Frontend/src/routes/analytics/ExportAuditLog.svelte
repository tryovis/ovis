<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { getExportAudits } from '../../graphQl/gql-export-audit';
	import { t, locale } from '../../store/languageStore';
	import { userStore } from '../../store/userStore';

	type AuditRecord = Awaited<ReturnType<typeof getExportAudits>>['records'][number];
	const pageSize = 50;
	const knownStatuses = new Set([
		'CREATED',
		'PREPARED',
		'SAVED',
		'DOWNLOAD_STARTED',
		'CANCELLED',
		'FAILED'
	]);
	let search = '';
	let appliedSearch = '';
	let offset = 0;
	let total = 0;
	let records: AuditRecord[] = [];
	let loading = true;
	let failed = false;
	let requestVersion = 0;
	let expanded = new Set<string>();
	$: allowed = ['admin', 'super-admin'].includes($userStore.currentRole);

	async function load(nextOffset = offset) {
		if (!allowed) return;
		const version = ++requestVersion;
		offset = nextOffset;
		loading = true;
		failed = false;
		expanded = new Set();
		try {
			const result = await getExportAudits({ search: appliedSearch, offset, limit: pageSize });
			if (version !== requestVersion) return;
			records = result.records;
			total = result.total;
		} catch {
			if (version !== requestVersion) return;
			records = [];
			total = 0;
			failed = true;
		} finally {
			if (version === requestVersion) loading = false;
		}
	}

	function submitSearch() {
		appliedSearch = search.trim();
		void load(0);
	}

	function toggleDetails(id: string) {
		const next = new Set(expanded);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expanded = next;
	}

	function iso(value: number | null | undefined) {
		if (value == null || !Number.isFinite(value)) return '—';
		const date = new Date(value);
		return Number.isFinite(date.getTime()) ? date.toISOString() : '—';
	}

	function dateText(value: number | null | undefined, language: string) {
		return iso(value) === '—'
			? '—'
			: `${new Date(value!).toLocaleString(language === 'de' ? 'de-DE' : 'en-GB', {
					timeZone: 'UTC',
					hour12: false
			  })} UTC`;
	}

	function pretty(value: unknown): string {
		if (value == null || value === '') return '—';
		if (typeof value === 'string') {
			try {
				return JSON.stringify(JSON.parse(value), null, 2);
			} catch {
				return value;
			}
		}
		return JSON.stringify(value, null, 2);
	}

	onMount(() => {
		void load(0);
	});
	onDestroy(() => {
		requestVersion += 1;
	});
</script>

{#if allowed}
	<section
		class="export-audit box_style box_level2"
		aria-labelledby="export-audit-title"
		aria-busy={loading}
	>
		<h2 id="export-audit-title">{$t('exportAuditTitle')}</h2>
		<p class="audit-notice">{$t('exportAuditProvenance')} {$t('exportAuditDeliveryNotice')}</p>
		<form class="audit-controls" on:submit|preventDefault={submitSearch}>
			<label class="search-label" for="export-audit-search">{$t('exportAuditSearch')}</label>
			<input
				id="export-audit-search"
				class="input-field"
				type="search"
				bind:value={search}
				maxlength="200"
			/>
			<button type="submit">{$t('exportAuditSearchButton')}</button>
			<button type="button" disabled={loading} on:click={() => load()}
				>{$t('exportAuditRefresh')}</button
			>
		</form>
		{#if failed}
			<p role="alert">
				{$t('exportAuditLoadError')}
				<button type="button" on:click={() => load()}>{$t('chartRetry')}</button>
			</p>
		{:else if loading}
			<p role="status">{$t('loadingContent')}…</p>
		{:else if !records.length}
			<p role="status">{$t('exportAuditEmpty')}</p>
		{/if}
		<div class="audit-table-scroll">
			<table class="audit-table">
				<thead
					><tr>
						<th scope="col">{$t('exportAuditCreated')}</th>
						<th scope="col">{$t('exportAuditUser')}</th>
						<th scope="col">{$t('exportAuditFile')} / {$t('exportAuditId')}</th>
						<th scope="col">{$t('exportAuditStatus')}</th>
						<th scope="col">{$t('exportAuditSize')}</th>
						<th scope="col">{$t('exportAuditRows')}</th>
						<th scope="col">{$t('exportAuditDetails')}</th>
					</tr></thead
				>
				<tbody>
					{#each records as record (record.id)}
						<tr>
							<td title={iso(record.createdAt)}>{dateText(record.createdAt, $locale)}</td>
							<td
								>{record.userId}<small
									>{record.userRole}{record.anonymousDemo
										? ` · ${$t('exportAuditAnonymous')}`
										: ''}</small
								></td
							>
							<td class="file-cell">{record.fileName}<small>{record.id}</small></td>
							<td
								>{knownStatuses.has(record.status)
									? $t(`exportAuditStatus${record.status}`)
									: record.status}</td
							>
							<td>{record.sizeBytes == null ? '—' : record.sizeBytes.toLocaleString($locale)}</td>
							<td>{record.rowCount == null ? '—' : record.rowCount.toLocaleString($locale)}</td>
							<td
								><button
									type="button"
									aria-expanded={expanded.has(record.id)}
									aria-controls={`audit-details-${record.id}`}
									on:click={() => toggleDetails(record.id)}>{$t('exportAuditDetails')}</button
								></td
							>
						</tr>
						{#if expanded.has(record.id)}
							<tr id={`audit-details-${record.id}`}
								><td colspan="7">
									<div class="audit-details box_style box_level3">
										<dl>
											<dt>{$t('exportAuditPrepared')}</dt>
											<dd title={iso(record.preparedAt)}>{dateText(record.preparedAt, $locale)}</dd>
											<dt>{$t('exportAuditCompleted')}</dt>
											<dd title={iso(record.completedAt)}>
												{dateText(record.completedAt, $locale)}
											</dd>
											<dt>{$t('exportAuditHash')}</dt>
											<dd class="hash">{record.sha256 || '—'}</dd>
										</dl>
										<div class="specifications">
											<div>
												<h3>{$t('exportAuditSpecification')}</h3>
												<pre>{pretty({
														kind: record.kind,
														format: record.format,
														route: record.route,
														title: record.title,
														filterActive: record.filterActive,
														policyVersion: record.policyVersion,
														appVersion: record.appVersion,
														metadataSource: record.metadataSource
													})}</pre>
											</div>
											<div>
												<h3>{$t('exportAuditFilter')}</h3>
												<pre>{pretty(record.filter)}</pre>
											</div>
											<div>
												<h3>{$t('exportAuditMandatoryFilter')}</h3>
												<pre>{pretty(record.mandatoryFilter)}</pre>
											</div>
											<div>
												<h3>{$t('exportAuditEffectiveFilter')}</h3>
												<pre>{pretty(record.effectiveFilter)}</pre>
											</div>
											<div>
												<h3>{$t('exportAuditSelection')}</h3>
												<pre>{pretty(record.selection)}</pre>
											</div>
										</div>
									</div>
								</td></tr
							>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
		<div class="audit-pagination">
			<span aria-live="polite"
				>{$t('exportAuditPage', {
					from: total ? offset + 1 : 0,
					to: Math.min(offset + records.length, total),
					total
				})}</span
			>
			<button
				type="button"
				disabled={loading || offset === 0}
				on:click={() => load(Math.max(0, offset - pageSize))}>{$t('exportAuditPrevious')}</button
			>
			<button
				type="button"
				disabled={loading || offset + pageSize >= total}
				on:click={() => load(offset + pageSize)}>{$t('exportAuditNext')}</button
			>
		</div>
	</section>
{:else}
	<p role="alert">{$t('exportAuditAccessDenied')}</p>
{/if}

<style>
	.export-audit {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		box-sizing: border-box;
		padding: 12px;
		gap: 10px;
	}
	h2 {
		margin: 0;
		font-size: 1rem;
	}
	h3 {
		margin: 0 0 6px;
		font-size: 0.85rem;
	}
	.audit-notice {
		margin: 0;
		color: var(--muted-font-color);
		line-height: 1.4;
	}
	.audit-controls,
	.audit-pagination {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.search-label {
		flex-basis: 100%;
	}
	.audit-controls input {
		flex: 1;
		min-width: 160px;
	}
	.audit-table-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	.audit-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}
	th,
	td {
		padding: 8px;
		text-align: left;
		vertical-align: top;
		border-bottom: 1px solid var(--border-color);
	}
	th {
		position: sticky;
		top: 0;
		background: var(--level2-bg);
		z-index: 1;
	}
	td {
		overflow-wrap: anywhere;
	}
	.file-cell {
		min-width: 160px;
	}
	small {
		display: block;
		margin-top: 4px;
		color: var(--muted-font-color);
	}
	.audit-details {
		padding: 12px;
	}
	dl {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: 6px 12px;
		margin-top: 0;
	}
	dd {
		margin: 0;
	}
	.hash {
		font-family: monospace;
		overflow-wrap: anywhere;
	}
	.specifications {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
		gap: 12px;
	}
	pre {
		margin: 0;
		max-height: 250px;
		overflow: auto;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.audit-pagination > span {
		margin-right: auto;
	}
	button {
		padding: 5px 9px;
	}
</style>
