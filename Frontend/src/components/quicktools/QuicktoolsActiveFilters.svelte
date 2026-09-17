<script lang="ts">
	/* eslint-disable @typescript-eslint/no-explicit-any */
	import { t } from '../../store/languageStore';
	import type { LensDataPasser } from '@samply/lens';
	import { filterActiveStore } from '../../store/filterActiveStore.js';
	import { userStore } from '../../store/userStore';
	import { filterSaveStore } from '../../store/filterSaveStore.js';
	import { get } from 'svelte/store';
	import { onDestroy, onMount, tick } from 'svelte';
	import { reloadOnly } from '../../store/reloadStore.js';
	import { appPath, iconPath } from '$lib/path-utils';
	import { escapeHtml } from '$lib/escape-html';

	let dataPasser: LensDataPasser;

	let isPrevDisabled = false;
	let isNextDisabled = false;

	$: {
		const { currentIndex, filterSaveArray } = $filterSaveStore;
		isPrevDisabled = currentIndex === 0;
		isNextDisabled = currentIndex < filterSaveArray.length - 1 ? false : true;
	}

	const createNullFilter = () => ({
		operand: 'OR',
		children: [{
			operand: 'AND',
			children: [{
				key: 'isTumor', operand: 'OR',
				children: [{ key: 'isTumor', type: 'EQUALS', system: 'diagnosis', value: 'true' }]
			}]
		}]
	});

	let currentAst: any = createNullFilter();
	function isLensReady(): boolean {
		return typeof dataPasser?.getAstAPI === 'function' &&
			typeof dataPasser?.getQueryAPI === 'function' &&
			typeof dataPasser?.setQueryStoreAPI === 'function' &&
			typeof dataPasser?.setQueryStoreFromAstAPI === 'function';
	}

	onMount(() => {
		let disposed = false;
		let updateQueued = false;
		const updateFromLens = () => {
			if (!disposed && isLensReady()) {
				currentAst = dataPasser.getAstAPI();
				addNewAst(currentAst);
			}
		};
		const onQueryUpdated = () => {
			if (updateQueued) return;
			updateQueued = true;
			// Lens emits before its data-passer subscription receives the new query.
			queueMicrotask(() => {
				updateQueued = false;
				updateFromLens();
			});
		};
		window.addEventListener('lens-query-updated', onQueryUpdated);
		void (async () => {
			await import('@samply/lens');
			await customElements.whenDefined('lens-data-passer');
			await tick();
			updateFromLens();
		})();
		return () => {
			disposed = true;
			window.removeEventListener('lens-query-updated', onQueryUpdated);
		};
	});

	function addNewAst(newAst) {
		filterSaveStore.update((currentValue: any) => {
			const currentSerializedAst = JSON.stringify(newAst);
			const currentSavedAst = currentValue.filterSaveArray[currentValue.currentIndex];
			const savedQuery = JSON.stringify(dataPasser.getQueryAPI());
			const querySaveArray = currentValue.filterSaveArray.map((_ast, index) => currentValue.querySaveArray?.[index]);

			if (currentSerializedAst !== currentSavedAst) {
				const updatedFilterSaveArray = [
					...currentValue.filterSaveArray.slice(0, currentValue.currentIndex + 1),
					currentSerializedAst
				];

				return {
					...currentValue,
					currentIndex: currentValue.currentIndex + 1,
					filterSaveArray: updatedFilterSaveArray,
					querySaveArray: [...querySaveArray.slice(0, currentValue.currentIndex + 1), savedQuery]
				};
			}

			querySaveArray[currentValue.currentIndex] = savedQuery;
			return { ...currentValue, querySaveArray };
		});
	}

	let primaryColor = '';
	const unsubscribeUser = userStore.subscribe((value: any) => {
		({ primaryColor } = value);
	});
	onDestroy(unsubscribeUser);

	const angleRightIcon = iconPath('angle-right-icon.svg');
	const angleLeftIcon = iconPath('angle-left-icon.svg');
	const downloadIcon = iconPath('download-icon.svg');
	const uploadIcon = iconPath('upload-icon.svg');
	const deleteIcon = iconPath('trash-icon.svg');
	const infoIcon = iconPath('info-outlined.svg');
	const pencilIcon = iconPath('pencil.svg');
	const removeIcon = iconPath('times-circle.svg');
	const filterOnIcon = iconPath('filter_on.svg');
	const filterOffIcon = iconPath('filter_off.svg');

	function truncateLabel(label) {
		return label.length > 9 ? label.slice(0, 9) + '...' : label; // Kürzen auf 10 Zeichen
	}

	function truncateValue(value) {
		const text = String(value ?? '-');
		return text.length > 10 ? text.slice(0, 10) + '...' : text;
	}

	function sameValue(left: unknown, right: unknown): boolean {
		if (Object.is(left, right)) return true;
		if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
		if (Array.isArray(left) !== Array.isArray(right)) return false;
		const keys = Object.keys(left);
		return keys.length === Object.keys(right).length && keys.every((key) =>
			Object.prototype.hasOwnProperty.call(right, key) &&
			sameValue((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])
		);
	}

	function applyQuery(nextQuery) {
		if (!isLensReady()) return;
		const nonemptyGroups = nextQuery.filter((group) => group.length > 0);
		if (nonemptyGroups.length > 0) dataPasser.setQueryStoreAPI(nonemptyGroups);
		else dataPasser.setQueryStoreFromAstAPI(createNullFilter());
		currentAst = dataPasser.getAstAPI();
		addNewAst(currentAst);
		reloadOnly();
	}

	function handleRemoveInnerOr(groupIndex: number, rowIndex: number, valueIndex: number, selectedNode) {
		if (!isLensReady()) return;
		const query = dataPasser.getQueryAPI();
		const row = query[groupIndex]?.[rowIndex];
		const selected = row?.values[valueIndex];
		if (!row || !selected || row.key !== selectedNode.key || row.system !== selectedNode.system ||
			row.type !== selectedNode.type || !sameValue(selected.value, selectedNode.value)) return;
		const nextQuery = query.map((group, groupPosition) => groupPosition === groupIndex
			? group.flatMap((item, itemPosition) => {
				if (itemPosition !== rowIndex) return [item];
				const values = item.values.filter((_value, valuePosition) => valuePosition !== valueIndex);
				return values.length > 0 ? [{ ...item, values }] : [];
			})
			: [...group]);
		applyQuery(nextQuery);
	}

	function handleRemoveChildrenByKey(groupIndex: number, rowIndex: number, selectedNode) {
		if (!isLensReady()) return;
		const query = dataPasser.getQueryAPI();
		const row = query[groupIndex]?.[rowIndex];
		if (!row || row.key !== selectedNode.key || row.system !== selectedNode.system || row.type !== selectedNode.type) return;
		applyQuery(query.map((group, groupPosition) => groupPosition === groupIndex
			? group.filter((_row, rowPosition) => rowPosition !== rowIndex)
			: [...group]));
	}

	let filterActive = true;
	let toggleStatus = false;

	const unsubscribeFilterActive = filterActiveStore.subscribe((value) => {
		filterActive = value.filterActive; // Assuming filterActiveStore provides an object with a filterActive property
	});
	onDestroy(unsubscribeFilterActive);

	function toggleFilterAndIcon() {
		filterActive = !filterActive;
		toggleStatus = !toggleStatus;
		filterActiveStore.set({ filterActive });

		reloadOnly();
	}

	function restoreHistory(direction: number) {
		if (!isLensReady()) return;
		const history: any = get(filterSaveStore);
		const nextIndex = history.currentIndex + direction;
		if (nextIndex < 0 || nextIndex >= history.filterSaveArray.length) return;
		const nextAst = JSON.parse(history.filterSaveArray[nextIndex]);
		// Commit the history position before Lens emits its query event. Never update
		// the query from inside filterSaveStore.update: that re-enters history writes.
		filterSaveStore.set({ ...history, currentIndex: nextIndex });
		const savedQuery = history.querySaveArray?.[nextIndex];
		if (savedQuery) {
			const query = JSON.parse(savedQuery);
			dataPasser.setQueryStoreAPI(query.length > 0 ? query : [[]]);
		} else if (nextAst.children?.length === 0) {
			dataPasser.setQueryStoreAPI([[]]);
		} else {
			dataPasser.setQueryStoreFromAstAPI(nextAst);
		}
		currentAst = dataPasser.getAstAPI();
		reloadOnly();
	}

	function handlePrev() {
		restoreHistory(-1);
	}

	function handleNext() {
		restoreHistory(1);
	}

	function parseNode(node) {
		if ((node.type === 'BETWEEN' || node.type === 'NBETWEEN') && node.value) {
			const min = node.value.min;
			const max = node.value.max;
			if (min == null && max == null) return '-';

			// Datumsfelder besonders formatieren
			if (node.key?.toLowerCase().includes('date')) {
				const formattedMin = formatMillisecondsToDate(min);
				const formattedMax = formatMillisecondsToDate(max);
				if (formattedMin === formattedMax) return formattedMin; // nur einen Wert zeigen
				return `${formattedMin}<br>${formattedMax}`;
			}

			// Nicht-Date-Felder
			if (min === max) return escapeHtml(min);
			return `${escapeHtml(min)}<br>${escapeHtml(max)}`;
		} else if (node.type === 'EQUALS' || node.type === 'NEQUALS') {
			return escapeHtml(truncateValue(node.value));
		}
		return '';
	}

	function formatMillisecondsToDate(milliseconds) {
		if (milliseconds == null) return '-';
		const d = new Date(milliseconds);
		if (isNaN(d.getTime())) return '-';
		const day = String(d.getDate()).padStart(2, '0');
		const month = String(d.getMonth() + 1).padStart(2, '0');
		const year = d.getFullYear();
		return `${day}.${month}.${year}`;
	}

	function deleteAst() {
		currentAst = createNullFilter();
		if (isLensReady()) {
			dataPasser.setQueryStoreFromAstAPI(currentAst);
			currentAst = dataPasser.getAstAPI();
			addNewAst(currentAst);
			reloadOnly();
		}
	}

	function downloadCurrentAst() {
		const currentDate = new Date();

		const monthNames = [
			'Jan',
			'Feb',
			'Mar',
			'Apr',
			'May',
			'Jun',
			'Jul',
			'Aug',
			'Sep',
			'Oct',
			'Nov',
			'Dec'
		];
		const formattedDate =
			monthNames[currentDate.getMonth()] +
			'_' +
			String(currentDate.getDate()).padStart(2, '0') +
			'_' +
			currentDate.getFullYear();

		const dataStr =
			'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(currentAst, null, 2));
		const downloadAnchorNode = document.createElement('a');
		downloadAnchorNode.setAttribute('href', dataStr);
		downloadAnchorNode.setAttribute('download', 'ovis_filter_' + formattedDate + '.json');
		document.body.appendChild(downloadAnchorNode);
		downloadAnchorNode.click();
		downloadAnchorNode.remove();
	}

	function uploadAst(event) {
		const file = event.target.files[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = function (e) {
				try {
					currentAst = JSON.parse(e.target.result as string);
					if (isLensReady()) {
						if (currentAst.children?.length === 0) dataPasser.setQueryStoreAPI([[]]);
						else dataPasser.setQueryStoreFromAstAPI(currentAst);
						currentAst = dataPasser.getAstAPI();
						addNewAst(currentAst);
						reloadOnly();
					}
					// TODO: Trigger the redisplay of the component
				} catch (error) {
					console.error('Error parsing JSON:', error);
				}
			};
			reader.readAsText(file);
		}
	}
</script>

<lens-data-passer bind:this={dataPasser} />

<div class="quicktool-label-container">
    <button class="filter-toggle-button" on:click={toggleFilterAndIcon}>
        <img src={filterActive ? filterOnIcon : filterOffIcon} alt="" class="menuebar-icon" />
        {#if filterActive}
            <b>Filter</b> &nbsp;<i><u style="color:{primaryColor}">{$t("active")}</u></i>
        {:else}
            <b>Filter</b> &nbsp;<i><u style="color:{primaryColor}">in{$t("active")}</u></i>
        {/if}
    </button>

    <div class="right-section">
        <a href={appPath('/filter-edit')} style="color:{primaryColor}">
            <i>(<u>{$t("edit")}</u> <img src={pencilIcon} alt="" class="pencil-icon" />)</i>
        </a>
        <button class="iconRoundButton tooltip">
            <span class="tooltiptext">{@html $t("tooltip_QuicktoolsActiveFilters")}</span>
            <img src={infoIcon} alt="info" class="iconRound" />
        </button>
    </div>
</div>

<div class="query-output box_style box_level3">
    {#each currentAst.children as andNode, andIndex}
    <div class="or-block">
        <div class="and-block">
            {#each andNode?.children ?? [] as orNode, orIndex}
                <div class="filter-entry-grid">
                    {#if orNode.children[0] && orNode.children[0].key !=="isTumor"}
                    <button class="label-item" on:click={() => handleRemoveChildrenByKey(andIndex, orIndex, orNode.children[0])}>
                        <img src={removeIcon} alt="x" class="remove-icon-label" />
                        <strong>{truncateLabel(orNode.children[0].key)}</strong>
                    </button>

                    <div class="arrow">
                        {@html (orNode.children[0].key.startsWith("!")) ? '≠' : '→'}
                      </div>


                    <div class="value" class:patient-values={orNode.children[0].key === "patID"}>
                        {#each orNode.children as child, childIndex}
                        <button class="value-item" on:click={() => handleRemoveInnerOr(andIndex, orIndex, childIndex, child)}>
                            {@html parseNode(child)}
                            <img src={removeIcon} alt="x" class="remove-icon-value" />
                        </button>


                        {/each}
                    </div>
                    {/if}
                </div>
                {#if orIndex < andNode.children.length - 1}
                    <hr class="custom-and-hr" />
                {/if}
            {/each}
        </div>
        {#if andIndex < currentAst.children.length - 1}
            <hr class="custom-or-hr" />
        {/if}
    </div>
{/each}

</div>

<div class="filter-history-controls box_style box_level3">
    <!-- Rückwärts-Button (Deaktiviert, wenn currentIndex = 0) -->
    <button on:click={handlePrev} class="bottomButtons" disabled={isPrevDisabled}>
        <img src={angleLeftIcon} alt="previous" class="iconRound {isPrevDisabled ? 'disabled-icon' : ''}" />
    </button>

    <!-- Vorwärts-Button (Deaktiviert, wenn currentIndex + 1 gleich der Array-Länge ist) -->
    <button on:click={handleNext} class="bottomButtons" disabled={isNextDisabled}>
        <img src={angleRightIcon} alt="next" class="iconRound {isNextDisabled ? 'disabled-icon' : ''}" />
    </button>

    <button on:click={downloadCurrentAst} class="bottomButtons">
        <img src={downloadIcon} alt="download" class="iconRound" />
    </button>

    <!-- Upload Button with File Input -->
    <label class="bottomButtons">
        <input type="file" accept=".json" on:change={uploadAst} style="display: none;" />
        <img src={uploadIcon} alt="upload" class="iconRound" />
    </label>

    <button on:click={deleteAst} class="bottomButtons">
        <img src={deleteIcon} alt="next" class="iconRound" />
    </button>
</div>

<style>
    .bottomButtons{
        background: none;
        border:none;
    }

	@container ovis-layout (max-width: 1650px) {
		.filter-history-controls {
			display: flex;
			align-items: center;
			flex-wrap: nowrap;
			gap: 8px;
		}

		.bottomButtons {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			flex: 0 0 auto;
			padding: 2px 4px;
		}
	}

    .filter-toggle-button {
        display: flex;
        align-items: center;
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        font-size: 1em;
    }

    .filter-toggle-button img {
        margin-right: 5px;
    }

    .quicktool-label-container {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2px;
    }

    .right-section {
        display: flex;
        align-items: center;
    }

    .right-section a {
        margin-right: 12px;
    }

    .iconRoundButton {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        cursor: pointer;
    }

    .iconRound {
        width: 16px;
        height: 16px;
    }



    .disabled-icon {
        filter: grayscale(100%) brightness(0.9);
    }



    .custom-and-hr {
        border: none;
        border-top: 2px solid rgba(225, 225, 225, 1);
        margin: 2px 0;
        width: 100%;
    }

    .custom-or-hr {
        border: none;
        border-top: 4px dotted rgba(225, 225, 225, 1);
        margin: 2px 0;
        width: 100%;
    }

    .filter-entry-grid {
        display: grid;
        grid-template-columns: 4fr 1fr 4fr;
        align-items: flex-start;
        margin-bottom: 2px;
    }

    .query-output {
		height: var(--ovis-active-filter-height);
		max-height: var(--ovis-active-filter-height);
		min-height: var(--ovis-active-filter-height);
        overflow-y: auto;
    }

    .label-item, .value-item {
        display: inline-flex;
        align-items: center;
        border: none;
        background: transparent;
        cursor: pointer;
    }

    .patient-values {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
    }

    .label-item:hover, .value-item:hover {
        background-color: rgba(200, 200, 200, 0.2);
    }

    .remove-icon-label, .remove-icon-value {
        width: 16px;
        height: 16px;
        margin-left: 5px;
        cursor: pointer;
    }

    .pencil-icon {
        width: 12px;
        height: 12px;
    }

    :global(.dark-mode) .pencil-icon {
        filter: brightness(0) invert(1);
    }

</style>
