<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { showToast } from '../store/toastStore';
	import { get } from 'svelte/store';
	import { t } from '../store/languageStore';
	import { getHeadlineOverview } from '../graphQl/gql-generic';
	import type { LensDataPasser } from '@samply/lens';
	import { iconPath } from '$lib/path-utils';

	const downloadIcon = iconPath('download-icon.svg');
	const infoIcon = iconPath('info-outlined.svg');
	const tableIcon = iconPath('table.svg');
	const maxIcon = iconPath('window-maximize.svg');
	const minIcon = iconPath('window-minimize.svg');
	const chartIcon = iconPath('chart-bar.svg');
	const top5ActiveIcon = iconPath('star-fill.svg');
	const top5InactiveIcon = iconPath('star.svg');
	const linearIcon = iconPath('linear.svg');
	const logarithmIcon = iconPath('logarithm.svg');
	const loadingIcon = iconPath('spinner.svg');
	const nulloffIcon = iconPath('null-off.svg');
	const nullonIcon = iconPath('null-on.svg');
	const continueIcon = iconPath('continue.svg');

	export let headlineTitle: string;
	export let headlineTooltip: string | null = null;
	export let headlineMaximize: boolean | null = null;
	export let headlineShowChart: boolean | null = null;
	export let headlineIsChart: boolean | null = null;
	export let headlineInitialTop5: boolean | null = null;
	export let headlineInitialTop10: boolean | null = null;
	export let headlineInitialLogarithm: boolean | null = null;
	export let headlineInputTableData: Record<string, unknown>[] | null = null;
	export let headlineInputTableHeader: string[] | null = null;
	export let headlineChartJSElement: HTMLCanvasElement | null = null;
	export let headlineD3Element: HTMLObjectElement | SVGSVGElement | null = null;
	export let headlineLoading: boolean | null = null;
	export let headlineLoadingStatus: number | null = null;
	export let headlineNull: boolean | null = null;
	export let headlineCollection: string | null = null;
	export let headlineIsPaused: boolean | null = null;

	let downloadName: string;

	const dispatch = createEventDispatcher();

	function copyInfo() {
		if (headlineTooltip) {
			const plainText = headlineTooltip.replace(/<[^>]*>/g, '');
			navigator.clipboard.writeText(plainText);
			showToast('Text des Informationsbuttons in Zwischenablage kopiert.');
		}
	}

	function toggleChart() {
		headlineShowChart = !headlineShowChart;
		headlineIsChart = headlineShowChart;
		dispatch('chartToggled', { headlineShowChart });
	}

	function maximize() {
		headlineMaximize = !headlineMaximize;
		dispatch('maximized', { headlineMaximize });
	}

	function toggleLogarithm() {
		headlineInitialLogarithm = !headlineInitialLogarithm;
		dispatch('logarithmToggled', { headlineInitialLogarithm });
	}

	function toggleTop5() {
		headlineInitialTop5 = !headlineInitialTop5;
		dispatch('top5Toggled', { headlineInitialTop5 });
	}

	function toggleContinue() {
		dispatch('conitnueToggled');
	}

	function toggleNull() {
		headlineNull = !headlineNull;
		dispatch('nullToggled', { headlineNull });
	}

	function exportChart() {
		if (headlineChartJSElement != null) {
			exportChartJSChart();
		} else {
			exportD3Chart();
		}
	}

	function exportChartJSChart() {
		const canvasElement = headlineChartJSElement;

		const tempCanvas = document.createElement('canvas');
		if (canvasElement) {
			tempCanvas.width = canvasElement.width;
			tempCanvas.height = canvasElement.height;
			const tempCtx = tempCanvas.getContext('2d');

			if (tempCtx) {
				tempCtx.drawImage(canvasElement, 0, 0);

				const imgData = tempCanvas.toDataURL('image/png');

				const link = document.createElement('a');
				link.href = imgData;
				link.download = downloadName;
				link.click();
			}
		}
	}

	function exportD3Chart() {
		if (headlineD3Element != null) {
			let svgElement;
			if (headlineD3Element instanceof HTMLObjectElement) {
				// Wenn es sich um ein <object>-Element handelt, das SVG extrahieren
				const objectDoc = headlineD3Element.contentDocument;
				if (objectDoc) {
					svgElement = objectDoc.querySelector('svg');
				}
			} else {
				svgElement = headlineD3Element.querySelector('svg');
			}

			if (!svgElement) {
				return;
			}

			const svgString = new XMLSerializer().serializeToString(svgElement);
			const img = new Image();
			img.src = 'data:image/svg+xml,' + encodeURIComponent(svgString);

			img.onload = () => {
				const canvas = document.createElement('canvas');
				const context = canvas.getContext('2d');
				canvas.width = headlineD3Element?.clientWidth ?? 0;
				canvas.height = headlineD3Element?.clientHeight ?? 0;
				if (context) context.drawImage(img, 0, 0);
				const imgData = canvas.toDataURL('image/png');

				const link = document.createElement('a');
				link.href = imgData;
				link.download = downloadName;
				link.click();
			};
		}
	}

	function exportTable() {
		if (!headlineInputTableData || !headlineInputTableHeader) {
			showToast('Keine Tabellendaten zum Exportieren verfügbar.');
			return;
		}

		// Verwenden Sie das bereits initialisierte `data`-Array
		let exportData = [...headlineInputTableData];

		//console.log("exportdata", headlineInputTableData);
		//console.log("headerdata", headlineInputTableHeader);
		// Iteriere durch jede Zeile und jedes Feld und ersetze Null durch leere Zeichenfolge
		exportData = exportData.map((row) => {
			return Object.keys(row).reduce<Record<string, unknown>>((acc, key) => {
				acc[key] = row[key] === null ? '' : row[key];
				return acc;
			}, {});
		});

		if (exportData) {
			// Funktion, die rekursiv durch die Objekte geht und die Werte extrahiert
			const flattenObject = (obj: Record<string, unknown>, parentKey = ''): Record<string, unknown> => {
				// Check, ob obj nicht null oder undefined ist
				if (obj && typeof obj === 'object') {
					return Object.keys(obj).reduce((acc, key) => {
						const newKey = parentKey ? `${parentKey}.${key}` : key;
						if (typeof obj[key] === 'object' && obj[key] !== null) {
							return { ...acc, ...flattenObject(obj[key] as Record<string, unknown>, newKey) };
						} else {
							// Ersetzen Sie leere Werte durch leere Zeichenfolgen
							const value = obj[key] === null || obj[key] === undefined ? '' : obj[key];
							return { ...acc, [newKey]: value };
						}
					}, {});
				} else {
					return {};
				}
			};

			// Flachen Sie die Daten, um mit untergeordneten Objekten umzugehen
			const flattenedData = exportData.map((row) => flattenObject(row));

			const csvHeader = headlineInputTableHeader.join(';');

			// Function to safely escape CSV values
			const escapeCSVValue = (value: unknown) => {
				if (typeof value === 'string' && (value.includes('\n') || value.includes(';'))) {
					// If the value contains newlines or semicolons, wrap it in double quotes and escape any double quotes within the string
					return `"${value.replace(/"/g, '""')}"`;
				}
				return value;
			};

			//const csvContent = 'data:text/csv;charset=utf-8,' + flattenedData.map((row) => Object.values(row).map(value => value === null || value === undefined ? '' : value).join(';')).join('\n');
			//const csvContent = 'data:text/csv;charset=utf-8,' + flattenedData.map((row) => Object.values(row).map(value => value === null || value === undefined ? ';' : value).join(';')).join('\n');

			const csvContent =
				'data:text/csv;charset=utf-8,' +
				[csvHeader]
					.concat(
						flattenedData.map((row) =>
							Object.values(row)
								.map((value) => escapeCSVValue(value))
								.join(';')
						)
					)
					.join('\n');

			// Erstellen Sie ein verstecktes Link-Element, um den Download auszulösen
			const link = document.createElement('a');
			link.href = encodeURI(csvContent);
			link.target = '_blank';
			link.download = downloadName;
			link.style.display = 'none';

			// Fügen Sie das Link-Element zum Dokument hinzu und klicken Sie es an, um den Download auszulösen
			document.body.appendChild(link);
			link.click();

			// Entfernen Sie das Link-Element
			document.body.removeChild(link);
		}
	}

	function convertToCamelCase(inputString: string) {
		// Entfernen Sie Leerzeichen und teilen Sie den String in Wörter, indem Sie auch Punkte ignorieren
		let words = inputString.trim().split(/[\s.]+/); // Split by spaces or periods

		// Falls es nur ein Wort gibt, konvertieren Sie es in CamelCase und geben es zurück
		if (words.length === 1) {
			return words[0].toLowerCase();
		}

		// Andernfalls, konvertieren Sie die Wörter in CamelCase
		let camelCaseWords = words.map((word, index) => {
			// Das erste Wort bleibt unverändert, die anderen werden großgeschrieben
			if (index === 0) {
				return word.toLowerCase();
			} else {
				return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
			}
		});

		// Verbinden Sie die Wörter und geben Sie das Ergebnis zurück
		return camelCaseWords.join('');
	}

	let dataPasser: LensDataPasser;
	let loadingMaxValue = 1;

	onMount(async () => {
		await import('@samply/lens');
		if (headlineShowChart != null) {
			headlineIsChart = headlineShowChart;
		}
		downloadName = convertToCamelCase(headlineTitle);

		let filter = JSON.stringify(dataPasser.getAstAPI());
		let result;
		if (headlineCollection) {
			result = await getHeadlineOverview(headlineCollection, filter);
			loadingMaxValue = result[0].count / 100;
		}
	});

	let mouseX = 0;
	let mouseY = 0;
	let tooltipPosition = '';

	// Reactive translation function for template usage
	const translate = (key: string): string => get(t)(key);

	const handleMouseEnter = (event: MouseEvent) => {
		tooltipPosition = '';
		mouseX = event.clientX;
		mouseY = event.clientY;
		if (mouseX > 1500) {
			tooltipPosition += 'transform: translateX(-90%)';
		} else {
			tooltipPosition += 'transform: translateX(-0%)';
		}
		if (mouseY > 500) {
			tooltipPosition += ' translateY(-110%);';
		} else {
			tooltipPosition += ' translateY(-0%);';
		}
	};
</script>

<!-- prettier-ignore -->
<lens-data-passer bind:this={dataPasser}></lens-data-passer>
<div>
	<div class="straight-line-container">
		<div class="headline-title-container">
			<b>{headlineTitle}</b>
			{#if headlineLoading}
				<i
					>→ {translate('loadingContent')}
					{Math.round((headlineLoadingStatus ?? 0) / loadingMaxValue)} %</i
				>
				{#if headlineIsPaused}
					<button
						on:mouseenter={handleMouseEnter}
						class="iconRoundButton tooltip"
						on:click={toggleContinue}
					>
						<span class="tooltiptext" style={tooltipPosition}
							><b>Continue Loading</b><br /><br /><i
								>To ensure sufficient performance<br /> a maximum of 50,000 entries can be loaded.</i
							></span
						>
						<img src={continueIcon} alt="Toggle" class="iconRound" />
					</button>
				{:else}
					<button class="spinnerButton">
						<img id="spinner" src={loadingIcon} alt="Spinner" />
					</button>
				{/if}
			{/if}
		</div>
		<div class="icons-container">
			{#if headlineIsChart}
				{#if headlineInitialTop5 != null}
					<button
						on:mouseenter={handleMouseEnter}
						class="iconRoundButton tooltip"
						on:click={toggleTop5}
					>
						<span class="tooltiptext" style={tooltipPosition}>
							{headlineInitialTop5
								? translate('showAllResults')
								: headlineInitialTop10
								? translate('limitTop10Results')
								: translate('limitTop5Results')}
						</span>
						<img
							src={headlineInitialTop5 ? top5InactiveIcon : top5ActiveIcon}
							alt="Toggle"
							class="iconRound"
						/>
					</button>
				{/if}
				{#if headlineInitialLogarithm != null}
					<button
						on:mouseenter={handleMouseEnter}
						class="iconRoundButton tooltip"
						on:click={toggleLogarithm}
					>
						<span class="tooltiptext" style={tooltipPosition}
							>{headlineInitialLogarithm ? translate('changeToLinearView') : translate('changeToLogarithmicView')}
						</span>
						<img
							src={headlineInitialLogarithm ? linearIcon : logarithmIcon}
							alt="Toggle"
							class="iconRound"
						/>
					</button>
				{/if}
			{/if}
			{#if headlineShowChart != null}
				<button
					on:mouseenter={handleMouseEnter}
					class="iconRoundButton tooltip"
					on:click={toggleChart}
				>
					<span class="tooltiptext" style={tooltipPosition}
						>{headlineShowChart ? translate('headlineChangeToTable') : translate('headlineChangeToChart')}
					</span>
					<img src={headlineShowChart ? tableIcon : chartIcon} alt="Toggle" class="iconRound" />
				</button>
			{/if}
			{#if headlineNull != null}
				<button
					on:mouseenter={handleMouseEnter}
					class="iconRoundButton tooltip"
					on:click={toggleNull}
				>
					<span class="tooltiptext" style={tooltipPosition}
						>{headlineNull ? translate('hideNumOfEmptyValues') : translate('showNumOfEmptyValues')}
					</span>
					<img src={headlineNull ? nulloffIcon : nullonIcon} alt="Toggle" class="iconRound" />
				</button>
			{/if}
			<button
				on:mouseenter={handleMouseEnter}
				class="iconRoundButton tooltip"
				on:click={() => (headlineIsChart ? exportChart() : exportTable())}
			>
				<span class="tooltiptext" style={tooltipPosition}
					>Download {headlineIsChart ? translate('chart') : translate('CSVFile')}</span
				>
				<img src={downloadIcon} alt="download" class="iconRound" />
			</button>

			{#if headlineTooltip}
				<button
					on:mouseenter={handleMouseEnter}
					class="iconRoundButton tooltip"
					on:click={copyInfo}
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<span class="tooltiptext" style={tooltipPosition}>{@html headlineTooltip}</span>
					<img src={infoIcon} alt="info" class="iconRound" />
				</button>
			{/if}
			{#if headlineMaximize != null}
				<button
					on:mouseenter={handleMouseEnter}
					class="iconRoundButton tooltip"
					on:click={maximize}
				>
					<span class="tooltiptext" style={tooltipPosition}
						>{headlineMaximize ? translate('minimize') : translate('maximize')}
					</span>
					<img src={headlineMaximize ? minIcon : maxIcon} alt="Toggle" class="iconRound" />
				</button>
			{/if}
		</div>
	</div>
</div>
