import { userStore } from '../store/userStore';
import { get } from 'svelte/store';

type FilterNode = {
	operand?: string;
	children?: FilterNode[];
	[key: string]: unknown;
};

const emptyFilter = (): FilterNode => ({ operand: 'OR', children: [] });

export async function addUserFilter(filter: FilterNode | string | null) {
	try {
		const user = get(userStore);
		let userFilter: FilterNode | string | null = user?.currentFilter || null;

		if (!userFilter) {
			console.warn('Kein Benutzerfilter verfügbar.');
			return filter;
		}

		// Falls filter ein leerer String, null oder undefined ist, ersetze es durch eine Standardstruktur
		if (!filter || (typeof filter === 'string' && filter.trim() === '')) {
			filter = emptyFilter();
		} else if (typeof filter === 'string') {
			try {
				filter = JSON.parse(filter) as FilterNode;
			} catch (error) {
				console.error('Fehler beim Parsen des Filters:', error);
				return emptyFilter();
			}
		}

		// Falls userFilter ein JSON-String ist, parsen
		if (typeof userFilter === 'string') {
			try {
				userFilter = JSON.parse(userFilter) as FilterNode;
			} catch (error) {
				console.error('Fehler beim Parsen des Benutzerfilters:', error);
				return filter; // Fallback auf den Originalfilter
			}
		}

		// Funktion zum Entfernen leerer OR-Blöcke
		function cleanFilter(filterObj: FilterNode): FilterNode {
			if (Array.isArray(filterObj.children)) {
				filterObj.children = filterObj.children
					.map((child) => cleanFilter(child)) // Rekursive Bereinigung
					.filter(
						(child) => !(child.operand === 'OR' && child.children && child.children.length === 0)
					); // Entferne leere OR-Knoten
			}
			return filterObj;
		}

		filter = cleanFilter(filter);
		userFilter = cleanFilter(userFilter);

		// Falls der ursprüngliche Filter nur ein leeres OR-Objekt ist, verwende nur den User-Filter
		if (!filter.children || filter.children.length === 0) {
			return userFilter;
		}

		return {
			operand: 'AND',
			children: [filter, userFilter]
		};
	} catch (error) {
		console.error('Fehler beim Hinzufügen des User-Filters:', error);
		return emptyFilter(); // Sicherstellen, dass ein gültiges Objekt zurückgegeben wird
	}
}

