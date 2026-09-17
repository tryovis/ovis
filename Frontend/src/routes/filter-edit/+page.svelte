<script lang="ts">
	// @ts-nocheck
	import { writable, get } from 'svelte/store';
	import { onMount, onDestroy } from 'svelte';
	import { getValueOptions } from '../../graphQl/gql-filter-edit';
	import type { LensDataPasser } from '@samply/lens';
	import { reloadOnly } from '../../store/reloadStore.js';
	import { getUser, updateUser } from '../../graphQl/gql-userManagement';
	import { userStore } from '../../store/userStore';
	import { t } from '../../store/languageStore';
	import { appPath, iconPath, apiPath } from '$lib/path-utils';
	import { authenticatedFetch } from '$lib/request-auth';
	import { formatDateForInput, parseDateInput } from '$lib/filterDateInput';
	import { createFilterEditorOptions } from '$lib/filterEditorOptions';
	import {
		createFieldIndex,
		parseEditorField,
		isDateField,
		isEditableAst,
		validateEditorAst,
		serializeEditorAst,
		createEditorValue
	} from '$lib/filterEditorModel';

	let currentRole = '';
	let currentUser = '';
	const unsubscribeUser = userStore.subscribe((value: any) => {
		({ currentRole, currentUser } = value);
	});
	let dataPasser: LensDataPasser;
	const emptyGroup = () => ({
		operand: 'OR',
		children: [{ key: '', system: '', type: 'EQUALS', value: '' }]
	});
	const defaultAst = () => ({
		operand: 'OR',
		children: [{ operand: 'AND', children: [emptyGroup()] }]
	});
	const currentAst = writable(defaultAst());
	let availableKeys = [];
	let fieldIndex = new Map();
	let username = '';
	let ready = false;
	let destroyed = false;
	let saving = false;
	let editorError = '';
	let saveError = '';
	let editable = true;
	let keyDrafts = new Map();
	let invalidKeyGroups = new Set();
	let invalidValueNodes = new Map();
	let suggestionSearch = new Map();
	const isConsistent = writable(false);
	const inconsistentFields = writable([]);
	const valueOptionsCache = writable({});
	const options = createFilterEditorOptions(getValueOptions, {
		onChange: (key, system, values) =>
			valueOptionsCache.update((cache) => ({ ...cache, [`${key}(${system})`]: values }))
	});
	const removeIcon = iconPath('times-circle.svg');
	const plusIcon = iconPath('plus.png');
	const emptyIcon = iconPath('empty.svg');
	const filterIcon = iconPath('filter_on.svg');
	const backIcon = iconPath('back.svg');
	const saveIcon = iconPath('save.svg');
	const infoIcon = iconPath('info-outlined.svg');
	const loadingIcon = iconPath('spinner.svg');
	const PAGE_SIZE = 10;
	let consistencyTimer;

	function checkConsistency() {
		const ast = get(currentAst);
		const liveNodes = new Set(
			ast.children.flatMap((branch) => branch.children.flatMap((group) => group.children))
		);
		invalidValueNodes = new Map([...invalidValueNodes].filter(([node]) => liveNodes.has(node)));
		const result = validateEditorAst(ast, fieldIndex);
		inconsistentFields.set([...result.inconsistentFields, ...invalidValueNodes.keys()]);
		const valid =
			ready &&
			editable &&
			!editorError &&
			invalidKeyGroups.size === 0 &&
			invalidValueNodes.size === 0 &&
			result.valid;
		isConsistent.set(valid);
		return valid;
	}
	function scheduleConsistencyCheck() {
		clearTimeout(consistencyTimer);
		consistencyTimer = setTimeout(() => {
			if (!destroyed) checkConsistency();
		}, 150);
	}
	function changed() {
		saveError = '';
		currentAst.update((ast) => ({ ...ast }));
		scheduleConsistencyCheck();
	}
	function updateRange(child, bound, event) {
		const input = event.target;
		if (!input.validity.valid) {
			// Native inputs expose an incomplete number/date as an empty value too.
			// Preserve its draft error instead of interpreting it as an open bound.
			invalidValueNodes.set(child, (invalidValueNodes.get(child) ?? new Set()).add(bound));
			checkConsistency();
			return;
		}
		invalidValueNodes.get(child)?.delete(bound);
		if (!invalidValueNodes.get(child)?.size) invalidValueNodes.delete(child);
		if (!child.value || typeof child.value !== 'object') child.value = { min: null, max: null };
		child.value[bound] =
			input.value === ''
				? null
				: isDateField(child, fieldIndex)
				? parseDateInput(input.value)
				: Number(input.value);
		changed();
	}
	function getPage(group) {
		return group?._page ?? 0;
	}
	function clampPage(group) {
		group._page = Math.min(
			Math.max(0, getPage(group)),
			Math.max(0, Math.ceil(group.children.length / PAGE_SIZE) - 1)
		);
	}
	function setPage(group, page) {
		group._page = page;
		clampPage(group);
		changed();
	}
	function pageStart(group) {
		return getPage(group) * PAGE_SIZE;
	}
	function pageEnd(group) {
		return Math.min(pageStart(group) + PAGE_SIZE, group.children.length);
	}
	function pageChildren(group) {
		return group.children.slice(pageStart(group), pageStart(group) + PAGE_SIZE);
	}
	function keyText(group, drafts) {
		const first = group.children[0];
		return drafts.get(group) ?? (first.key ? `${first.key}(${first.system})` : '');
	}
	function valueOptionsId(group, andIndex, orIndex) {
		const first = group.children[0];
		return `valueOptions-${andIndex}-${orIndex}-${encodeURIComponent(
			first.system
		)}-${encodeURIComponent(first.key)}`;
	}
	function valueSuggestions(group, searches, _cache) {
		const first = group.children[0];
		return options.suggestions(first.key, first.system, searches.get(group) ?? '');
	}
	function showSuggestions(group, value = '') {
		suggestionSearch = new Map(suggestionSearch).set(group, String(value ?? ''));
		loadOptions(group);
	}
	function loadOptions(group) {
		const first = group.children[0];
		if (first?.key && ['EQUALS', 'NEQUALS'].includes(first.type))
			options.load(first.key, first.system);
	}

	onMount(async () => {
		username = new URLSearchParams(window.location.search).get('user') || '';
		if (username && !['admin', 'super-admin'].includes(currentRole)) return;
		try {
			await import('@samply/lens');
			if (destroyed) return;
			const catalogueResponse = await authenticatedFetch(apiPath('catalogue'));
			if (!catalogueResponse.ok) throw new Error('Catalogue unavailable');
			const { data } = await catalogueResponse.json();
			if (destroyed) return;
			fieldIndex = createFieldIndex(data);
			availableKeys = [...fieldIndex.values()]
				.map((field) => `${field.key}(${field.system})`)
				.filter((key) => !key.startsWith('!'));
			let ast = dataPasser.getAstAPI();
			if (username) {
				const users = await getUser();
				if (destroyed) return;
				const target = users.find((user) => user._id === username);
				if (!target) throw new Error('User not found');
				const saved = target.userFilter?.at(-1);
				ast = saved ? JSON.parse(saved) : { operand: 'OR', children: [] };
			}
			editable = isEditableAst(ast);
			if (!editable) {
				editorError =
					'Dieser Filter enthält Gruppierungen, die hier nicht bearbeitet werden können.';
				return;
			}
			currentAst.set(structuredClone(ast.children.length ? ast : defaultAst()));
			ready = true;
			for (const group of get(currentAst).children.flatMap((branch) => branch.children))
				loadOptions(group);
			checkConsistency();
		} catch {
			if (!destroyed)
				editorError = 'Der Filter konnte nicht geladen werden. Bitte die Seite erneut öffnen.';
		}
	});
	onDestroy(() => {
		destroyed = true;
		clearTimeout(consistencyTimer);
		options.dispose();
		unsubscribeUser();
	});

	function updateKeySystem(group, text) {
		keyDrafts = new Map(keyDrafts).set(group, text);
		const field = parseEditorField(text, fieldIndex);
		if (!field) {
			invalidKeyGroups = new Set(invalidKeyGroups).add(group);
			changed();
			checkConsistency();
			return;
		}
		invalidKeyGroups.delete(group);
		invalidKeyGroups = new Set(invalidKeyGroups);
		const first = group.children[0];
		if (first.key !== field.key || first.system !== field.system) {
			const now = parseDateInput(formatDateForInput(Date.now()));
			group.children = [
				{
					key: field.key,
					system: field.system,
					type: field.type,
					value: field.type.includes('BETWEEN')
						? {
								min: isDateField(field, fieldIndex) ? now : 1,
								max: isDateField(field, fieldIndex) ? now : 999999
						  }
						: ''
				}
			];
			group._page = 0;
		}
		loadOptions(group);
		changed();
	}
	function toggleOperatorForOR(group) {
		if (invalidKeyGroups.has(group)) return;
		for (const child of group.children) {
			const negative = ['NEQUALS', 'NBETWEEN'].includes(child.type);
			child.key = `${negative ? '' : '!'}${child.key.replace(/^!/, '')}`;
			child.type = negative ? child.type.slice(1) : `N${child.type}`;
		}
		keyDrafts.delete(group);
		keyDrafts = new Map(keyDrafts);
		changed();
	}
	function getComparisonSymbol(child) {
		return child.type.startsWith('N') ? '≠' : '=';
	}
	function addInnerOR(group) {
		group.children.push(createEditorValue(group.children[0]));
		group._page = Math.floor((group.children.length - 1) / PAGE_SIZE);
		changed();
	}
	function resetInnerORToMissing(group) {
		const first = group.children[0];
		group.children = [
			{ ...first, value: first.type.includes('BETWEEN') ? { min: null, max: null } : '-' }
		];
		group._page = 0;
		changed();
	}
	function removeInnerORAt(group, index, branch, ast) {
		group.children.splice(index, 1);
		if (!group.children.length) removeAND(group, branch, ast);
		else {
			clampPage(group);
			changed();
		}
	}
	function removeAND(group, branch, ast) {
		branch.children = branch.children.filter((candidate) => candidate !== group);
		invalidKeyGroups.delete(group);
		keyDrafts.delete(group);
		suggestionSearch.delete(group);
		if (!branch.children.length)
			ast.children = ast.children.filter((candidate) => candidate !== branch);
		changed();
	}
	function removeOuterOR(branch) {
		for (const group of branch.children) {
			invalidKeyGroups.delete(group);
			keyDrafts.delete(group);
			suggestionSearch.delete(group);
		}
		currentAst.update((ast) => ({
			...ast,
			children: ast.children.filter((candidate) => candidate !== branch)
		}));
		changed();
	}
	function addAND(branch) {
		branch.children.push(emptyGroup());
		changed();
	}
	function addOuterOR() {
		currentAst.update((ast) => ({
			...ast,
			children: [...ast.children, { operand: 'AND', children: [emptyGroup()] }]
		}));
		changed();
	}
	function goBack() {
		window.history.back();
	}
	async function saveChanges() {
		clearTimeout(consistencyTimer);
		if (saving || !checkConsistency()) return;
		if (username && !['admin', 'super-admin'].includes(currentRole)) return;
		saving = true;
		saveError = '';
		try {
			const updatedAst = serializeEditorAst(get(currentAst));
			if (username) {
				const result = await updateUser(username, {
					userFilter: updatedAst,
					lastModifiedBy: currentUser
				});
				if (!result?.acknowledged || result.matchedCount !== 1)
					throw new Error('User filter was not saved');
				if (!destroyed) window.location.href = appPath('/user-management');
			} else {
				dataPasser.setQueryStoreFromAstAPI(JSON.parse(updatedAst));
				reloadOnly();
				goBack();
			}
		} catch {
			if (!destroyed)
				saveError =
					'Der Filter konnte nicht gespeichert werden. Deine Eingaben bleiben erhalten; bitte erneut versuchen.';
		} finally {
			if (!destroyed) saving = false;
		}
	}
</script>

<lens-data-passer bind:this={dataPasser} />
<!-- Template -->

{#if username && !['admin', 'super-admin'].includes(currentRole)}
	As a normal "user" you do not have permission to change specific user permissions.
{:else}
	<div class="box_style box_level1 table-chart">
		<h1 style="padding-left:10px">
			Filter {$t('edit')}
			{username ? `(${username})` : ''}
			<img
				src={filterIcon}
				alt="info"
				style="height:40px;vertical-align: text-bottom;"
				class="menuebar-icon"
			/>
			<button on:click={goBack} class="iconRoundButton">
				<img src={backIcon} alt="back" class="iconRound" />
			</button>
			<button class="iconRoundButton infotooltip">
				<span class="infotooltiptext">{@html $t('tooltip_FilterEdit')}</span>
				<img src={infoIcon} alt="info" class="iconRound" />
			</button>
		</h1>
	</div>
	{#if editorError}
		<p role="alert">{editorError}</p>
	{:else if !ready}
		<div class="bigSpinnerContainer editor-loading" role="status">
			<img class="bigSpinner" id="spinner" src={loadingIcon} alt="" aria-hidden="true" />
			<p>Filter wird geladen …</p>
		</div>
	{:else}
		<datalist id="keyOptions">
			{#each availableKeys as option}<option value={option} />{/each}
		</datalist>
		<fieldset
			disabled={!ready || saving || !editable}
			class="box_style box_level3 editor-fields"
			style="height: 600px; overflow: auto;"
		>
			{#if $currentAst}
				{#each $currentAst.children as innerAND, innerANDindex}
					{#if innerANDindex > 0}
						<strong>OR</strong>
					{/if}
					<div class="box_style box_level2">
						{#each innerAND.children as innerOR, innerORindex}
							{#if innerORindex > 0}
								<strong>AND</strong>
							{/if}
							<div class="box_style box_level3" style="margin-bottom: 10px;">
								<div>
									{#if innerOR.children.length > 0}
										<div>
											<!-- Key-Dropdown mit Event-Handler zum Ändern des Key-Systems -->
											<input
												list="keyOptions"
												value={keyText(innerOR, keyDrafts)}
												class:inconsistent-field={invalidKeyGroups.has(innerOR)}
												on:input={(event) => {
													updateKeySystem(innerOR, event.target.value);
												}}
												on:change={(event) => {
													updateKeySystem(innerOR, event.target.value);
												}}
											/>

											{#if innerAND.children.length > 1}
												<button
													class="iconRoundButton tooltip"
													on:click={() => removeAND(innerOR, innerAND, $currentAst)}
												>
													<img src={removeIcon} alt="remove" class="iconRound" />
													<span class="tooltiptext">Kategorie entfernen</span>
												</button>
											{/if}

											<!-- Button zur Umschaltung des Vergleichsoperators für alle Kinder eines OR-Knotens -->
											<button class="operator-button" on:click={() => toggleOperatorForOR(innerOR)}>
												{getComparisonSymbol(innerOR.children[0])}
											</button>

											{#if innerOR.children.length > PAGE_SIZE}
												<div class="inneror-pagination">
													<small
														>Zeige {pageStart(innerOR) + 1}-{pageEnd(innerOR)} von {innerOR.children
															.length}</small
													>
													<button
														class="iconRoundButton"
														disabled={getPage(innerOR) === 0}
														on:click={() => setPage(innerOR, getPage(innerOR) - 1)}>◀</button
													>
													<button
														class="iconRoundButton"
														disabled={pageEnd(innerOR) >= innerOR.children.length}
														on:click={() => setPage(innerOR, getPage(innerOR) + 1)}>▶</button
													>
												</div>
											{/if}

											{#each pageChildren(innerOR) as child, idx (pageStart(innerOR) + idx)}
												{#if child.type === 'BETWEEN' || child.type === 'NBETWEEN'}
													{#if isDateField(child, fieldIndex)}
														<!-- Date inputs: allow nulls (empty field) -->
														<input
															type="date"
															class:inconsistent-field={$inconsistentFields.includes(child)}
															value={formatDateForInput(child?.value?.min)}
															on:input={(event) => updateRange(child, 'min', event)}
														/>
														<input
															type="date"
															class:inconsistent-field={$inconsistentFields.includes(child)}
															value={formatDateForInput(child?.value?.max)}
															on:input={(event) => updateRange(child, 'max', event)}
														/>
													{:else}
														<!-- Number inputs: allow nulls (empty field) -->
														<input
															type="number"
															step="any"
															class:inconsistent-field={$inconsistentFields.includes(child)}
															value={child?.value?.min ?? ''}
															on:input={(event) => updateRange(child, 'min', event)}
														/>
														<input
															type="number"
															step="any"
															class:inconsistent-field={$inconsistentFields.includes(child)}
															value={child?.value?.max ?? ''}
															on:input={(event) => updateRange(child, 'max', event)}
														/>
													{/if}
												{:else}
													<!-- Standardwert für EQUALS -->
													<input
														list={valueOptionsId(innerOR, innerANDindex, innerORindex)}
														value={child.value ?? ''}
														on:focus={() => showSuggestions(innerOR, child.value)}
														style="margin-right: 10px;"
														class={$inconsistentFields.includes(child) ? 'inconsistent-field' : ''}
														on:input={(event) => {
															child.value = event.target.value; // ✅ Update child value dynamically
															showSuggestions(innerOR, child.value);
															scheduleConsistencyCheck(); // ✅ Re-run consistency check
														}}
													/>
												{/if}

												{#if innerOR.children.length > 1}
													<button
														class="iconRoundButton tooltip"
														on:click={() =>
															removeInnerORAt(
																innerOR,
																pageStart(innerOR) + idx,
																innerAND,
																$currentAst
															)}
													>
														<img src={removeIcon} alt="remove" class="iconRound" />
														<span class="tooltiptext">Wert entfernen</span>
													</button>
												{/if}

												{#if idx < pageChildren(innerOR).length - 1}
													<span style="margin-right: 10px;"><b>OR</b></span>
												{/if}
											{/each}
											{#if ['EQUALS', 'NEQUALS'].includes(innerOR.children[0].type)}
												<datalist id={valueOptionsId(innerOR, innerANDindex, innerORindex)}>
													{#each valueSuggestions(innerOR, suggestionSearch, $valueOptionsCache) as option}<option
															value={option}
														/>{/each}
												</datalist>
											{/if}
											<button
												class="iconRoundButton tooltip"
												on:click={() => resetInnerORToMissing(innerOR)}
											>
												<img src={emptyIcon} alt="empty" class="iconRound" />
												<span class="tooltiptext"
													>Feld leeren (setzt Datum zu null/null, String zu "-")</span
												>
											</button>
											<button
												class="iconRoundButton tooltip"
												on:click={() =>
													addInnerOR(
														innerOR,
														`${innerOR.children[0].key}(${innerOR.children[0].system})`
													)}
											>
												<img src={plusIcon} alt="add" class="iconRound" />
												<span class="tooltiptext">Neuen Wert hinzufügen (Inner ORx)</span>
											</button>
										</div>
									{/if}
								</div>
							</div>
						{/each}
						{#if $currentAst.children.length > 1}
							<button class="iconRoundButton tooltip" on:click={() => removeOuterOR(innerAND)}>
								<img src={removeIcon} alt="remove" class="iconRound" />
								<span class="tooltiptext">Komplette Gruppe entfernen (Outer OR)</span>
							</button>
						{/if}
						<button class="iconRoundButton tooltip" on:click={() => addAND(innerAND)}>
							<img src={plusIcon} alt="add" class="iconRound" />
							<span class="tooltiptext">Neue Bedingung hinzufügen (AND)</span>
						</button>
					</div>
				{/each}
				<button class="iconRoundButton tooltip" on:click={() => addOuterOR()}>
					<img src={plusIcon} alt="add" class="iconRound" />
					<span class="tooltiptext">Neue Gruppe hinzufügen (OR)</span>
				</button>
			{/if}
		</fieldset>

		<!-- Save-Button -->
		<div class="box_style box_level2 table-chart" style="display: flex; align-items: center;">
			<b>{$t('saveAndContinue')}:</b>
			<div style="display: flex; align-items: center; margin-left: 10px;">
				<button
					style="background-color: {$isConsistent
						? '#A8D5A5'
						: '#D55A5A'}; font-weight: bold; padding: 2px; margin-right: 10px; border-radius: 20px; display: flex; align-items: center; justify-content: center;"
					class="iconRoundButton"
					disabled={!ready || saving || !$isConsistent}
					on:click={saveChanges}
				>
					<img
						src={saveIcon}
						alt="save"
						style="height: 30px; padding: 2px; display: block; margin: auto;"
						class="menuebar-icon"
					/>
				</button>

				<!-- Bedingter Text bei inkonsistentem Zustand, auf derselben Linie -->
				{#if ready && !$isConsistent}
					<p style="color: red; font-style: italic; margin-left: 10px;">
						Zustand inkonsistent - speichern nicht möglich
					</p>
				{/if}
			</div>
		</div>
		{#if saveError}<p role="alert">{saveError}</p>{/if}
	{/if}
{/if}

<style>
	.editor-loading {
		height: 600px;
		flex-direction: column;
		gap: 1rem;
	}
	.editor-loading .bigSpinner {
		max-width: 7rem;
	}
	.editor-loading p {
		margin: 0;
	}
	.editor-fields {
		min-width: 0;
		margin-inline: 0;
	}
	.box_style {
		border: 1px solid var(--border-color);
		padding: 10px;
		margin-bottom: 10px;
	}
	.box_level1 {
		background-color: var(--level1-bg);
	}
	.box_level2 {
		background-color: var(--level2-bg);
		padding-left: 20px;
	}
	.iconRoundButton {
		border: none;
		background: none;
		cursor: pointer;
	}
	.iconRound {
		width: 1em;
		height: 1em;
	}
	.tooltip {
		position: relative;
		display: inline-block;
	}
	.tooltip .tooltiptext {
		visibility: hidden;
		height: 12px;
		background-color: black;
		color: #fff;
		text-align: center;
		border-radius: 5px;
		padding: 5px;
		position: absolute;
		z-index: 1;
		bottom: 100%;
		left: 50%;
		margin-left: -20px;
		opacity: 0;
		transition: opacity 0.3s;
	}
	.tooltip:hover .tooltiptext {
		visibility: visible;
		opacity: 1;
	}

	.inconsistent-field {
		background-color: #ffe6e6; /* Hellrot */
		border: 1px solid #ff9999; /* Dunkelrot für den Rand */
	}

	.operator-button {
		font-size: 14px; /* Größere Schriftgröße */
		margin: 10px 20px; /* Mehr Platz links und rechts */
		cursor: pointer; /* Zeiger beim Überfahren */
		border-radius: 12px; /* Abgerundete Ecken */
		border: 2px solid var(--border-color); /* Dezente Rahmenfarbe */
		background-color: var(--dropdown-bg); /* Weißer Hintergrund */
		color: var(--font-color);
		box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1); /* Leichter Schatten */
		transition: background-color 0.3s ease; /* Glatte Übergänge bei Hover */
	}

	.operator-button:hover {
		background-color: var(--dropdown-hover); /* Leicht grauer Hintergrund beim Hover */
	}

	.infotooltip {
		position: relative;
	}

	.infotooltip .infotooltiptext {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		width: 10rem;
	}

	.infotooltip .infotooltiptext {
		visibility: hidden;
		background-color: rgba(0, 0, 0, 0.8);
		color: var(--tooltip-color);
		text-align: center;
		border-radius: 6px;
		padding: 5px;

		/* Position the tooltip relative to the container */
		position: absolute;
		z-index: 999;
		top: 100%; /* Abstand vom übergeordneten Element */

		max-width: 400px;
		width: auto; /* Damit der Tooltip sich an den Inhalt anpasst */

		transition: opacity 0.5s; /* Hinzugefügte Übergangseigenschaft */
		opacity: 0; /* Anfangszustand: Tooltip ist unsichtbar */
		white-space: nowrap; /* Kein Zeilenumbruch */
	}

	.infotooltip:hover .infotooltiptext {
		visibility: visible;
		opacity: 1; /* Tooltip wird sichtbar mit Fade-In-Effekt */
	}

	.inneror-pagination {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin: 6px 0 8px 0;
		padding: 4px 6px;
		border: 1px dashed #ddd;
		border-radius: 8px;
	}
</style>
