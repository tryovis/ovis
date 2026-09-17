/**
 * Keep option requests within one editor instance and its authenticated session.
 * Construct a new cache when the editor opens; dispose it when the editor closes.
 *
 * @param {(key: string, system: string) => Promise<string[]>} loadOptions
 * @param {{ onChange?: (key: string, system: string, values: string[]) => void, maxSuggestions?: number }} [options]
 */
export function createFilterEditorOptions(loadOptions, { onChange, maxSuggestions = 200 } = {}) {
	const cache = new Map();
	const pending = new Map();
	const suggestionLimit = Number.isFinite(maxSuggestions)
		? Math.max(0, Math.floor(maxSuggestions))
		: 200;
	let disposed = false;

	function identity(key, system) {
		const normalizedKey = typeof key === 'string' ? key.replace(/^!/, '') : '';
		const normalizedSystem = typeof system === 'string' ? system : '';
		return {
			key: normalizedKey,
			system: normalizedSystem,
			id: JSON.stringify([normalizedKey, normalizedSystem])
		};
	}

	function get(key, system) {
		return cache.get(identity(key, system).id);
	}

	function load(key, system) {
		const field = identity(key, system);
		if (disposed || !field.key || !field.system) return Promise.resolve([]);
		if (cache.has(field.id)) return Promise.resolve(cache.get(field.id));
		if (pending.has(field.id)) return pending.get(field.id);

		// Start through a promise so synchronous loader failures are retryable too.
		const request = Promise.resolve()
			.then(() => {
				if (disposed) return [];
				return loadOptions(field.key, field.system);
			})
			.then(
				(values) => {
					if (disposed) return [];
					if (!Array.isArray(values)) return [];
					const options = values.filter((value) => typeof value === 'string');
					cache.set(field.id, options);
					onChange?.(field.key, field.system, options);
					return options;
				},
				() => []
			)
			.finally(() => pending.delete(field.id));
		pending.set(field.id, request);
		return request;
	}

	function suggestions(key, system, search = '') {
		if (disposed || suggestionLimit === 0) return [];
		const values = get(key, system) || [];
		const query = String(search ?? '').toLowerCase();
		const matches = [];
		for (const value of values) {
			if (!query || value.toLowerCase().includes(query)) {
				matches.push(value);
				if (matches.length === suggestionLimit) break;
			}
		}
		return matches;
	}

	function dispose() {
		disposed = true;
		cache.clear();
		pending.clear();
	}

	return { load, get, suggestions, dispose };
}
