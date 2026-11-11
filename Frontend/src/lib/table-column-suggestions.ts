const suggestionLimit = 30;

type ColumnSearch = { column: number; value: string };

/** Scan only the requested column and active sibling filters. Yield during long, sparse searches. */
export async function collectColumnSuggestions(
	rowCount: number,
	read: (row: number, column: number) => string,
	column: number,
	search: string,
	filters: ColumnSearch[],
	signal: AbortSignal
): Promise<string[]> {
	const needle = search.toLowerCase();
	const siblings = filters.map((filter) => ({ ...filter, value: filter.value.toLowerCase() }));
	const values = new Set<string>();
	for (let row = 0; row < rowCount; row++) {
		if (row && row % 2000 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
		if (signal.aborted) return [];
		const value = read(row, column);
		if (!value.trim() || values.has(value) || !value.toLowerCase().includes(needle)) continue;
		if (siblings.some((filter) => !read(row, filter.column).toLowerCase().includes(filter.value)))
			continue;
		values.add(value);
		if (values.size === suggestionLimit) break;
	}
	return [...values];
}

export function createColumnFilterInput(cell: HTMLTableCellElement, label: string) {
	const wrapper = document.createElement('span');
	wrapper.className = 'ovis-column-filter';
	const input = document.createElement('input');
	input.type = 'text';
	input.placeholder = label;
	input.setAttribute('aria-label', label);
	input.autocomplete = 'off';
	wrapper.append(input);
	cell.replaceChildren(wrapper);
	return input;
}

type ColumnFilterOptions = {
	id: string;
	load: (query: string, signal: AbortSignal) => Promise<string[]>;
	apply: (value: string) => void;
	loadingMessage: string;
	emptyMessage: string;
	errorMessage: string;
};

/** The input owns focus throughout. Only the active filter has a popup or a pending lookup. */
export function bindColumnFilter(input: HTMLInputElement, options: ColumnFilterOptions) {
	const listeners = new AbortController();
	const { signal } = listeners;
	let popup: HTMLDivElement | undefined;
	let popupEvents: AbortController | undefined;
	let lookup: AbortController | undefined;
	let lookupTimer: ReturnType<typeof setTimeout>;
	let loadingTimer: ReturnType<typeof setTimeout>;
	let filterTimer: ReturnType<typeof setTimeout>;
	let completeResult: { query: string; values: string[] } | undefined;
	let values: string[] = [];
	let highlighted = -1;
	let pendingArrow = 0;

	input.setAttribute('role', 'combobox');
	input.setAttribute('aria-autocomplete', 'list');
	input.setAttribute('aria-expanded', 'false');

	function hidePopup() {
		popupEvents?.abort();
		popupEvents = undefined;
		popup?.remove();
		popup = undefined;
		highlighted = -1;
		values = [];
		input.removeAttribute('aria-controls');
		input.removeAttribute('aria-activedescendant');
		input.setAttribute('aria-expanded', 'false');
	}

	function close() {
		clearTimeout(lookupTimer);
		clearTimeout(loadingTimer);
		lookup?.abort();
		lookup = undefined;
		completeResult = undefined;
		pendingArrow = 0;
		hidePopup();
	}

	function apply() {
		clearTimeout(filterTimer);
		input.title = input.value;
		if (input.isConnected) options.apply(input.value);
	}

	function select(index: number) {
		if (values[index] === undefined) return;
		input.value = values[index];
		close();
		apply();
	}

	function highlight(index: number) {
		if (!popup || !values.length) return;
		popup.children[highlighted]?.setAttribute('aria-selected', 'false');
		highlighted = Math.max(0, Math.min(index, values.length - 1));
		const item = popup.children[highlighted] as HTMLElement;
		item.setAttribute('aria-selected', 'true');
		input.setAttribute('aria-activedescendant', item.id);
		item.scrollIntoView({ block: 'nearest' });
	}

	function position() {
		if (!popup) return;
		const rect = input.getBoundingClientRect();
		const margin = 4;
		const below = window.innerHeight - rect.bottom - margin * 2;
		const above = rect.top - margin * 2;
		const opensAbove = below < 180 && above > below;
		if (
			!input.isConnected ||
			rect.bottom <= 0 ||
			rect.top >= window.innerHeight ||
			rect.right <= 0 ||
			rect.left >= window.innerWidth
		) {
			close();
			return;
		}
		const width = Math.min(Math.max(160, rect.width), window.innerWidth - margin * 2);
		Object.assign(popup.style, {
			width: width + 'px',
			left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)) + 'px',
			top: opensAbove ? 'auto' : rect.bottom + margin + 'px',
			bottom: opensAbove ? window.innerHeight - rect.top + margin + 'px' : 'auto',
			maxHeight: Math.min(190, Math.max(32, opensAbove ? above : below)) + 'px'
		});
	}

	function show(matches: string[], message?: string) {
		if (!popup) {
			popup = document.createElement('div');
			popup.id = options.id;
			popup.className = 'ovis-column-suggestions';
			popup.setAttribute('role', 'listbox');
			popup.setAttribute('aria-label', input.placeholder);
			// A top-layer popup can stay with its input when the table is replaced.
			if (typeof popup.showPopover === 'function') {
				popup.setAttribute('popover', 'manual');
				input.after(popup);
				popup.showPopover();
			} else {
				(input.closest('dialog') ?? document.body).append(popup);
			}
			input.setAttribute('aria-controls', options.id);
			input.setAttribute('aria-expanded', 'true');
			popup.addEventListener('mousedown', (event) => event.preventDefault());
			popup.addEventListener('click', (event) => {
				const option = (event.target as Element).closest<HTMLElement>('[data-index]');
				if (option) select(Number(option.dataset.index));
			});
			popupEvents = new AbortController();
			const popupSignal = popupEvents.signal;
			if (typeof ResizeObserver !== 'undefined') {
				const observer = new ResizeObserver(position);
				observer.observe(input);
				popupSignal.addEventListener('abort', () => observer.disconnect(), { once: true });
			}
			window.addEventListener('resize', position, { signal: popupSignal });
			window.addEventListener(
				'scroll',
				(event) => {
					if (event.target !== popup) position();
				},
				{ capture: true, passive: true, signal: popupSignal }
			);
		}
		const previousSelection = values[highlighted];
		values = matches.slice(0, suggestionLimit);
		const items = values.map((value, index) => {
			const item = document.createElement('div');
			item.setAttribute('role', 'option');
			item.setAttribute('aria-selected', 'false');
			item.dataset.index = String(index);
			item.id = options.id + '-' + index;
			item.textContent = value;
			item.title = value;
			return item;
		});
		if (!items.length && message) {
			const status = document.createElement('div');
			status.setAttribute('role', 'option');
			status.setAttribute('aria-disabled', 'true');
			status.textContent = message;
			items.push(status);
		}
		highlighted = -1;
		input.removeAttribute('aria-activedescendant');
		popup.replaceChildren(...items);
		popup.scrollTop = 0;
		position();
		const previousIndex = values.indexOf(previousSelection);
		if (previousIndex !== -1) highlight(previousIndex);
	}

	function request() {
		clearTimeout(lookupTimer);
		clearTimeout(loadingTimer);
		lookup?.abort();
		const controller = new AbortController();
		lookup = controller;
		const query = input.value;
		const needle = query.toLowerCase();
		const matchesQuery = (value: string) => value.toLowerCase().includes(needle);
		if (completeResult && needle.startsWith(completeResult.query)) {
			show(completeResult.values.filter(matchesQuery), options.emptyMessage);
			return;
		}
		completeResult = undefined;
		if (popup) {
			const subset = values.filter(matchesQuery);
			if (subset.length) show(subset);
			else hidePopup();
		}
		lookupTimer = setTimeout(async () => {
			let matches: string[] | undefined;
			loadingTimer = setTimeout(() => {
				if (input.isConnected && document.activeElement === input && !popup)
					show([], options.loadingMessage);
			}, 300);
			try {
				matches = await options.load(query, controller.signal);
			} catch {
				// A failed lookup leaves free-text filtering available and is never cached.
			}
			if (controller.signal.aborted || !input.isConnected || document.activeElement !== input)
				return;
			clearTimeout(loadingTimer);
			if (matches && matches.length < suggestionLimit) {
				completeResult = { query: needle, values: matches };
			}
			show(matches ?? [], matches ? options.emptyMessage : options.errorMessage);
			if (pendingArrow && matches?.length) highlight(pendingArrow > 0 ? 0 : matches.length - 1);
			pendingArrow = 0;
		}, 180);
	}

	const open = () => {
		if (!lookup) request();
	};
	input.addEventListener('focus', open, { signal });
	input.addEventListener('click', open, { signal });
	input.addEventListener(
		'input',
		() => {
			clearTimeout(filterTimer);
			filterTimer = setTimeout(apply, 500);
			request();
		},
		{ signal }
	);
	input.addEventListener('change', apply, { signal });
	input.addEventListener(
		'blur',
		() => {
			close();
			// Selecting a suggestion sets the value programmatically. Commit later edits
			// here too, as the browser can omit change when the original text is restored.
			apply();
		},
		{ signal }
	);
	input.addEventListener(
		'keydown',
		(event) => {
			if (event.isComposing) return;
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				const direction = event.key === 'ArrowDown' ? 1 : -1;
				if (values.length)
					highlight(highlighted < 0 && direction < 0 ? values.length - 1 : highlighted + direction);
				else {
					pendingArrow = direction;
					open();
				}
			} else if (event.key === 'Enter') {
				event.preventDefault();
				if (highlighted >= 0) select(highlighted);
				else {
					close();
					apply();
				}
			} else if (event.key === 'Escape' && lookup) {
				event.preventDefault();
				event.stopPropagation();
				close();
			}
		},
		{ signal }
	);
	return () => {
		listeners.abort();
		clearTimeout(filterTimer);
		close();
	};
}
