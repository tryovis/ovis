<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import type { LensDataPasser } from '@samply/lens';
	import Headline from '../../components/Headline.svelte';
	import { addUserFilter } from '../../components/UserFilter';
	import { filterActiveStore } from '../../store/filterActiveStore';
	import { userStore } from '../../store/userStore';
	import { variantStore } from '../../store/variantStore';
	import { t, locale } from '../../store/languageStore';
	import { navConfig } from '../../config/navigation';
	import { iconPath } from '$lib/path-utils';
	import { saveTableCsv } from '$lib/table-download';
	import { ExportAuditError } from '$lib/export-workflow';
	import { createViewportTooltipStyle, showViewportTooltip } from '$lib/tooltip-popover';
	import { loadExportData, loadExportFields } from '$lib/export-builder/data';
	import {
		mergeExportFields,
		exportFieldLabel,
		type MongoExportField
	} from '$lib/export-builder/fields';
	import { ExportError } from '$lib/export-builder/errors';
	import ConnectionInfo from '$lib/export-builder/ConnectionInfo.svelte';
	import { getAvailableExportDatasets } from '$lib/export-builder/availability';
	import { showToast } from '../../store/toastStore';
	import {
		datasets,
		relations,
		buildTablePlan,
		buildPreview,
		getRowSelectionAvailability,
		columnKey,
		type RowSelection,
		type ColumnSelection,
		type TableSelection,
		type Dataset,
		type Field,
		type DataRows
	} from '$lib/export-builder/model';

	let catalog = datasets;
	let datasetById = new Map(catalog.map((dataset) => [dataset.id, dataset]));
	let discoveredFields: Record<string, MongoExportField[]> = {};
	let discoveredScope = '';
	const icons: Record<string, string> = {
		patient: 'patient-cohort.png',
		diagnosis: 'diagnosis.png',
		therapy: 'physiotherapy.png',
		radiation: 'radiotherapy.svg',
		histology: 'histology.svg',
		tnm: 'tnm.svg',
		progress: 'progress.png',
		metastasis: 'metastasis.png',
		tumorBoard: 'tumorboard.png',
		consultation: 'consultation.png',
		status: 'status.png',
		molecularMarker: 'dna.png',
		bioMaterial: 'bioMaterial.png',
		studyPatient: 'study.png',
		supplementary: 'plus.png',
		diagnostic: 'x-ray.png',
		study: 'study.png',
		kaplanMeier: 'km-kurve.png',
		followUp: 'km-kurve.png'
	};
	const initialTables = ['patient', 'diagnosis'];
	let availableDatasets = getAvailableExportDatasets(navConfig, $variantStore.isCCP, catalog);
	let availableDatasetIds = new Set(availableDatasets.map((dataset) => dataset.id));
	let appliedAvailability = [...availableDatasetIds].join('|');
	const initialSelection = defaultTables(availableDatasets);
	let base = initialSelection[0] ?? '';
	let selectedTables = [...initialSelection];
	let joins: Record<string, 'left' | 'inner'> = {};
	let rowSelections: Record<string, RowSelection> = {};
	let activeTable = base;
	let exporting = false;
	let exportError = '';
	let columnSelections: ColumnSelection[] = defaultColumns(initialSelection);
	let plan: TableSelection[] = [];
	let dataPasser: LensDataPasser;
	let sourceData: DataRows = {};
	let loadedExportFilter: string | null = null;
	let loadedFilterActive = true;
	let loading = true;
	let loadingRows = 0;
	let dataError: ExportError | null = null;
	let mounted = false;
	let destroyed = false;
	let requestedKey = '';
	let requestVersion = 0;
	let controller: AbortController | undefined;
	let filterAst = JSON.stringify({ operand: 'OR', children: [] });
	let exportInfoTrigger: HTMLDivElement;
	let exportInfoContent: HTMLDivElement;
	let infoHideTimer: ReturnType<typeof setTimeout> | undefined;
	let resetTooltip: HTMLSpanElement;
	let draggedColumn = '';
	let dropTarget = '';
	let dropAfter = false;

	function hideResetTooltip() {
		if (resetTooltip?.matches(':popover-open')) resetTooltip.hidePopover();
	}

	function showExportInfo() {
		clearTimeout(infoHideTimer);
		const rect = exportInfoTrigger.getBoundingClientRect();
		const opensAbove = rect.top + rect.height / 2 > window.innerHeight / 2;
		const availableHeight = opensAbove ? rect.top - 16 : window.innerHeight - rect.bottom - 16;
		exportInfoContent.style.cssText =
			createViewportTooltipStyle(rect, window.innerWidth, window.innerHeight) +
			`max-height:${Math.max(0, availableHeight)}px;`;
		if (!exportInfoContent.matches(':popover-open')) exportInfoContent.showPopover();
	}

	function hideExportInfo() {
		clearTimeout(infoHideTimer);
		if (exportInfoContent?.matches(':popover-open')) exportInfoContent.hidePopover();
	}

	async function copyExportInfo() {
		showExportInfo();
		const body = exportInfoContent.querySelector<HTMLElement>('.export-info-body');
		try {
			await navigator.clipboard.writeText(`${$t('exportInfoTitle')}\n\n${body?.innerText ?? ''}`);
			showToast($t('infoCopied'));
		} catch {
			showToast($t('infoCopyError'));
		}
	}

	function scheduleInfoHide() {
		clearTimeout(infoHideTimer);
		infoHideTimer = setTimeout(() => {
			if (
				!exportInfoTrigger.matches(':hover') &&
				!exportInfoContent.matches(':hover') &&
				!exportInfoTrigger.contains(document.activeElement)
			)
				hideExportInfo();
		}, 200);
	}

	onMount(() => {
		void import('@samply/lens')
			.then(() => {
				if (destroyed) return;
				filterAst = JSON.stringify(dataPasser.getAstAPI());
				mounted = true;
			})
			.catch(() => {
				if (destroyed) return;
				loading = false;
				dataError = new ExportError('exportErrorSelection');
			});
	});
	onDestroy(() => {
		destroyed = true;
		clearTimeout(infoHideTimer);
		requestVersion += 1;
		controller?.abort();
	});

	async function loadData(ids: string[], key: string, filterActive: boolean) {
		if (!mounted || destroyed) return;
		requestedKey = key;
		const version = ++requestVersion;
		controller?.abort();
		const requestController = new AbortController();
		controller = requestController;
		loading = true;
		loadingRows = 0;
		dataError = null;
		exportError = '';
		sourceData = {};
		if (!ids.length) {
			loading = false;
			return;
		}
		try {
			const scope = dataScope;
			if (scope !== discoveredScope) {
				discoveredFields = {};
				catalog = mergeExportFields(datasets, {});
				datasetById = new Map(catalog.map((dataset) => [dataset.id, dataset]));
				columnSelections = columnSelections.filter((column) =>
					datasetById.get(column.dataset)?.fields.some((field) => field.id === column.field)
				);
			}
			const knownFields = scope === discoveredScope ? discoveredFields : {};
			const fields = await loadExportFields(
				ids.filter((id) => !Object.hasOwn(knownFields, id)),
				{
					signal: requestController.signal
				}
			);
			if (version !== requestVersion || destroyed) return;
			const nextFields = { ...knownFields, ...fields };
			const nextCatalog = mergeExportFields(datasets, nextFields);
			const nextById = new Map(nextCatalog.map((dataset) => [dataset.id, dataset]));
			columnSelections = columnSelections.filter((column) =>
				nextById.get(column.dataset)?.fields.some((field) => field.id === column.field)
			);
			discoveredFields = nextFields;
			discoveredScope = scope;
			catalog = nextCatalog;
			datasetById = nextById;
			const filter = JSON.stringify(
				await addUserFilter(filterActive ? JSON.parse(filterAst) : { operand: 'OR', children: [] })
			);
			if (version !== requestVersion || destroyed) return;
			const data = await loadExportData(ids, filter, {
				signal: requestController.signal,
				onProgress: (progress) => {
					if (version === requestVersion && !destroyed) loadingRows = progress.loadedRows;
				}
			});
			if (version === requestVersion && !destroyed) {
				sourceData = data;
				loadedExportFilter = filter;
				loadedFilterActive = filterActive;
			}
		} catch (error) {
			if (version === requestVersion && !destroyed) {
				dataError = exportFailure(error, 'exportErrorLoad');
			}
		} finally {
			if (version === requestVersion && !destroyed) loading = false;
		}
	}

	function exportFailure(error: unknown, fallback: string): ExportError {
		return error instanceof ExportError ? error : new ExportError(fallback);
	}

	function previewFor(
		plan: TableSelection[],
		columns: ColumnSelection[],
		data: DataRows,
		catalog: Dataset[]
	) {
		try {
			return { ...buildPreview(plan, columns, data, catalog), error: null };
		} catch (error) {
			return {
				rows: [],
				baseCount: 0,
				matchedBaseCount: 0,
				expanded: false,
				error: exportFailure(error, 'exportErrorJoin')
			};
		}
	}

	function datasetFor(id: string): Dataset {
		return datasetById.get(id)!;
	}

	function defaultTables(available: Dataset[]): string[] {
		const allowed = new Set(available.map((dataset) => dataset.id));
		const preferred = initialTables.filter((id) => allowed.has(id));
		return preferred.length ? preferred : available.length ? [available[0].id] : [];
	}

	function applyAvailability(available: Dataset[]) {
		const allowed = new Set(available.map((dataset) => dataset.id));
		const tables = selectedTables.filter((id) => allowed.has(id));
		const fallback = !tables.length && selectedTables.length ? defaultTables(available) : [];
		columnSelections = columnSelections.filter((column) => allowed.has(column.dataset));
		if (fallback.length) columnSelections = defaultColumns(fallback);
		selectedTables = tables.length ? tables : fallback;
		if (!selectedTables.includes(activeTable)) activeTable = selectedTables[0] ?? '';
		sourceData = {};
	}

	function defaultColumns(ids: string[]): ColumnSelection[] {
		const selected: ColumnSelection[] = [];
		for (const id of ids) {
			const dataset = datasetFor(id);
			const defaults = dataset.fields.filter((field) => field.default);
			for (const field of defaults.length ? defaults : dataset.fields.slice(0, 2)) {
				const alias = selected.some((column) => column.alias === field.id)
					? `${id}_${field.id}`
					: field.id;
				selected.push({ dataset: id, field: field.id, alias });
			}
		}
		return selected;
	}

	$: availableDatasets = getAvailableExportDatasets(navConfig, $variantStore.isCCP, catalog);
	$: availableDatasetIds = new Set(availableDatasets.map((dataset) => dataset.id));
	$: availabilityKey = [...availableDatasetIds].join('|');
	$: if (availabilityKey !== appliedAvailability) {
		appliedAvailability = availabilityKey;
		applyAvailability(availableDatasets);
	}
	$: automaticBase =
		availableDatasets.find((dataset) => selectedTables.includes(dataset.id))?.id ?? '';
	$: if (base !== automaticBase) {
		base = automaticBase;
		const edges = new Set(
			(base ? buildTablePlan(base, selectedTables) : [])
				.filter((table) => table.parent)
				.map((table) => `${table.parent}:${table.dataset}`)
		);
		joins = Object.fromEntries(Object.entries(joins).filter(([key]) => edges.has(key)));
		rowSelections = Object.fromEntries(
			Object.entries(rowSelections).filter(([key]) => edges.has(key))
		);
		if (!selectedTables.includes(activeTable)) activeTable = base;
	}
	$: plan = (base ? buildTablePlan(base, selectedTables) : []).map((table) => ({
		...table,
		join: joins[`${table.parent}:${table.dataset}`] ?? 'left',
		selection: table.parent ? rowSelections[`${table.parent}:${table.dataset}`] ?? 'all' : 'all'
	}));
	$: rowSelectionAvailability = new Map(
		plan
			.filter((table) => table.parent)
			.map((table) => [table.dataset, getRowSelectionAvailability(table, sourceData)])
	);
	$: if (mounted && !loading && !dataError) reconcileRowSelections(plan, rowSelectionAvailability);
	// Disabled tables may be necessary join bridges, but never offer fields for selection.
	$: visiblePlan = plan.filter((table) => availableDatasetIds.has(table.dataset));
	$: includedTables = new Set(plan.map((table) => table.dataset));
	$: tableIds = plan.map((table) => table.dataset).sort();
	$: dataScope = JSON.stringify([
		$userStore.currentUser,
		$userStore.currentRole,
		$userStore.pseudonymization,
		$userStore.currentFilter
	]);
	$: dataKey = JSON.stringify([
		tableIds,
		availabilityKey,
		$filterActiveStore.filterActive,
		dataScope,
		filterAst
	]);
	$: if (mounted && dataKey !== requestedKey) {
		void loadData(tableIds, dataKey, $filterActiveStore.filterActive);
	}
	$: selectedFieldKeys = new Set(
		columnSelections.map((column) => columnKey(column.dataset, column.field))
	);
	$: selectedCounts = Object.fromEntries(
		catalog.map((dataset) => [
			dataset.id,
			columnSelections.filter((column) => column.dataset === dataset.id).length
		])
	);
	$: result = previewFor(plan, columnSelections, sourceData, catalog);
	$: headers = columnSelections.map(
		(column) => column.alias.trim() || columnKey(column.dataset, column.field)
	);
	$: duplicateNames = headers.filter(
		(name, index) =>
			headers.findIndex((other) => other.toLocaleLowerCase() === name.toLocaleLowerCase()) !== index
	);
	$: exportRows = result.rows.map((row) =>
		Object.fromEntries(
			columnSelections.map((column) => {
				const key = columnKey(column.dataset, column.field);
				return [key, formatValue(row[key], fieldFor(column), $locale)];
			})
		)
	);
	$: previewRows = exportRows.slice(0, 5);

	function fieldFor(column: ColumnSelection): Field {
		return datasetFor(column.dataset).fields.find((field) => field.id === column.field)!;
	}

	function formatValue(
		value: string | number | null | undefined,
		field: Field,
		language: string
	): string | number | null {
		if (value == null || value === '') return null;
		if (field.type === 'date') {
			const date = new Date(value);
			if (!Number.isNaN(date.getTime()))
				return date.toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { timeZone: 'UTC' });
		}
		return value;
	}

	function hasField(id: string, field: string): boolean {
		return columnSelections.some((column) => column.dataset === id && column.field === field);
	}

	async function addTable(id: string) {
		if (!availableDatasetIds.has(id)) return;
		if (!selectedTables.includes(id)) {
			selectedTables = [...selectedTables, id];
			if (!columnSelections.some((column) => column.dataset === id)) {
				columnSelections = [
					...columnSelections,
					...defaultColumns([id]).map((column) => ({
						...column,
						alias: headers.includes(column.alias) ? `${id}_${column.field}` : column.alias
					}))
				];
			}
		}
		activeTable = id;
		await tick();
		document
			.getElementById(`export-table-${id}`)
			?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	function removeTable(id: string) {
		selectedTables = selectedTables.filter((table) => table !== id);
		columnSelections = columnSelections.filter((column) => column.dataset !== id);
		rowSelections = Object.fromEntries(
			Object.entries(rowSelections).filter(([key]) => !key.endsWith(`:${id}`))
		);
		if (activeTable === id) activeTable = base;
	}

	function changeJoin(table: TableSelection, value: string) {
		joins = {
			...joins,
			[`${table.parent}:${table.dataset}`]: value === 'inner' ? 'inner' : 'left'
		};
	}

	function changeRowSelection(table: TableSelection, value: string) {
		if (loading || (value !== 'all' && !rowSelectionAvailability.get(table.dataset)?.available))
			return;
		rowSelections = {
			...rowSelections,
			[`${table.parent}:${table.dataset}`]: value === 'first' || value === 'last' ? value : 'all'
		};
	}

	function reconcileRowSelections(
		tables: TableSelection[],
		availability: Map<string, ReturnType<typeof getRowSelectionAvailability>>
	) {
		const invalid = tables.filter(
			(table) =>
				table.parent && table.selection !== 'all' && !availability.get(table.dataset)?.available
		);
		if (!invalid.length) return;
		const next = { ...rowSelections };
		for (const table of invalid) delete next[`${table.parent}:${table.dataset}`];
		rowSelections = next;
		showToast(
			$t('exportSelectionReset', {
				tables: invalid.map((table) => $t(datasetFor(table.dataset).label)).join(', ')
			})
		);
	}

	function selectionUnavailableHint(
		table: TableSelection,
		availability: ReturnType<typeof getRowSelectionAvailability> | undefined,
		isLoading: boolean,
		translate: (key: string, vars?: Record<string, string | number>) => string
	) {
		if (!datasetFor(table.dataset).dateField)
			return translate(
				table.dataset === 'radiation' ? 'exportSelectionRadiationNoDate' : 'exportSelectionNoDate',
				{ table: translate(datasetFor(table.dataset).label) }
			);
		if (isLoading) return translate('exportLoading');
		if (availability?.reason === 'missingDates') return translate('exportSelectionMissingDates');
		if (availability?.reason === 'noMatches') return translate('exportSelectionNoMatches');
		return '';
	}

	function toggleField(id: string, field: Field) {
		if (!availableDatasetIds.has(id)) return;
		if (hasField(id, field.id)) {
			columnSelections = columnSelections.filter(
				(column) => column.dataset !== id || column.field !== field.id
			);
		} else {
			if (!selectedTables.includes(id)) selectedTables = [...selectedTables, id];
			columnSelections = [
				...columnSelections,
				{
					dataset: id,
					field: field.id,
					alias: headers.includes(field.id) ? `${id}_${field.id}` : field.id
				}
			];
		}
	}

	function chooseAll(id: string) {
		if (!availableDatasetIds.has(id)) return;
		if (!selectedTables.includes(id)) selectedTables = [...selectedTables, id];
		const added = datasetFor(id)
			.fields.filter((field) => !hasField(id, field.id))
			.map((field) => ({
				dataset: id,
				field: field.id,
				alias: headers.includes(field.id) ? `${id}_${field.id}` : field.id
			}));
		columnSelections = [...columnSelections, ...added];
	}

	function renameColumn(index: number, alias: string) {
		columnSelections = columnSelections.map((column, i) =>
			i === index ? { ...column, alias } : column
		);
	}

	function moveColumn(index: number, direction: -1 | 1) {
		const target = index + direction;
		if (target < 0 || target >= columnSelections.length) return;
		const columns = [...columnSelections];
		[columns[index], columns[target]] = [columns[target], columns[index]];
		columnSelections = columns;
	}

	function clearColumnDrag() {
		draggedColumn = '';
		dropTarget = '';
		dropAfter = false;
	}

	function startColumnDrag(event: DragEvent, key: string) {
		if (!event.dataTransfer) return;
		draggedColumn = key;
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', key);
	}

	function dragOverColumn(event: DragEvent, key: string) {
		if (!draggedColumn || draggedColumn === key) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		dropTarget = key;
		dropAfter = event.clientX >= rect.left + rect.width / 2;
	}

	function leaveColumn(event: DragEvent, key: string) {
		if (
			event.relatedTarget instanceof Node &&
			(event.currentTarget as HTMLElement).contains(event.relatedTarget)
		)
			return;
		if (dropTarget === key) dropTarget = '';
	}

	function dropColumn(event: DragEvent, key: string) {
		if (!draggedColumn) return;
		event.preventDefault();
		if (draggedColumn !== key) {
			const moved = columnSelections.find(
				(column) => columnKey(column.dataset, column.field) === draggedColumn
			);
			const columns = columnSelections.filter(
				(column) => columnKey(column.dataset, column.field) !== draggedColumn
			);
			const targetIndex = columns.findIndex(
				(column) => columnKey(column.dataset, column.field) === key
			);
			if (moved && targetIndex >= 0) {
				const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
				const after = event.clientX >= rect.left + rect.width / 2;
				columns.splice(targetIndex + (after ? 1 : 0), 0, moved);
				columnSelections = columns;
			}
		}
		clearColumnDrag();
	}

	function reset() {
		hideResetTooltip();
		clearColumnDrag();
		selectedTables = defaultTables(availableDatasets);
		base = selectedTables[0] ?? '';
		columnSelections = defaultColumns(selectedTables);
		joins = {};
		rowSelections = {};
		activeTable = base;
		exportError = '';
	}

	function connectionText(table: TableSelection, translate: (key: string) => string): string {
		if (!table.parent) return translate('exportBaseOrigin');
		const relation = relations.find((item) => item.id === table.relation)!;
		const parentField = relation.from === table.parent ? relation.fromField : relation.toField;
		const childField = relation.from === table.parent ? relation.toField : relation.fromField;
		return `${translate(datasetFor(table.parent).label)}.${parentField} → ${childField}`;
	}

	async function download() {
		if (
			exporting ||
			loading ||
			dataError ||
			result.error ||
			!result.rows.length ||
			!columnSelections.length ||
			duplicateNames.length
		)
			return;
		exporting = true;
		exportError = '';
		// Capture the current configuration before the native save dialog opens.
		const rows = exportRows;
		const fields = columnSelections.map((column) => columnKey(column.dataset, column.field));
		const names = [...headers];
		const context = JSON.parse(
			JSON.stringify({
				title: $t('export'),
				filterActive: true,
				filter: loadedExportFilter,
				selection: {
					base,
					tables: plan,
					columns: columnSelections,
					requestedFilterActive: loadedFilterActive,
					baseCount: result.baseCount
				}
			})
		);
		try {
			const saved = await saveTableCsv({
				downloadName: 'OVIS_Export.csv',
				headers: names,
				fields,
				context,
				getRows: async () => rows,
				onProgress: () => {}
			});
			if (saved === 'saved' || saved === 'download-started') showToast($t('exportCsvCreated'));
		} catch (error) {
			exportError = error instanceof ExportAuditError ? error.message : 'exportErrorSave';
		} finally {
			exporting = false;
		}
	}
</script>

<svelte:head><title>{$t('export')} · OVIS</title></svelte:head>
<svelte:window on:resize={hideExportInfo} />

<lens-data-passer bind:this={dataPasser} />
<div class="export-builder" data-testid="export-builder">
	<section class="export-settings box_style box_level2" aria-label={$t('exportSettings')}>
		<Headline
			headlineTitle={$t('export')}
			headlineIcon={iconPath('download-icon.svg')}
			headlineDownload={false}
		/>
		<div class="tooltip export-info" bind:this={exportInfoTrigger}>
			<button
				type="button"
				class="iconRoundButton"
				aria-label={$t('exportInfoTitle')}
				aria-describedby="export-info-content"
				on:mouseenter={showExportInfo}
				on:mouseleave={scheduleInfoHide}
				on:focus={showExportInfo}
				on:blur={scheduleInfoHide}
				on:click={copyExportInfo}
			>
				<img src={iconPath('info-outlined.svg')} class="iconRound" alt="" aria-hidden="true" />
			</button>
			<div
				id="export-info-content"
				class="tooltiptext export-info-content"
				role="tooltip"
				popover="auto"
				bind:this={exportInfoContent}
				on:mouseleave={scheduleInfoHide}
			>
				<p><b>{$t('exportInfoTitle')}</b></p>
				<hr />
				<div class="export-info-body">
					<p><b>{$t('exportPreview')} / CSV</b><br />{$t('exportInfoDownload')}</p>
					<p>
						<b>{$t('rows')}</b><br />{$t('exportMultipleMatches')}
						{$t('exportInfoRowExample')}
					</p>
					<p>
						<b>{$t('exportConnection')}</b><br />{$t('exportInfoConnections')}<br /><br />
						<b>{$t('exportLeftJoin')}:</b>
						{$t('exportLeftJoinHint')}.<br />
						<b>{$t('exportInnerJoin')}:</b>
						{$t('exportInnerJoinHint')}.
					</p>
					<p><b>{$t('exportName')}</b><br />{$t('exportInfoColumns')}</p>
				</div>
				<hr />
				<p><i>{$t('infoButton')}</i></p>
			</div>
		</div>
	</section>

	<aside class="table-catalogue box_style box_level2" aria-label={$t('exportSelectTables')}>
		<div class="catalogue-heading">
			<Headline
				headlineDownload={false}
				headlineTitle={$t('analyticsTables')}
				headlineStatus={`${availableDatasets.length}`}
			/>
			<button
				type="button"
				class="iconRoundButton tooltip reset-button"
				aria-label={$t('exportReset')}
				aria-describedby="export-reset-tooltip"
				on:mouseenter={showViewportTooltip}
				on:focus={showViewportTooltip}
				on:blur={hideResetTooltip}
				on:keydown={(event) => {
					if (event.key === 'Escape') hideResetTooltip();
				}}
				on:click={reset}
			>
				<img src={iconPath('trash-icon.svg')} class="iconRound" alt="" aria-hidden="true" />
				<span
					id="export-reset-tooltip"
					class="tooltiptext"
					role="tooltip"
					popover="manual"
					bind:this={resetTooltip}>{$t('exportReset')}</span
				>
			</button>
		</div>
		<div class="catalogue-list">
			{#each availableDatasets as dataset}
				<label
					class="catalogue-item"
					class:current_selection={activeTable === dataset.id}
					class:table-selected={selectedTables.includes(dataset.id)}
				>
					<img class="menuebar-icon" src={iconPath(icons[dataset.id] || 'table.svg')} alt="" />
					<span class="catalogue-name" title={$t(dataset.label)}>
						{$t(dataset.label)}{#if includedTables.has(dataset.id)}
							{' '}
							<span class="catalogue-count" title={$t('exportSelectedFields')}
								>({selectedCounts[dataset.id]})</span
							>{/if}
						{#if includedTables.has(dataset.id) && !selectedTables.includes(dataset.id)}
							<small class="bridge-label">{$t('exportConnection')}</small>
						{/if}
					</span>
					<input
						type="checkbox"
						aria-label={$t('exportSelectTable', { table: $t(dataset.label) })}
						checked={selectedTables.includes(dataset.id)}
						on:change={(event) =>
							event.currentTarget.checked ? addTable(dataset.id) : removeTable(dataset.id)}
					/>
				</label>
			{:else}<p class="empty-message">{$t('exportNoTables')}</p>{/each}
		</div>
		<div class="catalogue-footer">
			<b
				>{$t(visiblePlan.length === 1 ? 'exportTableCountOne' : 'exportTableCount', {
					count: visiblePlan.length
				})}</b
			><span
				>{$t(
					columnSelections.length === 1
						? 'exportSelectedFieldCountOne'
						: 'exportSelectedFieldCount',
					{ count: columnSelections.length }
				)}</span
			>
		</div>
	</aside>

	<div class="field-modules box_style box_level2" aria-label={$t('exportFieldsAndConnections')}>
		{#each visiblePlan as table (table.dataset)}
			{@const dataset = datasetFor(table.dataset)}
			{@const bridge = !selectedTables.includes(dataset.id)}
			{@const dateField = dataset.fields.find((field) => field.id === dataset.dateField)}
			{@const selectionAvailable =
				!loading && !!rowSelectionAvailability.get(dataset.id)?.available}
			{@const unavailableHint = selectionUnavailableHint(
				table,
				rowSelectionAvailability.get(dataset.id),
				loading,
				$t
			)}
			<section
				id={`export-table-${dataset.id}`}
				class="field-module box_style box_level3"
				class:active-module={activeTable === dataset.id}
				aria-label={$t('exportTableFieldsAndConnection', { table: $t(dataset.label) })}
			>
				<div class="module-heading">
					<Headline
						headlineDownload={false}
						headlineTitle={$t(dataset.label)}
						headlineIcon={iconPath(icons[dataset.id] || 'table.svg')}
					/>
					{#if !bridge}
						<button
							type="button"
							class="iconRoundButton"
							aria-label={$t('exportRemoveTable', { table: $t(dataset.label) })}
							on:click={() => removeTable(dataset.id)}
						>
							<img class="iconRound remove-icon" src={iconPath('times-circle.svg')} alt="" />
						</button>
					{/if}
				</div>
				<div class="connection box_style box_level4">
					<div class="connection-kind">
						{$t(
							!table.parent ? 'exportBaseTable' : bridge ? 'exportBridgeTable' : 'exportConnection'
						)}
					</div>
					<div class="connection-path" title={connectionText(table, $t)}>
						{connectionText(table, $t)}
					</div>
					{#if table.parent}
						<label class="sr-only" for={`join-${dataset.id}`}
							>{$t('exportConnectionFor', { table: $t(dataset.label) })}</label
						>
						<div class="connection-controls">
							<select
								id={`join-${dataset.id}`}
								class="input-field"
								value={table.join}
								title={$t(table.join === 'left' ? 'exportLeftJoinHint' : 'exportInnerJoinHint')}
								on:change={(event) => changeJoin(table, event.currentTarget.value)}
							>
								<option value="left">{$t('exportLeftJoin')}</option>
								<option value="inner">{$t('exportInnerJoin')}</option>
							</select>
							<select
								id={`selection-${dataset.id}`}
								class="input-field"
								aria-label={$t('exportEntrySelectionFor', { table: $t(dataset.label) })}
								value={table.selection ?? 'all'}
								disabled={loading}
								title={unavailableHint ||
									(dateField
										? $t('exportSelectionDateHint', {
												field: `${$t(dateField.label)} (${dateField.id})`
										  })
										: '')}
								on:change={(event) => changeRowSelection(table, event.currentTarget.value)}
							>
								<option value="all">{$t('analyticsAll')}</option>
								<option value="first" disabled={!selectionAvailable}
									>{$t('exportSelectionFirst')}</option
								>
								<option value="last" disabled={!selectionAvailable}
									>{$t('exportSelectionLast')}</option
								>
							</select>
							<ConnectionInfo
								id={`export-connection-info-${dataset.id}`}
								tableLabel={$t(dataset.label)}
								parentLabel={$t(datasetFor(table.parent).label)}
								{dateField}
								selectionUnavailableHint={unavailableHint}
							/>
						</div>
					{:else}<div class="base-description">
							{$t('exportBaseDescription')}
						</div>{/if}
				</div>
				<div class="field-actions">
					<span
						>{$t('exportFieldCount', {
							selected: selectedCounts[dataset.id],
							total: dataset.fields.length
						})}</span
					>
					<div>
						<button type="button" on:click={() => chooseAll(dataset.id)}
							>{$t('analyticsAll')}</button
						><span>·</span><button
							type="button"
							on:click={() => {
								columnSelections = columnSelections.filter(
									(column) => column.dataset !== dataset.id
								);
							}}>{$t('exportSelectNone')}</button
						>
					</div>
				</div>
				<div class="field-list">
					{#each dataset.fields as field}
						<label
							class="field-row"
							class:field-selected={selectedFieldKeys.has(columnKey(dataset.id, field.id))}
							title={`${exportFieldLabel(field, $t)} (${field.id})`}
						>
							<input
								type="checkbox"
								checked={selectedFieldKeys.has(columnKey(dataset.id, field.id))}
								on:change={() => toggleField(dataset.id, field)}
							/>
							<span class="field-label">{exportFieldLabel(field, $t)}</span><span
								class="field-type"
								aria-label={$t(
									field.type === 'date'
										? 'date'
										: field.type === 'number'
										? 'exportNumberType'
										: 'exportTextType'
								)}
								>{field.type === 'date' ? $t('date') : field.type === 'number' ? '#' : 'Abc'}</span
							>
						</label>
					{/each}
				</div>
			</section>
		{/each}
	</div>

	<section
		class="export-preview box_style box_level2"
		aria-label={$t('exportPreview')}
		aria-busy={loading}
	>
		<div class="preview-heading">
			<Headline headlineDownload={false} headlineTitle={$t('exportPreview')} />
			<div class="export-download-actions">
				<button
					type="button"
					class="export-button download-button"
					disabled={!columnSelections.length ||
						!!duplicateNames.length ||
						exporting ||
						loading ||
						!!dataError ||
						!!result.error ||
						!result.rows.length}
					on:click={download}
				>
					<img class="menuebar-icon" src={iconPath('download-icon.svg')} alt="" />{exporting
						? $t('platformSaving')
						: $t('exportDownloadCsv')}
				</button>
			</div>
		</div>
		{#if loading}
			<div class="preview-summary" aria-live="polite">
				<span
					>{$t(loadingRows ? 'exportLoadingProgress' : 'exportLoading', {
						count: loadingRows
					})}</span
				>
			</div>
		{/if}
		{#if dataError}<p class="validation-message" role="alert">
				{$t(dataError.key, dataError.vars)}
				{#if mounted}
					<button
						type="button"
						class="export-button"
						on:click={() => loadData(tableIds, dataKey, $filterActiveStore.filterActive)}
						>{$t('chartRetry')}</button
					>
				{/if}
			</p>{/if}
		{#if result.error}<p class="validation-message" role="alert">
				{$t(result.error.key, {
					...result.error.vars,
					...(result.error.key === 'exportErrorRowLimit'
						? { limit: Number(result.error.vars.limit).toLocaleString($locale) }
						: {})
				})}
			</p>{/if}
		{#if duplicateNames.length}<p class="validation-message" role="alert">
				{$t('exportDuplicateNames', { names: Array.from(new Set(duplicateNames)).join(', ') })}
			</p>{/if}
		{#if exportError}<p class="validation-message" role="alert">{$t(exportError)}</p>{/if}
		{#if columnSelections.length}
			<div class="preview-scroll">
				<table class="preview-table" style:width={`${columnSelections.length * 160}px`}>
					<colgroup
						>{#each columnSelections as column (columnKey(column.dataset, column.field))}<col
							/>{/each}</colgroup
					>
					<thead>
						<tr>
							{#each columnSelections as column, index (columnKey(column.dataset, column.field))}
								<th
									scope="col"
									data-column-key={columnKey(column.dataset, column.field)}
									class:column-dragging={draggedColumn === columnKey(column.dataset, column.field)}
									class:drop-before={dropTarget === columnKey(column.dataset, column.field) &&
										!dropAfter}
									class:drop-after={dropTarget === columnKey(column.dataset, column.field) &&
										dropAfter}
									on:dragover={(event) =>
										dragOverColumn(event, columnKey(column.dataset, column.field))}
									on:dragleave={(event) =>
										leaveColumn(event, columnKey(column.dataset, column.field))}
									on:drop={(event) => dropColumn(event, columnKey(column.dataset, column.field))}
									><div class="original-column">
										<span
											class="column-heading-label"
											role="group"
											draggable="true"
											title={`${$t(datasetFor(column.dataset).label)}.${column.field} · ${$t(
												'exportDragColumn'
											)}`}
											on:dragstart={(event) =>
												startColumnDrag(event, columnKey(column.dataset, column.field))}
											on:dragend={clearColumnDrag}
											><small>{$t(datasetFor(column.dataset).label)}</small><span
												>{column.field}</span
											></span
										>
										<div class="column-actions">
											<button
												type="button"
												aria-label={$t('exportMoveColumnLeft', { column: headers[index] })}
												disabled={index === 0}
												on:click={() => moveColumn(index, -1)}>←</button
											><button
												type="button"
												aria-label={$t('exportMoveColumnRight', { column: headers[index] })}
												disabled={index === columnSelections.length - 1}
												on:click={() => moveColumn(index, 1)}>→</button
											>
										</div>
									</div></th
								>
							{/each}
						</tr>
						<tr class="alias-row">
							{#each columnSelections as column, index (columnKey(column.dataset, column.field))}
								<td
									><span class="alias-input" title={$t('edit')}
										><input
											class="input-field"
											aria-label={$t('exportNameFor', {
												field: `${$t(datasetFor(column.dataset).label)}.${column.field}`
											})}
											aria-invalid={headers.filter(
												(name) => name.toLocaleLowerCase() === headers[index].toLocaleLowerCase()
											).length > 1}
											maxlength="100"
											value={column.alias}
											placeholder={columnKey(column.dataset, column.field)}
											on:input={(event) => renameColumn(index, event.currentTarget.value)}
										/><img class="alias-pencil" src={iconPath('pencil.svg')} alt="" /></span
									></td
								>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each previewRows as row}<tr
								>{#each columnSelections as column}<td
										><span
											class="cell-value"
											title={String(row[columnKey(column.dataset, column.field)] ?? '—')}
											>{row[columnKey(column.dataset, column.field)] ?? '—'}</span
										></td
									>{/each}</tr
							>
						{:else}<tr
								><td colspan={columnSelections.length} class="empty-message"
									>{loading
										? $t('exportLoading')
										: dataError || result.error
										? $t('exportNoPreview')
										: $t('exportNoMatches')}</td
								></tr
							>{/each}
					</tbody>
				</table>
			</div>
		{:else}<div class="preview-empty">
				<img src={iconPath('table.svg')} alt="" />
				{#if availableDatasets.length}<b>{$t('exportChooseFields')}</b><span
						>{$t('exportEmptyPreviewHint')}</span
					>
				{:else}<b>{$t('exportUnavailable')}</b>{/if}
			</div>{/if}
		<div class="preview-footer">
			<span
				>{$t('exportPreviewFooter', { shown: previewRows.length, total: result.rows.length })}</span
			><span>{$t('exportPreviewEditHint')}</span>
		</div>
	</section>
</div>

<style>
	.export-builder {
		--export-accent: var(--link-color);
		display: grid;
		grid-template-columns: 225px minmax(0, 1fr);
		grid-template-rows: auto minmax(0, 1fr) max-content;
		grid-template-areas: 'settings settings' 'catalogue fields' 'catalogue preview';
		height: 100%;
		min-height: 0;
		overflow-y: auto;
	}
	:global(.dark-mode) .export-builder {
		--export-accent: color-mix(in srgb, var(--link-color), white 55%);
	}
	:global(.dark-mode) .export-builder :global(.headline-leading-icon) {
		filter: invert(1) hue-rotate(180deg);
	}
	.export-builder :global(.headline-status) {
		color: var(--muted-font-color);
		font-weight: normal;
	}
	.export-builder input::placeholder {
		color: var(--muted-font-color);
		opacity: 1;
	}
	.export-builder :global(.input-field) {
		box-sizing: border-box;
	}
	.export-settings {
		grid-area: settings;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 10px;
	}
	.module-heading,
	.preview-heading,
	.preview-summary,
	.preview-footer,
	.field-actions,
	.catalogue-footer {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.export-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 3px;
		padding: 5px 9px;
		border: 1px solid var(--border-color);
		border-radius: 5px;
		background: var(--level4-bg);
		color: var(--font-color);
		font: inherit;
		cursor: pointer;
		white-space: nowrap;
	}
	.export-button:hover:not(:disabled) {
		background: var(--dropdown-hover);
	}
	.export-button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.download-button {
		font-weight: bold;
		color: var(--export-accent);
	}
	.table-catalogue {
		grid-area: catalogue;
		display: flex;
		flex-direction: column;
		min-height: 0;
		padding: 8px;
	}
	.catalogue-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		margin-bottom: 4px;
	}
	.catalogue-heading > :global(div) {
		flex: 1;
		min-width: 0;
	}
	.catalogue-list {
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}
	.catalogue-item {
		width: 100%;
		box-sizing: border-box;
		min-height: 34px;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px;
		border: 0;
		border-radius: 4px;
		background: transparent;
		color: var(--font-color);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.catalogue-item:hover {
		background: var(--dropdown-hover);
	}
	.catalogue-item .menuebar-icon {
		width: 17px;
		height: 17px;
		flex-shrink: 0;
		object-fit: contain;
	}
	.catalogue-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.catalogue-count {
		color: var(--muted-font-color);
		white-space: nowrap;
	}
	.table-selected .catalogue-count {
		color: var(--export-accent);
	}
	.catalogue-item input {
		margin: 0;
		flex: 0 0 auto;
		accent-color: var(--export-accent);
		cursor: pointer;
	}
	.bridge-label {
		display: block;
		color: var(--muted-font-color);
		font-size: 11px;
	}
	.catalogue-footer {
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		border-top: 1px solid var(--border-color);
		padding-top: 10px;
		margin-top: 6px;
	}
	.catalogue-footer span {
		color: var(--muted-font-color);
	}
	.field-modules {
		grid-area: fields;
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 220px;
		justify-content: start;
		overflow-x: auto;
		min-width: 0;
		min-height: 0;
		padding: 8px;
	}
	.field-module {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		padding: 8px;
	}
	.active-module {
		border-color: color-mix(in srgb, var(--export-accent), var(--border-color) 55%);
	}
	.module-heading {
		justify-content: space-between;
		min-height: 23px;
		margin-bottom: 6px;
		gap: 3px;
	}
	.module-heading > :global(div) {
		flex: 1;
		min-width: 0;
	}
	.remove-icon {
		width: 14px;
		height: 14px;
	}
	.connection {
		margin: 0 0 7px;
		padding: 6px;
		flex: 0 0 auto;
		min-height: 78px;
		box-sizing: border-box;
	}
	.connection-kind {
		font-size: 11px;
		color: var(--muted-font-color);
		margin-bottom: 3px;
	}
	.connection-path {
		font-size: 12px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-bottom: 6px;
	}
	.connection select {
		flex: 1;
		min-width: 0;
		font-size: 11px;
		padding: 3px;
	}
	.connection-controls {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.connection-controls select:first-child {
		flex: 1.4;
	}
	.base-description {
		font-size: 11px;
		color: var(--muted-font-color);
		padding-block: 5px;
	}
	.field-actions {
		justify-content: space-between;
		color: var(--muted-font-color);
		font-size: 11px;
		padding-block: 7px 4px;
	}
	.field-actions > div {
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.field-actions button,
	.column-actions button {
		border: 0;
		padding: 2px;
		background: transparent;
		color: var(--export-accent);
		font: inherit;
		cursor: pointer;
	}
	.field-actions button:hover {
		text-decoration: underline;
	}
	.field-list {
		overflow-y: auto;
		min-height: 0;
		max-height: 260px;
	}
	.field-row {
		min-height: 26px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 4px;
		cursor: pointer;
		border-bottom: 1px solid var(--border-color);
	}
	.field-row:hover {
		background: var(--dropdown-hover);
	}
	.field-selected {
		background: var(--level4-bg);
	}
	.field-row input {
		margin: 0;
		flex: 0 0 auto;
		accent-color: var(--export-accent);
	}
	.field-label {
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
	}
	.field-type {
		font-size: 10px;
		color: var(--muted-font-color);
	}
	.export-preview {
		grid-area: preview;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		padding: 8px;
	}
	.preview-heading {
		justify-content: space-between;
	}
	.export-download-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 0 0 auto;
	}
	.export-info {
		display: inline-flex;
		align-items: center;
	}
	.export-info-content[popover]:not(:popover-open),
	.reset-button .tooltiptext[popover]:not(:popover-open) {
		display: none;
	}
	.export-info-body {
		text-align: left;
	}
	.preview-summary {
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 4px 14px;
		margin-block: 8px;
		color: var(--muted-font-color);
		font-size: 12px;
	}
	.preview-scroll {
		overflow-x: auto;
		overflow-y: hidden;
		flex: 0 0 auto;
	}
	.preview-table {
		table-layout: fixed;
		border-collapse: separate;
		border-spacing: 0;
		font-size: 12px;
		min-width: 100%;
	}
	.preview-table th,
	.preview-table td {
		text-align: left;
		padding: 5px 8px;
		border-bottom: 1px solid var(--border-color);
		white-space: nowrap;
	}
	.preview-table thead {
		background: var(--level2-bg);
		position: sticky;
		top: 0;
		z-index: 1;
	}
	.preview-table th {
		font-weight: bold;
	}
	.original-column {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		min-width: 0;
	}
	.column-heading-label {
		flex: 1;
		min-width: 0;
		cursor: grab;
		user-select: none;
	}
	.column-heading-label:active {
		cursor: grabbing;
	}
	.column-heading-label > span,
	.column-heading-label > small,
	.cell-value {
		display: block;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.column-dragging {
		opacity: 0.45;
	}
	.drop-before {
		box-shadow: inset 3px 0 var(--export-accent);
	}
	.drop-after {
		box-shadow: inset -3px 0 var(--export-accent);
	}
	.original-column small {
		display: block;
		font-size: 10px;
		font-weight: normal;
		color: var(--muted-font-color);
		margin-bottom: 3px;
	}
	.column-actions {
		display: flex;
		flex: 0 0 auto;
		gap: 3px;
	}
	.column-actions button {
		font-size: 13px;
	}
	.column-actions button:disabled {
		opacity: 0.25;
		cursor: default;
	}
	.alias-row td {
		padding-top: 2px;
		padding-bottom: 7px;
	}
	.alias-row input {
		display: block;
		width: 100%;
		min-width: 0;
		padding-right: 26px;
		font-size: 12px;
		background: var(--level4-bg);
	}
	.alias-input {
		display: block;
		position: relative;
	}
	.alias-pencil {
		position: absolute;
		right: 8px;
		top: 50%;
		transform: translateY(-50%);
		width: 12px;
		height: 12px;
		pointer-events: none;
	}
	:global(.dark-mode) .alias-pencil {
		filter: brightness(0) invert(1);
	}
	.alias-row input[aria-invalid='true'] {
		border-color: var(--font-color);
		border-style: dashed;
	}
	.preview-table tbody tr:nth-child(even) {
		background: var(--level3-bg);
	}
	.preview-table tbody td {
		padding-block: 3px;
	}
	.preview-table tbody tr:hover {
		background: var(--dropdown-hover);
	}
	.preview-footer {
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 4px 12px;
		color: var(--muted-font-color);
		font-size: 11px;
		padding-top: 8px;
	}
	.validation-message {
		margin: 0 0 8px;
		padding: 6px;
		border-left: 3px solid var(--font-color);
		background: var(--level3-bg);
	}
	.empty-message {
		padding: 15px 5px;
		color: var(--muted-font-color);
	}
	.preview-empty {
		display: flex;
		flex: 1;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 8px;
		color: var(--muted-font-color);
	}
	.preview-empty img {
		width: 24px;
		height: 24px;
		opacity: 0.5;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.export-builder :is(button, input, select):focus-visible {
		outline: 2px solid var(--export-accent);
		outline-offset: 2px;
	}
	@media (max-height: 850px) {
		.connection {
			min-height: 71px;
		}
	}
	@media (max-height: 800px) {
		.field-module {
			padding: 6px;
		}
		.module-heading {
			margin-bottom: 3px;
		}
		.connection {
			min-height: 0;
			padding: 4px;
			margin-bottom: 4px;
		}
		.connection-kind {
			margin-bottom: 1px;
		}
		.connection-path {
			margin-bottom: 3px;
		}
		.base-description {
			padding-block: 1px;
		}
		.field-actions {
			padding-block: 3px 2px;
		}
	}
	@media (max-height: 720px) {
		.connection-kind {
			display: none;
		}
	}
	@media (max-width: 1200px) {
		.export-builder {
			grid-template-columns: 180px minmax(0, 1fr);
		}
	}
</style>
