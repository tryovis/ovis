<script lang="ts">
	// @ts-nocheck
	import { writable, get } from 'svelte/store';
	import { onMount } from 'svelte';
	import { getValueOptions, getDBMeta } from '../../graphQl/gql-filter-edit';
	import type { LensDataPasser } from '@samply/lens';
	import { reloadOnly } from '../../store/reloadStore.js';
	import { getUser, updateUser } from '../../graphQl/gql-userManagement';
	import { userStore } from '../../store/userStore';
	import { t, locale, locales } from '../../store/languageStore';
	import { appPath, iconPath, publicAssetPath } from '$lib/path-utils';

	let currentRole = '';

	userStore.subscribe((value: any) => {
		({ currentRole } = value);
	});

	let dataPasser: LensDataPasser;
	// Reaktives AST-Objekt
	let defaultAst = {
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
	};

	let currentAst = writable(structuredClone(defaultAst));

	// Dynamisches availableKeys-Array
	let availableKeys = writable<string[]>([]);
	let keysAndSystems = writable<{ key: string; system: string }[]>([]);
	let keysAndTypes = writable<{ key: string; system: string; type: string }[]>([]);

	// Funktion zur Erstellung von availableKeys und keysAndSystems aus dbMeta-Daten
	async function buildKeysAndSystems() {
		const response = await fetch(publicAssetPath('/ovis-catalogue.json')); // Pfad anpassen
		const catalogueData = await response.json();

		let keys = [];
		let keysSystems = [];
		let keysWithTypes = [];

		catalogueData.forEach((category) => {
			category.childCategories.forEach((field) => {
				let keyFormat = `${field.key}(${field.system})`;
				keys.push(keyFormat);
				keysSystems.push({ key: field.key, system: field.system });
				keysWithTypes.push({ key: field.key, system: field.system, type: field.type });
			});
		});
		console.log(keys);
		// console.log(keysSystems)
		// console.log(keysWithTypes)
		return { keys, keysSystems, keysWithTypes };
	}

	const removeIcon = iconPath('times-circle.svg');
	const plusIcon = iconPath('plus.png');
	const emptyIcon = iconPath('empty.svg');
	const copyIcon = iconPath('copy.svg');
	const filterIcon = iconPath('filter_on.svg');
	const backIcon = iconPath('back.svg');
	const saveIcon = iconPath('save.svg');
	const infoIcon = iconPath('info-outlined.svg');

	// Reaktive Variable zur Überprüfung der Konsistenz der Eingaben
	let isConsistent = writable(true);
	let inconsistentFields = writable([]); // Speichert die inkonsistenten Felder

	// -------- Performance helpers (Pagination + debounced validation) --------
	const PAGE_SIZE = 10;

	let consistencyTimer: any;
	function scheduleConsistencyCheck() {
		clearTimeout(consistencyTimer);
		consistencyTimer = setTimeout(() => checkConsistency(), 150);
	}

	function getPage(innerOR: any): number {
		return innerOR?._page ?? 0;
	}

	function setPage(innerOR: any, page: number) {
		innerOR._page = Math.max(0, page);
		currentAst.update((ast) => ({ ...ast }));
	}

	function clampPage(innerOR: any) {
		const total = innerOR?.children?.length ?? 0;
		const maxPage = Math.max(0, Math.floor((total - 1) / PAGE_SIZE));
		if ((innerOR?._page ?? 0) > maxPage) innerOR._page = maxPage;
		if ((innerOR?._page ?? 0) < 0) innerOR._page = 0;
	}

	function pageStart(innerOR: any): number {
		return getPage(innerOR) * PAGE_SIZE;
	}
	function pageEnd(innerOR: any): number {
		const start = pageStart(innerOR);
		const total = innerOR?.children?.length ?? 0;
		return Math.min(start + PAGE_SIZE, total);
	}
	function pageChildren(innerOR: any): any[] {
		const start = pageStart(innerOR);
		return (innerOR?.children ?? []).slice(start, start + PAGE_SIZE);
	}

	// Remove by index (stable + fast) instead of filtering by value (value can be duplicated)
	function removeInnerORAt(innerOR: any, idx: number, parentAND: any, rootAST: any) {
		innerOR.children.splice(idx, 1);

		if (innerOR.children.length === 0) {
			parentAND.children = parentAND.children.filter((child: any) => child !== innerOR);
		}

		if (parentAND.children.length === 0) {
			rootAST.children = rootAST.children.filter((child: any) => child !== parentAND);
		}

		clampPage(innerOR);
		currentAst.update((ast) => ({ ...ast }));
		scheduleConsistencyCheck();
	}

	function checkConsistency() {
		let consistent = true;
		let inconsistents = [];

		get(currentAst).children.forEach((innerAND) => {
			innerAND.children.forEach((innerOR) => {
				const childrenToCheck =
					(innerOR?.children?.length ?? 0) > PAGE_SIZE
						? pageChildren(innerOR)
						: innerOR.children || [];
				childrenToCheck.forEach((child) => {
					const keyLower = String(child.key || '').toLowerCase();
					const isDateField = keyLower.includes('date');

					if (child.type === 'BETWEEN' || child.type === 'NBETWEEN') {
						const v = child.value || {};
						const hasMin = v.min !== null && v.min !== undefined && v.min !== '';
						const hasMax = v.max !== null && v.max !== undefined && v.max !== '';
						if (hasMin && hasMax) {
							const minN = Number(v.min);
							const maxN = Number(v.max);
							if (Number.isNaN(minN) || Number.isNaN(maxN) || minN > maxN) {
								consistent = false;
								inconsistents.push(child);
							}
						}
					} else {
						const normalizedKey = (child.key || '').replace(/^!/, '');
						const hasValue = getCachedValueHasFn(normalizedKey, child.system);
						const validValues = getCachedValueOptions(normalizedKey, child.system) || [];
						const val = child.value;
						if (!child.key || !child.system) {
							consistent = false;
							inconsistents.push(child);
						} else if (val === '-') {
							// allowed sentinel
						} else if (typeof val !== 'string' || val.trim() === '') {
							consistent = false;
							inconsistents.push(child);
						} else if (validValues.length > 0 && !hasValue(val)) {
							consistent = false;
							inconsistents.push(child);
						}
					}
				});
			});
		});

		inconsistentFields.set(inconsistents);
		isConsistent.set(consistent);
	}

	let isDefaultAst;

	function isDefaultAstLike(ast: any): boolean {
		try {
			return (
				ast?.operand === 'OR' &&
				Array.isArray(ast.children) &&
				ast.children.length === 1 &&
				ast.children[0]?.operand === 'AND' &&
				Array.isArray(ast.children[0].children) &&
				ast.children[0].children.length === 1 &&
				ast.children[0].children[0]?.operand === 'OR' &&
				Array.isArray(ast.children[0].children[0].children) &&
				ast.children[0].children[0].children.length === 1 &&
				ast.children[0].children[0].children[0]?.key === 'isTumor' &&
				ast.children[0].children[0].children[0]?.system === 'diagnosis' &&
				ast.children[0].children[0].children[0]?.type === 'EQUALS' &&
				String(ast.children[0].children[0].children[0]?.value) === 'true'
			);
		} catch {
			return false;
		}
	}

	$: isDefaultAst = isDefaultAstLike($currentAst);

	// Cache für ValueOptions pro Key-System-Kombination
	let valueOptionsCache = writable({});
	// Optional: beschleunigte Membership-Checks (Set) für "kleine" Optionslisten
	const VALUESET_MAX = 50000; // darüber: keinen Set bauen (zu groß -> Membership-Check überspringen)
	const valueOptionsSetCache: Record<string, Set<string> | null> = {};
	let username = '';

	onMount(async () => {
		const params = new URLSearchParams(window.location.search);
		username = params.get('user');

		await import('@samply/lens');
		let astData = dataPasser.getAstAPI();
		if (username) {
			try {
				// Benutzer abrufen
				let userData = await getUser();
				console.log('UserData', userData);
				let user = userData.find((u) => u._id === username);
				console.log('user', user);
				if (user) {
					// Letzten gespeicherten Filter des Benutzers setzen
					let astString =
						user.userFilter && user.userFilter.length > 0
							? user.userFilter[user.userFilter.length - 1]
							: null;

					console.log('Filter für Benutzer gefunden:', astData);
					if (astString) {
						try {
							astData = JSON.parse(astString);
						} catch (e) {
							/* ignore parse */
						}
					}
				} else {
					//console.warn("Benutzer nicht gefunden:", username);
				}
			} catch (error) {
				//console.error("Fehler beim Abrufen des Benutzers:", error);
			}
		}
		console.log('astDATA', astData);

		// *** einzig relevante Änderung: genauer Entscheidungsbaum
		const isEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
		const emptyAst = { operand: 'OR', children: [] };

		if (isEqual(astData, emptyAst)) {
			// Empty-Case soll wie isTumor-Default aussehen (Screenshot 1)
			astData = structuredClone(defaultAst);
		} else if (!isEqual(astData, defaultAst)) {
			// Alle anderen Fälle wie bisher bereinigen
			astData = removeIsTumorNode(astData);
		}

		// immer setzen (auch in den Fällen oben, in denen nichts entfernt wurde)
		currentAst.set(structuredClone(astData ?? defaultAst));

		console.log('CURRENT AST', currentAst);
		try {
			//const dbMetaData = await getDBMeta();  // Hole die dbMeta-Daten
			const { keys, keysSystems, keysWithTypes } = await buildKeysAndSystems(); // Verarbeite die Daten
			availableKeys.set(keys); // Setze die dynamisch erstellten availableKeys
			keysAndSystems.set(keysSystems); // Setze das dynamische keysAndSystems
			keysAndTypes.set(keysWithTypes);
			for (let { key, system } of keysSystems) {
				//console.log(`Fetching options for key: ${key}, system: ${system}`);
				const options = await getValueOptions(key, system); // Hole die Optionen

				// Update den Cache mit den erhaltenen Optionen
				valueOptionsCache.update((cache) => {
					const updatedCache = { ...cache, [`${key}(${system})`]: options };
					//console.log("Updated cache:", updatedCache);
					return updatedCache;
				});
			}
		} catch (error) {
			// console.error("Fehler beim Laden der dbMeta-Daten oder ValueOptions:", error);
		}
	});

	function removeIsTumorNode(ast) {
		return {
			...ast,
			children: ast.children
				.map((innerAND) => ({
					...innerAND,
					children: innerAND.children.filter(
						(innerOR) => !innerOR.children.some((child) => child.key === 'isTumor')
					)
				}))
				.filter((innerAND) => innerAND.children.length > 0) // Leere AND-Knoten entfernen
		};
	}

	// Funktion zum Abrufen der Optionen aus dem Cache
	function getCachedValueOptions(key: string, system: string): string[] {
		const cache = get(valueOptionsCache);

		// Normalisiere `!`-Präfix
		const normalizedKey = key.replace(/^!/, '');

		// Hole Werte aus dem Cache oder versuche den Normalized Key
		return cache[`${key}(${system})`] || cache[`${normalizedKey}(${system})`] || [];
	}

	// Funktion zum Umschalten des Vergleichsoperators für alle Kinder eines OR-Knotens
	function toggleOperatorForOR(innerOR: any) {
		// Bestimme den aktuellen Typ des ersten Kindes
		const newKey = innerOR.children[0].key.startsWith('!') ? '' : '!';
		const newType = innerOR.children[0].type.startsWith('N') ? '' : 'N';
		// Ändere den Vergleichsoperator für alle Kinder in diesem OR-Knoten
		innerOR.children.forEach((child) => {
			child.key = newKey + '' + child.key.replace('!', '');
			child.type =
				newType + '' + child.type.replace('NBETWEEN', 'BETWEEN').replace('NEQUALS', 'EQUALS');
		});

		// AST aktualisieren
		currentAst.update((ast) => ({ ...ast }));
	}

	// Funktion, um das richtige Symbol basierend auf dem Vergleichsoperator zu erhalten
	// Funktion, um das richtige Symbol basierend auf dem Vergleichsoperator zu erhalten
	function getComparisonSymbol(key) {
		if (!key.startsWith('!')) {
			return '=';
		} else {
			return '≠';
		}
	}

	// Funktion zum Entfernen eines Knotens und Rekursion durch den gesamten Baum
	function removeInnerOR(innerOR: any, value: string, parentAND: any, rootAST: any) {
		//console.log(`Entferne Wert: ${value}`);

		innerOR.children = innerOR.children.filter((child: any) => child.value !== value);

		if (innerOR.children.length === 0) {
			parentAND.children = parentAND.children.filter((child: any) => child !== innerOR);
		}

		if (parentAND.children.length === 0) {
			rootAST.children = rootAST.children.filter((child: any) => child !== parentAND);
		}

		currentAst.update((ast) => {
			return { ...ast };
		});
		scheduleConsistencyCheck(); // Konsistenz prüfen nach dem Entfernen
	}

	// Reset a given OR group to a single "missing" value
	function resetInnerORToMissing(innerOR: any) {
		currentAst.update((ast) => {
			if (!innerOR || !Array.isArray(innerOR.children) || innerOR.children.length === 0) {
				return { ...ast };
			}
			const first = innerOR.children[0];

			const key = first?.key ?? '';
			const system = first?.system ?? '';
			const type = first?.type ?? 'EQUALS';
			const keyLower = String(key).toLowerCase();
			const isDateField = keyLower.includes('date');

			let newChild: any;
			if (isDateField) {
				// Force BETWEEN with null bounds (interpreted as "missing")
				newChild = {
					key,
					type: type.startsWith('N') ? 'NBETWEEN' : 'BETWEEN',
					system,
					value: { min: null, max: null }
				};
			} else {
				if (String(type).includes('BETWEEN')) {
					newChild = {
						key,
						type,
						system,
						value: { min: null, max: null }
					};
				} else {
					newChild = {
						key,
						type: type.startsWith('N') ? 'NEQUALS' : 'EQUALS',
						system,
						value: '-'
					};
				}
			}

			innerOR.children = [newChild];
			clampPage(innerOR);
			return { ...ast };
		});
		scheduleConsistencyCheck();
	}
	function addAND(innerAND: any) {
		currentAst.update((ast) => {
			innerAND.children.push({
				operand: 'OR',
				children: [{ key: '', type: 'EQUALS', system: '', value: '' }]
			});
			return { ...ast };
		});
		scheduleConsistencyCheck(); // Konsistenz prüfen nach dem Hinzufügen
	}

	function addInnerOR(innerOR: any, keySystem: string) {
		const [key, system] = keySystem.split('(');
		const cleanSystem = system.replace(')', '');

		console.log('Clicked + for:', key, cleanSystem);
		console.log('keysAndTypes:', get(keysAndTypes));

		const fieldTypeEntry = get(keysAndTypes).find((k) => k.key === key && k.system === cleanSystem);
		console.log('Found fieldTypeEntry:', fieldTypeEntry);

		const fieldType = fieldTypeEntry ? fieldTypeEntry.type : undefined;
		console.log('Field type determined as:', fieldType);

		const isDateField = String(key).toLowerCase().includes('date');
		console.log('IST ES EIN DATE FIELD?', isDateField);

		const nowTimestamp = Date.now();

		let newField;
		if (fieldType === 'BETWEEN' || fieldType === 'NBETWEEN') {
			newField = {
				key: key,
				type: fieldType,
				system: cleanSystem,
				value: {
					min: isDateField ? nowTimestamp : 1,
					max: isDateField ? nowTimestamp : 999999
				}
			};
		} else {
			newField = {
				key: key,
				type: fieldType,
				system: cleanSystem,
				value: ''
			};
		}

		console.log('New field to be added:', newField); // Prüfen, ob die Werte korrekt sind

		innerOR.children.push(newField);
		clampPage(innerOR);

		currentAst.update((ast) => {
			return { ...ast };
		});

		scheduleConsistencyCheck(); // Konsistenz prüfen nach dem Hinzufügen
	}

	// Schneller Membership-Check: nutzt Set, aber nur wenn die Optionsliste nicht riesig ist.
	function getCachedValueHasFn(key: string, system: string): (v: string) => boolean {
		const normalizedKey = (key || '').replace(/^!/, '');
		const cacheKey = `${normalizedKey}(${system})`;

		const values = getCachedValueOptions(normalizedKey, system) || [];
		if (values.length === 0) {
			// Kein Options-Set bekannt -> nicht blockieren
			return () => true;
		}
		if (values.length > VALUESET_MAX) {
			// Liste zu groß -> Membership-Check überspringen (sonst RAM/CPU-Killer)
			return () => true;
		}

		const existing = valueOptionsSetCache[cacheKey];
		if (existing) return (v: string) => existing.has(v);

		// Set lazy bauen
		const s = new Set(values);
		valueOptionsSetCache[cacheKey] = s;
		return (v: string) => s.has(v);
	}

	function removeAND(innerOR: any, innerAND: any, rootAST: any) {
		currentAst.update((ast) => {
			innerAND.children = innerAND.children.filter((orGroup: any) => orGroup !== innerOR);

			if (innerAND.children.length === 0) {
				ast.children = ast.children.filter((andGroup: any) => andGroup !== innerAND);
			}

			return { ...ast };
		});
		scheduleConsistencyCheck(); // Konsistenz prüfen nach dem Entfernen
	}

	function removeOuterOR(innerAND: any) {
		currentAst.update((ast) => {
			ast.children = ast.children.filter((andGroup: any) => andGroup !== innerAND);
			return { ...ast };
		});
		scheduleConsistencyCheck(); // Konsistenz prüfen nach dem Entfernen
	}

	function addOuterOR() {
		currentAst.update((ast) => {
			ast.children.push({
				operand: 'AND',
				children: [
					{
						operand: 'OR',
						children: [{ key: '', type: 'EQUALS', system: '', value: '' }]
					}
				]
			});
			return { ...ast };
		});
		scheduleConsistencyCheck(); // Konsistenz prüfen nach dem Hinzufügen
	}

	function goBack() {
		window.history.back();
	}

	async function saveChanges() {
		if (!$isConsistent) {
			console.warn('Speichern nicht möglich, da der Zustand inkonsistent ist.');
			return;
		}

		const updatedAst = JSON.stringify(get(currentAst));

		if (username) {
			try {
				let input = { userFilter: updatedAst, lastModifiedBy: 'daniel' };
				updateUser(username, input);
				window.location.href = appPath('/user-management');
			} catch (error) {
				console.error('Fehler beim Speichern des Benutzerfilters:', error);
			}
		} else {
			dataPasser.setQueryStoreFromAstAPI(get(currentAst));
			reloadOnly();
			goBack();
		}
	}

	function updateKeySystem(innerOR: any, newKeySystem: string) {
		const [key, system] = newKeySystem.split('(');
		const cleanSystem = system.replace(')', '');

		console.log(`Key-System geändert zu: ${newKeySystem}, Zurücksetzen der Werte.`);

		const fieldTypeEntry = get(keysAndTypes).find((k) => k.key === key && k.system === cleanSystem);
		const fieldType = fieldTypeEntry ? fieldTypeEntry.type : 'EQUALS';
		const isDateField = key.toLowerCase().includes('date');
		const nowTimestamp = Date.now();

		console.log('IST ES EIN DATE FIELD?', isDateField);

		let newField;
		if (fieldType === 'BETWEEN' || fieldType === 'NBETWEEN') {
			newField = {
				key: key,
				type: fieldType,
				system: cleanSystem,
				value: {
					min: isDateField ? nowTimestamp : 1,
					max: isDateField ? nowTimestamp : 999999
				}
			};
		} else {
			newField = {
				key: key,
				type: fieldType,
				system: cleanSystem,
				value: ''
			};
		}

		// Ersetze den Inhalt der OR-Gruppe mit dem neuen Feld
		innerOR.children = [newField];
		clampPage(innerOR);

		// Lade mögliche Werteoptionen für das neue Key-System
		getValueOptions(key, cleanSystem).then((options) => {
			valueOptionsCache.update((cache) => ({
				...cache,
				[`${key}(${cleanSystem})`]: options
			}));
		});

		currentAst.update((ast) => ({ ...ast }));
		scheduleConsistencyCheck();
	}
	function roundToNextUTCMidnight(timestamp) {
		let date = new Date(timestamp);
		date.setUTCHours(0, 0, 0, 0);

		if (timestamp % 86400000 !== 0) {
			date.setUTCDate(date.getUTCDate() + 1); // 🔥 Falls kein exakter UTC-Tagesbeginn, auf den nächsten Tag runden
		}
		return date.getTime();
	}

	function formatDateForInput(timestamp) {
		if (
			timestamp === null ||
			timestamp === undefined ||
			(typeof timestamp === 'string' && timestamp.trim() === '')
		) {
			return '';
		}
		const n = Number(timestamp);
		const d = new Date(Number.isNaN(n) ? timestamp : n);
		if (Number.isNaN(d.getTime())) return '';
		const yyyy = d.getUTCFullYear();
		const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
		const dd = String(d.getUTCDate()).padStart(2, '0');
		return `${yyyy}-${mm}-${dd}`;
	}
</script>

<lens-data-passer bind:this={dataPasser} />
<!-- Template -->

{#if currentRole === 'user' && username}
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
	<div class="box_style box_level3" style="height: 600px; overflow: auto;">
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
											value={isDefaultAst
												? ''
												: `${innerOR.children[0].key}(${innerOR.children[0].system})`}
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

										<datalist id="keyOptions">
											{#each $availableKeys as option}
												{#if !option.startsWith('!')}
													<option value={option} />
												{/if}
											{/each}
										</datalist>

										<!-- Button zur Umschaltung des Vergleichsoperators für alle Kinder eines OR-Knotens -->
										<button class="operator-button" on:click={() => toggleOperatorForOR(innerOR)}>
											{getComparisonSymbol(innerOR.children[0].key)}
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
												<!-- Standardwerte setzen, falls nicht vorhanden -->
												{#if !child.value}
													{(child.value = {
														min: null,
														max: null
													})}
												{/if}

												{#if child.key.toLowerCase().includes('date')}
													<!-- Date inputs: allow nulls (empty field) -->
													<input
														type="date"
														value={formatDateForInput(child?.value?.min)}
														on:input={(event) => {
															const v = event.target.value;
															if (!child.value) child.value = { min: null, max: null };
															if (!v) {
																child.value.min = null;
															} else {
																const d = new Date(`${v}T00:00:00.000Z`);
																child.value.min = Number.isNaN(d.getTime()) ? null : d.getTime();
															}
															currentAst.update((ast) => ({ ...ast }));
															scheduleConsistencyCheck();
														}}
													/>
													<input
														type="date"
														value={formatDateForInput(child?.value?.max)}
														on:input={(event) => {
															const v = event.target.value;
															if (!child.value) child.value = { min: null, max: null };
															if (!v) {
																child.value.max = null;
															} else {
																const d = new Date(`${v}T23:59:59.999Z`);
																child.value.max = Number.isNaN(d.getTime()) ? null : d.getTime();
															}
															currentAst.update((ast) => ({ ...ast }));
															scheduleConsistencyCheck();
														}}
													/>
												{:else}
													<!-- Number inputs: allow nulls (empty field) -->
													<input
														type="number"
														value={child?.value?.min ?? ''}
														on:input={(event) => {
															if (!child.value) child.value = { min: null, max: null };
															const v = event.target.value;
															child.value.min = v === '' ? null : Number(v);
															currentAst.update((ast) => ({ ...ast }));
															scheduleConsistencyCheck();
														}}
													/>
													<input
														type="number"
														value={child?.value?.max ?? ''}
														on:input={(event) => {
															if (!child.value) child.value = { min: null, max: null };
															const v = event.target.value;
															child.value.max = v === '' ? null : Number(v);
															currentAst.update((ast) => ({ ...ast }));
															scheduleConsistencyCheck();
														}}
													/>
												{/if}
											{:else}
												<!-- Standardwert für EQUALS -->
												<input
													list="valueOptions{child.key}"
													value={isDefaultAst ? '' : child.value}
													style="margin-right: 10px;"
													class={$inconsistentFields.includes(child) ? 'inconsistent-field' : ''}
													on:input={(event) => {
														child.value = event.target.value; // ✅ Update child value dynamically
														scheduleConsistencyCheck(); // ✅ Re-run consistency check
													}}
												/>
											{/if}

											<!-- Dynamisches Dropdown für die Werte basierend auf dem Key-System -->
											<datalist id="valueOptions{child.key}">
												{#each $valueOptionsCache[`${child.key.replace(/^!/, '')}(${child.system})`] || [] as option}
													<option value={option} />
												{/each}
											</datalist>

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
	</div>

	<!-- Save-Button -->
	<div class="box_style box_level2 table-chart" style="display: flex; align-items: center;">
		<b>{$t('saveAndContinue')}:</b>
		<div style="display: flex; align-items: center; margin-left: 10px;">
			<button
				style="background-color: {$isConsistent
					? '#A8D5A5'
					: '#D55A5A'}; font-weight: bold; padding: 2px; margin-right: 10px; border-radius: 20px; display: flex; align-items: center; justify-content: center;"
				class="iconRoundButton"
				disabled={!$isConsistent}
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
			{#if !$isConsistent}
				<p style="color: red; font-style: italic; margin-left: 10px;">
					Zustand inkonsistent - speichern nicht möglich
				</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.box_style {
		border: 1px solid #ddd;
		padding: 10px;
		margin-bottom: 10px;
	}
	.box_level1 {
		background-color: #f9f9f9;
	}
	.box_level2 {
		background-color: #fff;
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
		border: 2px solid #ccc; /* Dezente Rahmenfarbe */
		background-color: white; /* Weißer Hintergrund */
		box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1); /* Leichter Schatten */
		transition: background-color 0.3s ease; /* Glatte Übergänge bei Hover */
	}

	.operator-button:hover {
		background-color: #f9f9f9; /* Leicht grauer Hintergrund beim Hover */
	}

	.tooltip-container {
		position: relative;
		display: inline-block;
		overflow: visible; /* Tooltips können über die Grenzen des Containers hinausgehen */
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
