export function isDiagnosisLegendItemHidden(chart, label) {
	const matchingDatasetIndexes = chart.data.datasets
		.map((dataset, index) => (dataset.label === label ? index : -1))
		.filter((index) => index !== -1);

	return (
		matchingDatasetIndexes.length > 0 &&
		matchingDatasetIndexes.every((index) => !chart.isDatasetVisible(index))
	);
}

export function toggleDiagnosisLegendItemVisibility(chart, legendItem) {
	const showDatasets = Boolean(legendItem.hidden);

	chart.data.datasets.forEach((dataset, index) => {
		if (dataset.label === legendItem.text) {
			chart.setDatasetVisibility(index, showDatasets);
		}
	});

	legendItem.hidden = !showDatasets;
	chart.update();
}
