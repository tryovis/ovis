<script lang="ts">
	// @ts-nocheck
	import Headline from '../../components/Headline.svelte';
	import { get } from 'svelte/store';
	import { t } from '../../store/languageStore';
	import { onMount } from 'svelte';
	import { createTable } from '../../tableBuilder';
	import {
		deleteUser,
		getUser,
		updateUser,
		type UserInput,
		type UserRecord
	} from '../../graphQl/gql-userManagement';
	import { userStore } from '../../store/userStore';
	import type { LensDataPasser } from '@samply/lens';
	import { showToast } from '../../store/toastStore';
	import { appPath, iconPath } from '$lib/path-utils';

	const translate = (key: string): string => get(t)(key);

	let dataPasser: LensDataPasser;
	let currentUser = '';
	let currentRole = '';

	type SortDirection = 'asc' | 'desc';

	type FilterRange = { min?: number | string; max?: number | string };
	type FilterNode = {
		key?: string;
		operand?: string;
		type?: string;
		value?: string | number | boolean | null | FilterRange;
		children?: FilterNode[];
	};

	type UserFilterEntry = string | null;

	const plusIcon = iconPath('add.svg');
	const editIcon = iconPath('pencil.svg');
	const backIcon = iconPath('backward.svg');
	const forwardIcon = iconPath('forward.svg');
	const eraserIcon = iconPath('eraser.svg');
	const trashIcon = iconPath('trash-icon.svg');

	let userManagementTable: unknown;
	let tableShownRows = 5;
	let sortingIndex = 0;
	let tableState: { page: number; order: [number, SortDirection][]; search: string } = {
		page: 0,
		order: [[sortingIndex, 'asc']],
		search: ''
	};

	let showDeleteConfirmation = false; // Variable zum Steuern des Popup-Zustands
	let identifierToDelete = ''; // Variable zum Speichern der Benutzer-ID, die gelöscht werden soll

	let columns = [
		{ data: '_id', header: translate('userIdentifier') },
		{ data: 'role', header: translate('userRole'), render: renderRole },
		{ data: 'createdAt', header: translate('userRegistryDate') },
		{ data: 'createdBy', header: translate('userCreator') },
		{ data: 'firstLogin', header: translate('userFirstLogin') },
		{ data: 'lastLogin', header: translate('userLastLogin') },
		{ data: 'timeOnline', header: translate('userTimeOnline') },
		{ data: 'userFilter', header: translate('userUserFilter'), render: renderUserFilters },
		{ data: 'pseudonymization', header: translate('userPseudonymization'), render: renderPseudo },
		{ data: 'status', header: translate('userStatus'), render: renderStatus },
		{ data: 'lastModifiedAt', header: translate('userLastModifiedAt') },
		{ data: 'lastModifiedBy', header: translate('userLastModifiedBy') },
		{ data: '_id', header: 'Delete', render: renderTrash }
	];

	const headers =
		columns.length > 0 && columns.some((column) => column.header)
			? columns.map((column) => column.header) // Use actual headers if available
			: columns.map((_, index) => `col${index + 1}`); // Fallback to default column names

	// Inside renderRoleDropdown function
	function renderRole(data: string, type: string, row: UserRecord) {
		if (type === 'display') {
			let promoteButton = '';
			let demoteButton = '';

			//Promoten
			if ((currentRole === 'admin' || currentRole === 'super-admin') && data === 'user') {
				promoteButton =
					'<button class="promote-button iconRound" data-identifier="' + row._id + '">▲</button>';
			}
			//Demoten
			if ((currentRole === 'admin' || currentRole === 'super-admin') && data === 'manager') {
				demoteButton =
					'<button class="demote-button iconRound" data-identifier="' + row._id + '">▼</button>';
			}
			//super-admin Rechte
			if (currentRole === 'super-admin') {
				if (data === 'manager') {
					demoteButton =
						'<button class="demote-button iconRound" data-identifier="' + row._id + '">▼</button>';
					promoteButton =
						'<button class="promote-button iconRound" data-identifier="' + row._id + '">▲</button>';
				}
				if (data === 'admin') {
					demoteButton =
						'<button class="demote-button iconRound" data-identifier="' + row._id + '">▼</button>';
				}
			}

			return `<div style="display: flex; justify-content: flex-end; align-items: center;">
						<div>
							<span>${data}</span>
						</div>
						<div style="margin-left: auto;">
							${promoteButton}
							${demoteButton}
						</div>
					</div>`;
		}
		return data;
	}

	function renderUserFilters(data: UserFilterEntry[], _type: string, row: UserRecord) {
		const filterIndex = data.length - 1;
		const currentFilter = data[filterIndex];
		let filterObject: FilterNode | null = null;

		// Prüfe, ob ein Filter existiert und ob es sich um einen gültigen JSON-String handelt
		if (typeof currentFilter === 'string' && currentFilter.trim().length > 0) {
			try {
				filterObject = JSON.parse(currentFilter) as FilterNode;
			} catch (error) {
				console.error('Fehler beim Parsen von userFilter:', error, 'Rohdaten:', data[filterIndex]);
				filterObject = null;
			}
		}

		// Buttons: Add-Button **immer sichtbar**, andere Buttons nur bei vorhandenem Filter
		let addButton = `<button class='add-button iconRound' data-identifier='${row._id}'><img src='${plusIcon}'></button>`;
		let editButton = filterObject
			? `<button class='edit-button iconRound' data-identifier='${row._id}'><img src='${editIcon}'></button>`
			: '';
		let eraseButton = filterObject
			? `<button class='erase-button iconRound' data-identifier='${row._id}'><img src='${eraserIcon}'></button>`
			: '';
		let backwardButton = filterObject
			? `<button class="backward-button iconRound" data-identifier="${row._id}"><img src="${backIcon}"></button>`
			: '';
		let forwardButton = filterObject
			? `<button class="forward-button iconRound" data-identifier="${row._id}"><img src="${forwardIcon}"></button>`
			: '';

		return `
        <div style="display: flex; flex-direction: column; align-items: flex-start; width: 100%;">
            <div class="box_style box_level3" style="width: 100%; min-width: 200px; max-width: 200px; text-align: center;">
                ${
									filterObject
										? parseUserFilter(filterObject)
										: "<span style='color: gray;'>No Filters</span>"
								}
            </div>
            <div style="display: flex; gap: 5px; margin-top: 5px;">
                ${addButton} <!-- Add-Button bleibt immer sichtbar -->
                ${editButton}
                ${eraseButton}
                ${backwardButton}
                ${forwardButton}
            </div>
        </div>`;
	}

	function parseUserFilter(filterx: FilterNode | null) {
		console.log('FILTER X', filterx);

		if (
			!filterx ||
			typeof filterx !== 'object' ||
			!filterx.children ||
			filterx.children.length === 0
		) {
			return "<span style='color: gray;'>No Filters</span>";
		}

		console.log('Parsed Filter Structure:', JSON.stringify(filterx, null, 2));

		return `
        <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 5px;">
            ${filterx.children
							.map(
								(andNode, andIndex) => `
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    ${
											andNode.children
												?.map(
													(orNode, orIndex) => `
                        <div>
                            <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; white-space: nowrap;">
                                <div style="width: 100px; font-weight: bold; overflow: hidden; text-overflow: ellipsis;">
                                    ${truncateLabel(orNode.children?.[0]?.key || 'Unknown')}
                                </div>
                                <div style="width: 20px; text-align: center;">→</div>
                                <div style="width: 120px; overflow: hidden; text-overflow: ellipsis;">
                                    ${
																			orNode.children
																				?.map((child) => parseNode(child))
																				.join(', ') ?? ''
																		}
                                </div>
                            </div>
                            ${
															orIndex < (andNode.children?.length ?? 0) - 1
																? `<hr style="border: none; border-top: 1px solid lightgray; margin: 3px 0;">`
																: ''
														}
                        </div>
                    `
												)
												.join('') ?? ''
										}
                </div>
                ${
									andIndex < (filterx.children?.length ?? 0) - 1
										? `<hr style="border: none; border-top: 2px solid gray; margin: 5px 0;">`
										: ''
								}
            `
							)
							.join('')}
        </div>
    `;
	}

	function parseNode(node: FilterNode) {
		if (node.type === 'BETWEEN' && node.value?.min !== undefined && node.value?.max !== undefined) {
			// Überprüfen, ob der Feldname "date" enthält
			if (node.key?.toLowerCase().includes('date')) {
				const formattedMin = formatMillisecondsToDate(node.value.min);
				const formattedMax = formatMillisecondsToDate(node.value.max);

				// Überprüfen, ob min und max gleich sind
				if (node.value.min === node.value.max) {
					return formattedMin; // Nur den min-Wert anzeigen
				}

				return `${formattedMin}<br>${formattedMax}`; // Beide Werte anzeigen
			} else {
				// Wenn kein "date" im Namen, Originalwerte belassen
				const originalMin = node.value.min;
				const originalMax = node.value.max;

				if (originalMin === originalMax) {
					return originalMin; // Nur den min-Wert anzeigen
				}

				return `${originalMin}<br>${originalMax}`; // Beide Werte anzeigen
			}
		} else if (node.type === 'EQUALS') {
			return truncateValue(String(node.value ?? ''));
		}
		return '';
	}

	function formatMillisecondsToDate(milliseconds: number | string) {
		const date = new Date(milliseconds);
		const day = String(date.getDate()).padStart(2, '0');
		const month = String(date.getMonth() + 1).padStart(2, '0'); // Monate sind 0-basiert
		const year = date.getFullYear();
		return `${day}.${month}.${year}`;
	}

	function truncateLabel(label: string) {
		return label.length > 9 ? label.slice(0, 9) + '...' : label; // Kürzen auf 10 Zeichen
	}

	function truncateValue(value: string) {
		return value.length > 10 ? value.slice(0, 10) + '...' : value; // Kürzen auf 10 Zeichen
	}

	function renderPseudo(data: boolean, _type: string, row: UserRecord) {
		let pseudoButton = '';
		let pseudoLabel = '';
		if (data === true) {
			pseudoLabel = 'Pseudo.';
			pseudoButton =
				'<button class="pseudo-button iconRound"  alt="info" data-identifier="' +
				row._id +
				'"><img class="pseudo-button" src="' +
				iconPath('pseudo_off.svg') +
				'" data-identifier="' +
				row._id +
				'"></button>';
		} else {
			pseudoLabel = 'Offen';
			pseudoButton =
				'<button class="pseudo-button iconRound" alt="info"  data-identifier="' +
				row._id +
				'"><img class="pseudo-button" src="' +
				iconPath('pseudo.svg') +
				'" data-identifier="' +
				row._id +
				'"></button>';
		}
		return `<div style="display: flex; justify-content: flex-end; align-items: center;">
					<div>
						<span>${pseudoLabel}</span>
					</div>
					<div style="margin-left: auto;">
						${pseudoButton}
					</div>
				</div>`;
	}

	function renderStatus(data: string, _type: string, row: UserRecord) {
		let statusButton = '';
		if (data === 'active') {
			statusButton =
				'<button class="status-button iconRound"  alt="info" data-identifier="' +
				row._id +
				'"><img class="status-button" src="' +
				iconPath('inactive.svg') +
				'" data-identifier="' +
				row._id +
				'"></button>';
		} else {
			statusButton =
				'<button class="status-button iconRound" alt="info"  data-identifier="' +
				row._id +
				'"><img class="status-button" src="' +
				iconPath('active.svg') +
				'" data-identifier="' +
				row._id +
				'"></button>';
		}
		return `<div style="display: flex; justify-content: flex-end; align-items: center;">
					<div>
						<span>${data}</span>
					</div>
					<div style="margin-left: auto;">
						${statusButton}
					</div>
				</div>`;
	}

	function renderTrash(_data: string, _type: string, row: UserRecord) {
		let trashButton =
			'<button class="delete-button iconRound"  alt="info" data-identifier="' +
			row._id +
			'"><img class="delete-button" src="' +
			trashIcon +
			'" data-identifier="' +
			row._id +
			'"></button>';

		if (row.role === 'super-admin') {
			trashButton = '';
		}
		if (row.role === 'admin' && currentRole !== 'super-admin') {
			trashButton = '';
		}
		if (
			(row.role === 'manager' || row.role === 'user') &&
			currentRole !== 'super-admin' &&
			currentRole !== 'admin'
		) {
			trashButton = '';
		}

		return trashButton;
	}

	let userData: UserRecord[] = [];

	onMount(() => {
		let removeClickListener = () => {};
		const unsubscribe = userStore.subscribe(
			(value: { currentUser: string; currentRole: string }) => {
				({ currentUser, currentRole } = value);
			}
		);

		(async () => {
			await import('@samply/lens');
			drawTable();
			window.addEventListener('userCreated', handleUserCreated);

			const tableElement = document.getElementById('userManagementTable');
			if (!tableElement) {
				return;
			}

			// Event Delegation für die gesamte Tabelle
			const handleTableClick = (event: Event) => {
				console.log('click event triggered');

				let target: HTMLElement | null = event.target instanceof HTMLElement ? event.target : null;
				if (!target) {
					return;
				}

				// Falls das Event auf das IMG-Tag geht, klettere nach oben zum Button
				if (target.tagName === 'IMG') {
					const button = target.closest('button');
					if (!(button instanceof HTMLElement)) {
						return;
					}
					target = button;
				}

				if (!target) return;

				const identifier = target.getAttribute('data-identifier');

				console.log('Clicked Element:', target);
				console.log('Identifier:', identifier);

				if (!identifier) {
					console.warn('Identifier is missing for the clicked element.');
					return;
				}

				if (target.classList.contains('add-button')) {
					console.log('ADD Button Clicked');
					addCurrentFilter(identifier);
				} else if (target.classList.contains('edit-button')) {
					console.log('Edit Button Clicked');
					const user = userData.find((entry) => entry._id === identifier);
					if (!user) {
						return;
					}
					console.log(user);
					window.location.href = appPath(`/filter-edit?user=${encodeURIComponent(user._id)}`);
				} else if (target.classList.contains('erase-button')) {
					console.log('Erase Button Clicked');
					deleteCurrentFilter(identifier);
				} else if (target.classList.contains('backward-button')) {
					console.log('Back Button Clicked');
					switchBack(identifier);
				} else if (target.classList.contains('forward-button')) {
					console.log('Forward Button Clicked');
					switchForward(identifier);
				} else if (target.classList.contains('status-button')) {
					console.log('Status Button Clicked');
					switchStatus(identifier);
				} else if (target.classList.contains('delete-button')) {
					console.log('Delete Button Clicked');
					identifierToDelete = identifier;
					showDeleteConfirmation = true;
				} else if (target.classList.contains('promote-button')) {
					console.log('Promote Button Clicked');
					promoteUser(identifier);
				} else if (target.classList.contains('demote-button')) {
					console.log('Demote Button Clicked');
					demoteUser(identifier);
				} else if (target.classList.contains('pseudo-button')) {
					console.log('Pseudo Button Clicked');
					switchPseudonymization(identifier);
				}
			};

			tableElement.addEventListener('click', handleTableClick);
			removeClickListener = () => {
				tableElement.removeEventListener('click', handleTableClick);
			};
		})();

		return () => {
			unsubscribe();
			window.removeEventListener('userCreated', handleUserCreated);
			removeClickListener();
		};
	});

	function handleUserCreated() {
		drawTable();
	}

	function saveTableState() {
		if (!userManagementTable) return;

		tableState.page = userManagementTable.page();
		tableState.order = userManagementTable.order();
		tableState.search = userManagementTable.search();
	}

	function restoreTableState() {
		if (!userManagementTable) return;

		userManagementTable.order(tableState.order);
		userManagementTable.search(tableState.search);
		userManagementTable.page(tableState.page).draw(false);
	}

	function addCurrentFilter(identifier: string) {
		const user = userData.find((entry) => entry._id === identifier);
		if (!user) {
			console.error('Benutzer nicht gefunden.');
			return;
		}

		let newFilter = dataPasser.getAstAPI(); // Aktueller Filter aus dataPasser holen
		let newFilterString = JSON.stringify(newFilter);

		console.log('Neuer Filter:', newFilter);

		// Überprüfen, ob der neue Filter leer ist (keine Auswahl getroffen)
		if (newFilterString === JSON.stringify({ operand: 'OR', children: [] })) {
			console.warn('Kein gültiger Filter ausgewählt.');
			showToast('Bitte wähle mindestens einen Filter aus, bevor du ihn speicherst.');
			return;
		}

		let currentFilters = [...user.userFilter];

		// Filter hinzufügen, falls gültig
		currentFilters.push(newFilterString);

		// Entferne leere Filtereinträge
		currentFilters = currentFilters.filter((filterValue) => filterValue !== '');

		console.log('Aktualisierte Filter:', currentFilters);

		const input: UserInput = { userFilter: currentFilters, lastModifiedBy: currentUser };

		updateUser(identifier, input)
			.then(() => {
				drawTable(true);
			})
			.catch((error) => {
				console.error('Fehler beim Aktualisieren des Benutzers:', error);
			});
	}

	function deleteCurrentFilter(identifier: string) {
		const user = userData.find((entry) => entry._id === identifier);
		if (!user) {
			console.error('Benutzer nicht gefunden.');
			return;
		}

		let currentFilters = [...user.userFilter];

		console.log('Vorherige Filter:', currentFilters);

		if (currentFilters.length <= 1) {
			console.warn('Letzter Filter wird gelöscht. Kein vorheriger Filter vorhanden.');
			currentFilters = ['']; // Falls dies der letzte Filter war, setze auf leeren Wert
		} else {
			// Lösche den letzten (aktiven) Filter und springe zum vorherigen
			currentFilters.pop();
		}

		console.log('Aktualisierte Filter:', currentFilters);

		const input: UserInput = { userFilter: currentFilters, lastModifiedBy: currentUser };

		updateUser(identifier, input)
			.then(() => {
				drawTable(true);
			})
			.catch((error) => {
				console.error('Fehler beim Aktualisieren des Benutzers:', error);
			});
	}

	function switchBack(identifier: string) {
		const user = userData.find((entry) => entry._id === identifier);

		if (!user) {
			console.error('Benutzer nicht gefunden.');
			return;
		}

		let currentFilters = [...user.userFilter];

		if (currentFilters.length <= 1) {
			console.warn(
				'Das Benutzerfilter-Array hat nur ein Element oder ist leer. Keine Änderungen durchgeführt.'
			);
			return;
		}

		// Das letzte Element wird aus dem Array entfernt
		const lastElement = currentFilters.pop();
		if (!lastElement) {
			return;
		}

		// Das letzte Element wird an die erste Position des Arrays verschoben
		currentFilters.unshift(lastElement);

		const input: UserInput = { userFilter: currentFilters, lastModifiedBy: currentUser }; // Das zu aktualisierende Feld und der neue Wert

		updateUser(identifier, input)
			.then(() => {
				drawTable(true);
			})
			.catch((error) => {
				console.error('Fehler beim Aktualisieren des Benutzers:', error);
			});
	}

	function switchForward(identifier: string) {
		const user = userData.find((entry) => entry._id === identifier);

		if (!user) {
			console.error('Benutzer nicht gefunden.');
			return;
		}

		let currentFilters = [...user.userFilter];

		if (currentFilters.length <= 1) {
			console.warn(
				'Das Benutzerfilter-Array hat nur ein Element oder ist leer. Keine Änderungen durchgeführt.'
			);
			return;
		}

		// Das erste Element wird aus dem Array entfernt
		const firstElement = currentFilters.shift();
		if (!firstElement) {
			return;
		}

		// Das erste Element wird an die letzte Position des Arrays verschoben
		currentFilters.push(firstElement);

		const input: UserInput = { userFilter: currentFilters, lastModifiedBy: currentUser }; // Das zu aktualisierende Feld und der neue Wert

		updateUser(identifier, input)
			.then(() => {
				drawTable(true);
			})
			.catch((error) => {
				console.error('Fehler beim Aktualisieren des Benutzers:', error);
			});
	}

	function switchStatus(identifier: string) {
		const user = userData.find((entry) => entry._id === identifier);
		if (!user) {
			return;
		}
		let input: UserInput = { status: '', lastModifiedBy: currentUser }; // Das zu aktualisierende Feld und der neue Wert
		if (user.status === 'inactive') {
			input = { status: 'active', lastModifiedBy: currentUser };
		} else {
			input = { status: 'inactive', lastModifiedBy: currentUser };
		}
		updateUser(identifier, input).then(() => {
			drawTable(true);
		});
	}

	function deleteTableUser() {
		deleteUser([identifierToDelete]) // Wandeln Sie die einzelne Benutzer-ID in eine Liste um
			.then(() => {
				drawTable(true);
			})
			.catch((error) => {
				console.error('Fehler beim Löschen des Benutzers:', error);
			});
	}

	function confirmDelete() {
		showDeleteConfirmation = false; // Schließe das Bestätigungsfenster
		deleteTableUser();
	}

	function cancelDelete() {
		showDeleteConfirmation = false; // Schließe das Bestätigungsfenster, ohne zu löschen
	}

	function promoteUser(identifier: string) {
		console.log('promote', identifier);
		// Finde den Eintrag in userData mit der übereinstimmenden _id
		const user = userData.find((entry) => entry._id === identifier);
		if (!user) {
			return;
		}
		let input: UserInput | null = null;
		if (currentRole === 'admin' || currentRole === 'super-admin') {
			if (user.role === 'user') {
				input = { role: 'manager', lastModifiedBy: currentUser };
			}
		}
		if (currentRole === 'super-admin') {
			if (user.role === 'manager') {
				input = { role: 'admin', lastModifiedBy: currentUser };
			}
		}
		if (!input) {
			return;
		}
		updateUser(identifier, input).then(() => {
			drawTable(true);
		});
	}

	function demoteUser(identifier: string) {
		console.log('demote', identifier);
		// Finde den Eintrag in userData mit der übereinstimmenden _id
		const user = userData.find((entry) => entry._id === identifier);
		if (!user) {
			return;
		}
		let input: UserInput | null = null;
		if (currentRole === 'admin' || currentRole === 'super-admin') {
			if (user.role === 'manager') {
				input = { role: 'user', lastModifiedBy: currentUser };
			}
		}
		if (currentRole === 'super-admin') {
			if (user.role === 'admin') {
				input = { role: 'manager', lastModifiedBy: currentUser };
			}
		}
		if (!input) {
			return;
		}
		updateUser(identifier, input).then(() => {
			drawTable(true);
		});
	}

	function switchPseudonymization(identifier: string) {
		const user = userData.find((entry) => entry._id === identifier);
		if (!user) {
			return;
		}
		let input: UserInput = { pseudonymization: false, lastModifiedBy: currentUser }; // Das zu aktualisierende Feld und der neue Wert
		if (user.pseudonymization === false) {
			input = { pseudonymization: true, lastModifiedBy: currentUser };
		} else {
			input = { pseudonymization: false, lastModifiedBy: currentUser };
		}
		updateUser(identifier, input).then(() => {
			drawTable(true);
		});
	}

	async function drawTable(preserveState = false) {
		if (preserveState && userManagementTable) {
			saveTableState();
		}

		userData = await getUser();
		//Falls noch keine UserFilter vorhanden sind initialisiere sie mit leerem String
		userData.forEach((user) => {
			if (!user.userFilter) {
				user.userFilter = [''];
			}
		});
		console.log('USER DATA', userData);

		// Zeichne die Tabelle neu
		userManagementTable = createTable(
			'user',
			null,
			'userManagementTable',
			userData,
			columns,
			tableShownRows,
			sortingIndex,
			'asc',
			false
		);

		if (preserveState) {
			restoreTableState();
		}
	}
</script>

<!-- prettier-ignore -->
<lens-data-passer bind:this={dataPasser}></lens-data-passer>
<Headline
	headlineTitle={'Users'}
	headlineTooltip={'TOOLTIP'}
	headlineMaximize={null}
	headlineShowChart={null}
	headlineIsChart={null}
	headlineInitialTop5={null}
	headlineInitialLogarithm={null}
	headlineInputTableData={userData}
	headlineInputTableHeader={headers}
	headlineChartJSElement={null}
	headlineD3Element={null}
/>
<div class="grid-container">
	<div class="icon-text-container">
		<img src={plusIcon} alt="info" class="iconRound" style="pointer-events: none;" /><i
			>Save Current Filter Selection</i
		>
	</div>
	<div class="icon-text-container">
		<img src={editIcon} alt="info" class="iconRound" style="pointer-events: none;" /><i
			>Display and edit user filters</i
		>
	</div>
	<div class="icon-text-container">
		<img src={eraserIcon} alt="info" class="iconRound" style="pointer-events: none;" /><i
			>Reset User's filters (sets user to "inactive")</i
		>
	</div>
	<div class="icon-text-container">
		<img src={backIcon} alt="info" class="iconRound" style="pointer-events: none;" /><i
			>Restore previous set of user filters</i
		>
	</div>
	<div class="icon-text-container">
		<img src={forwardIcon} alt="info" class="iconRound" style="pointer-events: none;" /><i>
			Restore next set of user filters</i
		>
	</div>
</div>

<div class={showDeleteConfirmation ? 'confirmation-popup' : 'confirmation-popup hidden'}>
	<div class="confirmation-content">
		<h2>Löschen Bestätigen</h2>
		<p>
			Sind Sie sicher, dass Sie den Benutzer mit der ID <span>{identifierToDelete}</span> löschen möchten?
		</p>
		<div class="confirmation-buttons">
			<button class="confirm" on:click={confirmDelete}>Ja</button>
			<button class="cancel" on:click={cancelDelete}>Nein</button>
		</div>
	</div>
</div>

<div>
	<div class="data-table" style="overflow-x: hidden;">
		<table id="userManagementTable" class="display" style="width:100%">
			<thead>
				<tr>
					<th>{$t('userIdentifier')}</th>
					<th>{$t('userRole')}</th>
					<th class="dateColumn">{$t('userRegistryDate')}</th>
					<th>{$t('userCreator')}</th>
					<th class="dateColumn">{$t('userFirstLogin')}</th>
					<th class="dateColumn">{$t('userLastLogin')}</th>
					<th>{$t('userTimeOnline')} (i. Sec.)</th>
					<th>{$t('userUserFilter')}</th>
					<th>{$t('userPseudonymization')}</th>
					<th>{$t('userStatus')}</th>
					<th class="dateColumn">{$t('userLastModifiedAt')}</th>
					<th class="dateColumn">{$t('userLastModifiedBy')}</th>
					<th>Delete</th>
				</tr>
			</thead>
		</table>
	</div>
</div>

<style>
	@import 'datatables.net-dt/css/jquery.dataTables.css';

	.grid-container {
		height: 50px;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		margin-bottom: 20px;
	}

	.icon-text-container {
		display: flex;
		align-items: center;
	}

	.icon-text-container img {
		margin-right: 5px; /* Adjust margin as needed */
	}

	.iconRound {
		width: 14px; /* Anpassen der Breite nach Bedarf */
		height: 14px; /* Anpassen der Höhe nach Bedarf */
	}

	.confirmation-popup {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background-color: #fff;
		padding: 20px;
		border: 1px solid #ccc;
		border-radius: 5px;
		box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
		z-index: 9999;
	}
	.confirmation-popup.hidden {
		display: none;
	}
	.confirmation-content {
		text-align: center;
	}
	.confirmation-content span {
		font-weight: bold;
	}
	.confirmation-buttons {
		margin-top: 10px;
	}
	.confirmation-buttons button {
		margin-right: 10px;
		padding: 5px 10px;
		border-radius: 5px;
		cursor: pointer;
	}
	.confirmation-buttons button.confirm {
		background-color: #4CAF50; /* Green */
		color: white;
		border: none;
	}
	.confirmation-buttons button.cancel {
		background-color: #f44336; /* Red */
		color: white;
		border: none;
	}



    .iconRound {
        width: 16px;
        height: 16px;
    }






</style>
