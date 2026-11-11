<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import type { LensDataPasser } from '@samply/lens';
	import { CATALOGUE_CONTEXT, type CatalogueReader } from '$lib/catalogue-context';
	import { datePickerParts, datePickerRange } from '$lib/datePickerRange.js';
	import { formatDateForInput } from '$lib/filterDateInput.js';
	import { createFieldIndex, parseEditorField } from '$lib/filterEditorModel.js';
	import { datePickerStore, toggleDatePicker } from '../store/datePickerStore';
	import { locale, t } from '../store/languageStore';
	import { reloadOnly } from '../store/reloadStore';
	import { addRangeQueryItem } from '../tableFilterItems';

	const comparisons = [
		['=', 'datePickerExact'],
		['>=', 'datePickerFromInclusive'],
		['>', 'datePickerAfter'],
		['<=', 'datePickerUntilInclusive'],
		['<', 'datePickerBefore'],
		['[]', 'datePickerBetween']
	] as const;
	type Operator = (typeof comparisons)[number][0];
	type Side = 'start' | 'end';
	const sides: Side[] = ['start', 'end'];
	const initial = datePickerParts($datePickerStore.selectedDate ?? new Date().toLocaleDateString('de-DE'));
	const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
	const months = days.slice(0, 12);
	const newestYear = Math.max(new Date().getFullYear(), Number(initial.year));
	const oldestYear = Math.min(1900, Number(initial.year));
	const years = Array.from({ length: newestYear - oldestYear + 1 }, (_, i) => String(newestYear - i));
	const readCatalogue = getContext<CatalogueReader>(CATALOGUE_CONTEXT);

	let dialog: HTMLDialogElement;
	let dataPasser: LensDataPasser;
	let ready = false;
	let operator: Operator = '=';
	let precision = 'date';
	let dates = { start: initial, end: initial };
	let hasRange = false;
	let singleSide: Side = 'start';
	let fieldUnavailable = false;

	onMount(async () => {
		dialog.showModal();
		await import('@samply/lens');
		ready = true;
	});

	function changeOperator(next: Operator) {
		if (next === '[]') hasRange = true;
		else if (next !== '=' || operator === '[]') singleSide = next.startsWith('<') ? 'end' : 'start';
		operator = next;
	}

	function editDate(side: Side, part: keyof typeof initial, value: string) {
		const next = { ...dates[side], [part]: value };
		// Until a range is opened, every single-date comparison shares the same input.
		dates = hasRange ? { ...dates, [side]: next } : { start: next, end: next };
	}

	$: rows = operator === '[]' ? sides : [singleSide];
	$: range = datePickerRange(operator, precision === 'year', dates[rows[0]], dates.end);
	$: invalidDay = rows.some((side) => !datePickerRange('=', precision === 'year', dates[side]));

	function addDate() {
		if (!range || !ready) return;
		const { collection, typeOfDate, onConfirm } = $datePickerStore;
		const system = collection === 'histology' ? 'diagnosis' : collection;
		const field = parseEditorField(`${typeOfDate}(${system})`, createFieldIndex(readCatalogue()));
		if (!field || field.fieldType !== 'date') {
			fieldUnavailable = true;
			return;
		}
		if (onConfirm?.() === false) return;
		const format = new Intl.DateTimeFormat($locale, {
			timeZone: 'UTC'
		}).format;
		const { min, max } = range;
		let label: string;
		const display = (bound: number) => format(Date.parse(formatDateForInput(bound)));
		if (min === null) label = `≤ ${display(max)}`;
		else if (max === null) label = `≥ ${display(min)}`;
		else label = min === max ? display(min) : `${display(min)} – ${display(max)}`;
		addRangeQueryItem(dataPasser, field, { name: label, value: range });
		reloadOnly();
		toggleDatePicker(false);
	}
</script>

<lens-data-passer bind:this={dataPasser} />
<dialog
	class="disclaimer box_style box_level4"
	bind:this={dialog}
	aria-labelledby="date-filter-title"
	on:cancel={() => toggleDatePicker(false)}
>
	<h2 id="date-filter-title">{$t('datePickerTitle', { field: $datePickerStore.fieldLabel || $datePickerStore.typeOfDate })}</h2>
	<div class="precision">
		<label><input type="radio" name="dateOption" value="date" bind:group={precision} /> {$t('date')}</label>
		<label><input type="radio" name="dateOption" value="year" bind:group={precision} /> {$t('year')}</label>
	</div>
	<label for="date-comparison">{$t('datePickerComparison')}</label>
	<select
		id="date-comparison"
		class="operator-select input-field"
		value={operator}
		on:change={(event) => changeOperator(comparisons[event.currentTarget.selectedIndex][0])}
	>
		{#each comparisons as [value, label]}
			<option {value}>{$t(label)}</option>
		{/each}
	</select>
	{#each rows as side (side)}
		<fieldset class:upperRow={side === 'start'} class:lowerRow={side === 'end'}>
			<legend>{operator === '[]'
				? $t(side === 'start' ? 'datePickerStart' : 'datePickerEnd')
				: $t(precision)}</legend>
			<div class="parts">
				{#if precision === 'date'}
					<label>{$t('day')}
						<select class="input-field" value={dates[side].day} on:change={(e) => editDate(side, 'day', e.currentTarget.value)}>
							{#each days as day}<option value={day}>{day}</option>{/each}
						</select>
					</label>
					<label>{$t('month')}
						<select class="input-field" value={dates[side].month} on:change={(e) => editDate(side, 'month', e.currentTarget.value)}>
							{#each months as month}<option value={month}>{month}</option>{/each}
						</select>
					</label>
				{/if}
				<label>{$t('year')}
					<select class="input-field" value={dates[side].year} on:change={(e) => editDate(side, 'year', e.currentTarget.value)}>
						{#each years as year}<option value={year}>{year}</option>{/each}
					</select>
				</label>
			</div>
		</fieldset>
	{/each}
	{#if !range || fieldUnavailable}
		<p role="alert">{$t(!range ? (invalidDay ? 'datePickerInvalidDay' : 'datePickerReversed') : 'datePickerUnavailable')}</p>
	{/if}
	<div class="actions">
		<button type="button" on:click={() => toggleDatePicker(false)}>{$t('cancel')}</button>
		<button type="button" class="confirm-button" disabled={!range || !ready} on:click={addDate}>{$t('datePickerApply')}</button>
	</div>
</dialog>

<style>
	dialog {
		box-sizing: border-box;
		width: min(26rem, calc(100vw - 2rem));
		max-height: calc(100dvh - 2rem);
		margin: auto;
		padding: 1rem;
		color: var(--font-color);
	}
	dialog::backdrop { background: rgb(0 0 0 / 50%); }
	h2 { margin: 0 0 0.75rem; font-size: 1.15rem; overflow-wrap: anywhere; }
	.precision, .parts, .actions { display: flex; gap: 0.75rem; }
	.precision { margin-bottom: 0.75rem; }
	select { margin-top: 0.2rem; }
	fieldset { margin: 0.75rem 0 0; border: 1px solid var(--border-color); border-radius: 5px; }
	legend { padding: 0 0.3rem; }
	.parts > label { flex: 1; min-width: 0; }
	.parts { padding: 0.25rem 0; }
	.actions { margin-top: 1rem; justify-content: flex-end; }
	.actions button { cursor: pointer; padding: 0.45rem 0.8rem; }
	.actions button:disabled { cursor: not-allowed; opacity: 0.6; }
</style>
