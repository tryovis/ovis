export function downloadCanvasChart(canvasElement: HTMLCanvasElement, downloadName: string): void {
	const tempCanvas = document.createElement('canvas');
	tempCanvas.width = canvasElement.width;
	tempCanvas.height = canvasElement.height;
	const context = tempCanvas.getContext('2d');
	if (!context) return;

	context.drawImage(canvasElement, 0, 0);
	const link = document.createElement('a');
	link.href = tempCanvas.toDataURL('image/png');
	link.download = downloadName;
	link.click();
}

export function createDownloadName(title: string): string {
	return title
		.trim()
		.split(/[\s.]+/)
		.map((word, index) =>
			index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
		)
		.join('');
}

export function downloadSvgChart(
	chartElement: HTMLObjectElement | SVGSVGElement,
	downloadName: string
): void {
	const svgElement =
		chartElement instanceof HTMLObjectElement
			? chartElement.contentDocument?.querySelector('svg')
			: chartElement.matches('svg')
				? chartElement
				: chartElement.querySelector('svg');
	if (!svgElement) return;

	const image = new Image();
	image.src =
		'data:image/svg+xml,' + encodeURIComponent(new XMLSerializer().serializeToString(svgElement));
	image.onload = () => {
		const canvas = document.createElement('canvas');
		canvas.width = chartElement.clientWidth;
		canvas.height = chartElement.clientHeight;
		const context = canvas.getContext('2d');
		if (!context) return;

		context.drawImage(image, 0, 0);
		const link = document.createElement('a');
		link.href = canvas.toDataURL('image/png');
		link.download = downloadName;
		link.click();
	};
}
