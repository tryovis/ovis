import { snapshotExportContext, type ExportContext } from './export-context';
import { saveExportBlob } from './export-workflow';

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('Chart encoding failed'))),
			'image/png'
		);
	});
}

async function saveChart(canvas: HTMLCanvasElement, downloadName: string, context?: ExportContext) {
	const snapshot = snapshotExportContext(context);
	const blob = await canvasBlob(canvas);
	await saveExportBlob({
		blob,
		fileName: downloadName.toLowerCase().endsWith('.png') ? downloadName : `${downloadName}.png`,
		kind: 'CHART',
		format: 'PNG',
		context: {
			...snapshot,
			selection: { ...snapshot.selection, width: canvas.width, height: canvas.height }
		}
	});
}

export async function downloadCanvasChart(
	canvasElement: HTMLCanvasElement,
	downloadName: string,
	context?: ExportContext
): Promise<void> {
	const tempCanvas = document.createElement('canvas');
	tempCanvas.width = canvasElement.width;
	tempCanvas.height = canvasElement.height;
	const drawingContext = tempCanvas.getContext('2d');
	if (!drawingContext) throw new Error('Chart canvas unavailable');
	// Freeze the displayed image before awaiting confirmation or audit requests.
	drawingContext.drawImage(canvasElement, 0, 0);
	await saveChart(tempCanvas, downloadName, context);
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

export async function downloadSvgChart(
	chartElement: HTMLObjectElement | SVGSVGElement,
	downloadName: string,
	context?: ExportContext
): Promise<void> {
	const svgElement =
		chartElement instanceof HTMLObjectElement
			? chartElement.contentDocument?.querySelector('svg')
			: chartElement.matches('svg')
			? chartElement
			: chartElement.querySelector('svg');
	if (!svgElement) throw new Error('Chart SVG unavailable');
	const snapshot = snapshotExportContext(context);
	const width = chartElement.clientWidth;
	const height = chartElement.clientHeight;
	const image = new Image();
	const loaded = new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () => reject(new Error('Chart SVG could not be rendered'));
	});
	image.src =
		'data:image/svg+xml,' + encodeURIComponent(new XMLSerializer().serializeToString(svgElement));
	await loaded;
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const drawingContext = canvas.getContext('2d');
	if (!drawingContext) throw new Error('Chart canvas unavailable');
	drawingContext.drawImage(image, 0, 0);
	await saveChart(canvas, downloadName, snapshot);
}
