export function prepareCategoryChart(rawInput, { showNull = false, showTop5 = false } = {}) {
	const labels = Array.isArray(rawInput?.label) ? rawInput.label : [];
	const counts = Array.isArray(rawInput?.count) ? rawInput.count : [];
	const full = { label: [], count: [] };
	let missingValueCount = 0;

	labels.forEach((label, index) => {
		const count = Number(counts[index]) || 0;
		if (typeof label !== 'string' || !label.trim()) {
			missingValueCount += count;
			return;
		}
		full.label.push(label);
		full.count.push(count);
	});

	if (showNull && missingValueCount > 0) {
		full.label.push('-');
		full.count.push(missingValueCount);
	}

	return {
		full,
		chart: showTop5 ? convertToTop5(full) : cloneChart(full),
		missingValueCount
	};
}

export function convertToTop5(input) {
	const sorted = input.label
		.map((label, index) => ({ label, count: input.count[index] }))
		.sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
	const top = sorted.slice(0, 5);
	const remainingCount = sorted.slice(5).reduce((sum, item) => sum + item.count, 0);

	return {
		label: [...top.map((item) => item.label), ...(remainingCount > 0 ? ['Sonstige'] : [])],
		count: [...top.map((item) => item.count), ...(remainingCount > 0 ? [remainingCount] : [])]
	};
}

function cloneChart(input) {
	return {
		label: [...input.label],
		count: [...input.count]
	};
}
