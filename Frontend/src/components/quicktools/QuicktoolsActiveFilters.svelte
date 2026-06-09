<script lang="ts">
	/* eslint-disable @typescript-eslint/no-explicit-any */
	import { t } from '../../store/languageStore';
	import type { LensDataPasser } from '@samply/lens';
	import { filterActiveStore } from '../../store/filterActiveStore.js';
	import { userStore } from '../../store/userStore';
	import { filterSaveStore } from '../../store/filterSaveStore.js';
	import { get } from 'svelte/store';
	import { onMount, tick } from 'svelte';
	import { reloadOnly } from '../../store/reloadStore.js';
	import { appPath, iconPath } from '$lib/path-utils';

	let dataPasser: LensDataPasser;

	let isPrevDisabled = false;
	let isNextDisabled = false;

	$: {
		const { currentIndex, filterSaveArray } = get(filterSaveStore);
		isPrevDisabled = currentIndex === 0;
		isNextDisabled = currentIndex < filterSaveArray.length - 1 ? false : true;
	}

	const createNullFilter = () => ({
		operand: 'OR',
		children: [
			{
				operand: 'AND',
				children: [
					{
						key: 'isTumor',
						operand: 'OR',
						children: [
							{
								key: 'isTumor',
								type: 'EQUALS',
								system: 'diagnosis',
								value: 'true'
							}
						]
					}
				]
			}
		]
	});

	let currentAst: any = createNullFilter();

	onMount(async () => {
		await import('@samply/lens');
		await tick(); // Wait for component binding

		if (dataPasser) {
			currentAst = dataPasser.getAstAPI();
			addNewAst(currentAst); // Initialen Wert hinzufügen

			window.addEventListener('lens-query-updated', () => {
				if (dataPasser) {
					currentAst = dataPasser.getAstAPI();
					addNewAst(currentAst);
				}
			});
		}
	});

	function addNewAst(newAst) {
		filterSaveStore.update((currentValue) => {
			const currentSerializedAst = JSON.stringify(newAst);
			const currentSavedAst = currentValue.filterSaveArray[currentValue.currentIndex];

			if (currentSerializedAst !== currentSavedAst) {
				const updatedFilterSaveArray = [
					...currentValue.filterSaveArray.slice(0, currentValue.currentIndex + 1),
					currentSerializedAst
				];

				return {
					...currentValue,
					currentIndex: currentValue.currentIndex + 1,
					filterSaveArray: updatedFilterSaveArray
				};
			}

			return currentValue;
		});
	}

	let primaryColor = '';
	userStore.subscribe((value: any) => {
		({ primaryColor } = value);
	});

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
		return value.length > 10 ? value.slice(0, 10) + '...' : value; // Kürzen auf 10 Zeichen
	}

	function handleRemoveInnerOr(keyToRemove, valueToRemove) {
		function removeNode(node) {
			if (node.operand === 'OR' && node.children) {
				node.children = node.children.filter(
					(child) => !(child.key === keyToRemove && child.value === valueToRemove)
				);
				if (node.children.length === 0) {
					return null;
				}
			} else if (node.operand === 'AND' && node.children) {
				node.children = node.children.map(removeNode).filter((child) => child !== null);
				if (node.children.length === 0) {
					return null;
				}
			}
			return node;
		}

		currentAst.children = currentAst.children.map(removeNode).filter((child) => child !== null);

		if (currentAst.children.length === 0) {
			currentAst = createNullFilter(); // Setze den nullFilter, wenn alle Elemente entfernt wurden
		}

		if (dataPasser) {
			dataPasser.setQueryStoreFromAstAPI(currentAst);
			reloadOnly();
		}
	}

	function handleRemoveChildrenByKey(keyToRemove: string) {
		function stripByKey(node: any, depth = 0): any | null {
			if (!node) return null;
			const indent = '  '.repeat(depth);

			console.log(
				indent + '👉 visit:',
				JSON.stringify({
					operand: node.operand,
					key: node.key,
					children: node.children?.length ?? 0
				})
			);

			if (!Array.isArray(node.children)) {
				// Blatt: bleibt, außer der ELTERN-Knoten filtert es weg
				return node;
			}

			// 1) Zuerst alle direkten Kinder mit gesuchtem Key entfernen
			const before = node.children.length;
			let kept = node.children.filter((c: any) => c?.key !== keyToRemove);
			const removed = before - kept.length;
			if (removed > 0) {
				console.log(indent + `❌ removed ${removed} direct children with key="${keyToRemove}"`);
			}

			// 2) Rekursiv weiter runter (falls in tieferen Ebenen auch Kinder mit dem Key existieren)
			kept = kept.map((c: any) => stripByKey(c, depth + 1)).filter((c: any) => c !== null);

			// 3) Aufräumen: wenn nach dem Entfernen/Prunen keine Kinder mehr → Knoten selbst entfernen
			if (kept.length === 0) {
				console.log(indent + `⚠️ pruned empty ${node.operand ?? 'node'}`);
				return null;
			}

			node.children = kept;
			console.log(indent + `✅ keep ${node.operand ?? 'node'} with ${kept.length} children`);
			return node;
		}

		console.log('=== handleRemoveChildrenByKey START === key:', keyToRemove);
		const newAst = stripByKey(currentAst);
		console.log('=== handleRemoveChildrenByKey END ===', JSON.stringify(newAst, null, 2));

		// Fallback: wenn alles weg ist → auf deinen definierten nullFilter zurück
		currentAst = newAst ?? createNullFilter();

		if (dataPasser) {
			dataPasser.setQueryStoreFromAstAPI(currentAst);
			reloadOnly();
		}
	}

	let filterActive = true;
	let toggleStatus = false;

	filterActiveStore.subscribe((value) => {
		filterActive = value.filterActive; // Assuming filterActiveStore provides an object with a filterActive property
	});

	function toggleFilterAndIcon() {
		filterActive = !filterActive;
		toggleStatus = !toggleStatus;
		filterActiveStore.set({ filterActive });

		reloadOnly();
	}

	function handlePrev() {
		filterSaveStore.update(({ currentIndex, filterSaveArray, ...rest }) => {
			const previousIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
			let previousAst = filterSaveArray[previousIndex];
			if (previousIndex === 0) {
				currentAst = createNullFilter();
				const nullSerialized = JSON.stringify(currentAst);
				filterSaveArray[0] = nullSerialized;
				if (dataPasser) {
					dataPasser.setQueryStoreFromAstAPI(currentAst);
					reloadOnly();
				}
				return { ...rest, currentIndex: 0, filterSaveArray };
			}

			if (JSON.stringify(currentAst) !== previousAst) {
				currentAst = JSON.parse(previousAst); // Update `currentAst` mit dem neuen Wert
				if (dataPasser) {
					dataPasser.setQueryStoreFromAstAPI(currentAst);
					reloadOnly();
				}
				return { ...rest, currentIndex: previousIndex, filterSaveArray };
			}

			return { currentIndex, filterSaveArray, ...rest };
		});
	}

	function handleNext() {
		filterSaveStore.update(({ currentIndex, filterSaveArray, ...rest }) => {
			const nextIndex = currentIndex < filterSaveArray.length - 1 ? currentIndex + 1 : currentIndex;
			const nextSerialized = filterSaveArray[nextIndex];
			const nextAst = JSON.parse(nextSerialized);

			if (JSON.stringify(currentAst) !== nextSerialized) {
				currentAst = nextAst;
				if (dataPasser) {
					dataPasser.setQueryStoreFromAstAPI(currentAst);
					reloadOnly();
				}
				return { ...rest, currentIndex: nextIndex, filterSaveArray };
			}

			return { currentIndex, filterSaveArray, ...rest };
		});
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
			if (min === max) return `${min}`;
			return `${min}<br>${max}`;
		} else if (node.type === 'EQUALS' || node.type === 'NEQUALS') {
			return truncateValue(node.value);
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
		if (dataPasser) {
			dataPasser.setQueryStoreFromAstAPI(currentAst);
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
					console.log('Uploaded AST:', currentAst);
					if (dataPasser) {
						dataPasser.setQueryStoreFromAstAPI(currentAst);
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
        <img src={filterActive ? filterOnIcon : filterOffIcon} class="menuebar-icon" />
        {#if filterActive}
            <b>Filter</b> &nbsp;<i><u style="color:{primaryColor}">{$t("active")}</u></i>
        {:else}
            <b>Filter</b> &nbsp;<i><u style="color:{primaryColor}">in{$t("active")}</u></i>
        {/if}
    </button>

    <div class="right-section">
        <a href={appPath('/filter-edit')} style="color:{primaryColor}">
            <i>(<u>{$t("edit")}</u> <img src={pencilIcon} class="pencil-icon" />)</i>
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
            {#each andNode.children as orNode, orIndex}
                <div class="grid-container">
                    {#if orNode.children[0].key !=="isTumor"}
                    <button class="label-item" on:click={() => handleRemoveChildrenByKey(orNode.children[0].key)}>
                        <img src={removeIcon} alt="x" class="remove-icon-label" />
                        <strong>{truncateLabel(orNode.children[0].key)}</strong>
                    </button>

                    <div class="arrow">
                        {@html (orNode.children[0].key.startsWith("!")) ? '≠' : '→'}
                      </div>


                    <div class="value">
                        {#each orNode.children as child}
                        <button class="value-item" on:click={() => handleRemoveInnerOr(child.key, child.value)}>
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

<div class="box_style box_level3">
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

    .grid-container {
        display: grid;
        grid-template-columns: 4fr 1fr 4fr;
        align-items: flex-start;
        margin-bottom: 2px;
    }

    .query-output {
        max-height: 180px;
        min-height: 180px;
        overflow-y: auto;
    }

    .label-item, .value-item {
        display: inline-flex;
        align-items: center;
        border: none;
        background: transparent;
        cursor: pointer;
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

    .more-values {
        font-style: italic;
        color: grey;
        margin-left: 8px;
    }
</style>
