<script lang="ts">
	// @ts-nocheck
	import { get } from 'svelte/store';
	import { t } from '../../store/languageStore';
	import { onMount } from 'svelte';
	import type { LensDataPasser } from '@samply/lens';
	import { reloadOnly } from '../../store/reloadStore.js';
	import { certificationCases, type QueryConfig } from '../../config/quicktools';
	import { iconPath } from '$lib/path-utils';
	import type { AggregatedValue } from '../../types/query';

	// Reactive translation function
	const translate = (key: string): string => get(t)(key);

	let dataPasser: LensDataPasser;

	onMount(async () => {
		await import('@samply/lens');
	});

	type QueryItem = {
		id: string;
		key: string;
		name: string;
		type: string;
		system?: string;
		values: QueryValue[];
		description?: string;
	};

	type QueryValue = {
		name: string;
		value: string | { min: number; max: number } | AggregatedValue[][];
		queryBindId: string;
		description?: string;
	};

	const addItem = (queryObject: QueryItem): void => {
		console.log('ADD ITEM', queryObject);
		dataPasser.addStratifierToQueryAPI({
			label: queryObject.values[0].value,
			catalogueGroupCode: queryObject.key,
			parentGroupCode: queryObject.system
		});
		console.log('Query API nach Hinzufügen:', dataPasser.getQueryAPI());
	};

	const applyCertification = (definition: QueryConfig) => {
		const queryItem: QueryItem = {
			id: definition.id,
			key: definition.key,
			name: definition.label,
			type: definition.type,
			system: definition.system,
			values: [
				{
					name: definition.label,
					value: definition.value,
					queryBindId: definition.bindId
				}
			]
		};
		addItem(queryItem);
		reloadOnly();
	};

	const plusIcon = iconPath('add.svg');
	const minusIcon = iconPath('minus.svg');
</script>

<lens-data-passer bind:this={dataPasser} />

<div class="grid-container-case">
    {#each certificationCases as cert (cert.id)}
        <div class={cert.layoutClass}>
            <label>{$t(cert.translationKey)}</label>
            <div class="buttons">
                <img src={plusIcon} class="iconRound" alt="add" on:click={() => applyCertification(cert.positive)} />
                <img src={minusIcon} class="iconRound" alt="remove" on:click={() => applyCertification(cert.negative)} />
            </div>
        </div>
    {/each}
</div>

<style>
    .grid-container-case {
        display: grid;
        position: relative;
        overflow: hidden;
        grid-area: grid-container-quicktools;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: auto auto;
        grid-template-areas:
            "primaer rezidiv"
            "zentrum intern";
        column-gap: 2px;
        row-gap: 4px;
        margin-right: 2px
    }

    .primaer,
    .rezidiv,
    .zentrum,
    .intern {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        min-width: 0;
    }

    .buttons {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: 11px;
        column-gap: 4px;
        justify-content: end;
        align-items: center;
        margin-right: 10px;
        flex-shrink: 0;
    }

    .iconRound {
        width: 8px;
        height: 8px;
        min-width: 8px;
        min-height: 8px;
        display: block;
        cursor: pointer;
        object-fit: contain;
    }

    label {
        min-width: 0;
        line-height: 1.2;
        word-break: keep-all;
        overflow-wrap: normal;
    }
</style>
