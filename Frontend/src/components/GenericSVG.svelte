<script lang="ts">
	// @ts-nocheck
	import { getDiagnosisBarChart } from '../graphQl/gql-diagnosis';
	import { getPatientCohortMapChart } from '../graphQl/gql-patient-cohort';
	import { getTNMBodyMap } from '../graphQl/gql-tnm';
	import { getTherapyRadiationMap } from '../graphQl/gql-therapy-radiation';
	import { userStore } from '../store/userStore';
	import Headline from '../components/Headline.svelte';
	import { createEventDispatcher, onMount } from 'svelte';
	import { createTable, changeRowCount } from '../tableBuilder.js';
	import * as d3 from 'd3';
	import { get } from 'svelte/store';
	import { t } from '../store/languageStore';
	import type { LensDataPasser } from '@samply/lens';
	import { reloadOnly } from '../store/reloadStore';
	import { filterActiveStore } from '../store/filterActiveStore.js';
	import { addUserFilter } from '../components/UserFilter';
	import { tick } from 'svelte';
	import { iconPath, publicAssetPath } from '$lib/path-utils';
	import type { AggregatedValue } from '../types/query';

	let filterActive = true;

	filterActiveStore.subscribe((value) => {
		filterActive = value.filterActive;
	});

	const backIcon = iconPath('back.svg');
	const loadingIcon = iconPath('spinner.svg');
	const maxSVGWidth = 1600;
	const maxSVGHeight = 760;
	const dispatch = createEventDispatcher();
	const tableShownRowsMax = 20;

	type SVGInputItem = {
		description?: string;
		label: string;
		count: number;
	};

	export let SVGType: string;
	export let currentSVG: string;
	export let currentLevel: number;
	export let SVGWidth: number;
	export let SVGHeight: number;
	export let headlineTitle: string;
	export let headlineTooltip: string;
	export let tableShownRowsMin: number;
	export let maxStoreValue = false;
	export let showLogarithmStoreValue = false;
	export let showChartStoreValue = true;
	export let showLegend: boolean = true;

	let dataPasser: LensDataPasser;

	let primaryColorRGB: { r: string; g: string; b: string };
	let currentSVGWidth = SVGWidth;
	let currentSVGHeight = SVGHeight;
	let inputArray: SVGInputItem[];
	let maxCount: number;
	let svgDoc: Document | null = null;
	let mapTable: import('datatables.net').Api<unknown> | null = null;
	let tableShownRows = tableShownRowsMin;
	let sortingIndex = 1;
	let tableName = SVGType + 'MapTable';
	let mounted = false;
	let svgObject: HTMLObjectElement | null = null;
	let currentCatalog = '';
	let tooltipText = '';
	let currentColor = '';
	let tooltip: HTMLElement | null = null;
	let oldSVG_level2 = '';
	let oldSVG_level3 = '';
	let maxLevel: number;
	let isToggled: boolean = false;
	let columns: { data: string }[];
	let headers: string[];

	// verhindert, dass veraltete async-Läufe noch einfärben
	let loadToken = 0;

	userStore.subscribe((value: { primaryColorRGB: { r?: string; g?: string; b?: string } }) => {
		primaryColorRGB = {
			r: value.primaryColorRGB?.r ?? '0',
			g: value.primaryColorRGB?.g ?? '0',
			b: value.primaryColorRGB?.b ?? '0'
		};
	});

	let filter = JSON.stringify({ operand: 'OR', children: [] });

	onMount(async () => {
		await import('@samply/lens');

		if (filterActive) {
			filter = JSON.stringify(dataPasser.getAstAPI());
		}
		filter = JSON.stringify(await addUserFilter(JSON.parse(filter)));

		await dynamicSVG();

		// Tabelle früh laden
		await loadDataForTableOnly();

		mounted = true;
		await tick();

		// SVG selbst lädt danach über on:load
		setMaxLevel();
	});

	async function dynamicSVG() {
		try {
			if (SVGType === 'diagnosis') {
				const result = await getDiagnosisBarChart(
					{
						genderWise: false,
						group: 'ICD_ICD10Group',
						abscissa: 'none'
					},
					filter
				);

				if (result.groups.length <= 1) {
					currentLevel = 2;
					currentCatalog = '';
					currentSVG = publicAssetPath(
						`/svg/diagnosisBodymap/level${currentLevel}_${replaceUmlauts(
							result.groups[0].label
						)}.svg`
					);
					const result2 = await getDiagnosisBarChart(
						{
							genderWise: false,
							group: 'ICD_ICD10_3',
							abscissa: 'none'
						},
						filter
					);

					if (result2.groups.length <= 1) {
						currentLevel = 3;
						currentSVG = publicAssetPath(
							`/svg/diagnosisBodymap/level${currentLevel}_${replaceUmlauts(
								result2.groups[0].label
							)}.svg`
						);
						const result3 = await getDiagnosisBarChart(
							{
								genderWise: false,
								group: 'ICD_ICD10',
								abscissa: 'none'
							},
							filter
						);

						if (result3.groups.length < 1) {
							currentLevel = 1;
						}
					}
				}
			} else if (SVGType === 'patient') {
				let result = await getPatientCohortMapChart('countryCode', filter);
				result = result.filter((item) => item.label !== null);

				if (result.length <= 1 && result[0]?.label === 'DE') {
					currentLevel = 2;
					currentSVG = publicAssetPath(
						`/svg/patientWorldMaps/level${currentLevel}_${replaceUmlauts(result[0].label)}.svg`
					);
					let result2 = await getPatientCohortMapChart('state', filter);
					result2 = result2.filter((item) => item.label !== null);

					if (result2.length <= 1) {
						currentLevel = 3;
						currentSVG = publicAssetPath(
							`/svg/patientWorldMaps/level${currentLevel}_${replaceUmlauts(result2[0].label)}.svg`
						);
						let result3 = await getPatientCohortMapChart('county', filter);
						result3 = result3.filter((item) => item.label !== null);

						if (result3.length <= 1) {
							const allowedCities = [
								'Augsburg',
								'Berlin',
								'Bremen',
								'Erlangen',
								'Hamburg',
								'München',
								'Regensburg',
								'Würzburg'
							];
							if (result3[0] && allowedCities.includes(result3[0].label)) {
								currentLevel = 4;
								currentSVG = publicAssetPath(
									`/svg/patientWorldMaps/level${currentLevel}_${replaceUmlauts(
										result3[0].label
									)}.svg`
								);
								let result4 = await getPatientCohortMapChart('postalCode', filter);
								result4 = result4.filter((item) => item.label !== null);

								if (result4.length < 1) {
									currentLevel = 1;
								}
							}
						}
					}
				}
			} else if (SVGType === 'therapy') {
				const result = await getTherapyRadiationMap('radiation_supArea', filter);
				const filteredResult = result.filter((item) => item.label !== null && item.label !== '');
				if (filteredResult.length <= 1) {
					currentLevel = 2;
					currentSVG = publicAssetPath(
						`/svg/radiationMap/level${currentLevel}_${replaceUmlauts(filteredResult[0].label)}.svg`
					);
				}
			}

			setCatalog();
		} catch (_e) {
			/* schweigend */
		}
	}

	async function loadDataForTableOnly() {
		setCatalog();
		switch (SVGType) {
			case 'therapy':
				await processRadiation();
				break;
			case 'metastasis':
				await processMetastasis();
				break;
			case 'patient':
				await processGeo();
				break;
			case 'diagnosis':
				await processDiagnosis();
				break;
			default:
				break;
		}
	}

	async function initializeSVG(): Promise<void> {
		const doc = svgObject?.contentDocument;
		if (!doc || !inputArray?.length) return;

		svgDoc = doc;
		maxCount = Math.max(...inputArray.map((item) => item.count));

		recolor(svgObject);
		await addLegend(svgObject);

		isToggled = false;
		setMaxLevel();
	}

	async function handleSvgLoad(): Promise<void> {
		const token = ++loadToken;
		await tick();

		const obj = svgObject;
		const doc = obj?.contentDocument;
		if (!obj || !doc) return;

		svgDoc = doc;
		setCatalog();

		switch (SVGType) {
			case 'therapy':
				await processRadiation(token);
				break;
			case 'metastasis':
				await processMetastasis(token);
				break;
			case 'patient':
				await processGeo(token);
				break;
			case 'diagnosis':
				await processDiagnosis(token);
				break;
			default:
				break;
		}

		if (token !== loadToken) return;

		if (isToggled) {
			recolor(obj);
			await addLegend(obj);
			isToggled = false;
		}

		setMaxLevel();
	}

	function setCatalog() {
		currentLevel = Number(currentLevel);

		if (SVGType === 'diagnosis') {
			switch (currentLevel) {
				case 1:
					currentCatalog = 'ICD_ICD10Group';
					break;
				case 2:
					currentCatalog = 'ICD_ICD10_3';
					break;
				case 3:
					currentCatalog = 'ICD_ICD10';
					break;
				default:
					break;
			}
		}

		if (SVGType === 'patient') {
			switch (currentLevel) {
				case 1:
					currentCatalog = 'countryCode';
					break;
				case 2:
					currentCatalog = 'state';
					break;
				case 3:
					currentCatalog = 'county';
					break;
				case 4:
					currentCatalog = 'postalCode';
					break;
				default:
					break;
			}
		}

		if (SVGType === 'therapy') {
			switch (currentLevel) {
				case 1:
					currentCatalog = 'radiation_supArea';
					break;
				case 2:
					currentCatalog = 'radiation_subArea';
					break;
				default:
					break;
			}
		}
	}

	function setMaxLevel() {
		switch (SVGType) {
			case 'patient':
				maxLevel = 4;
				break;
			case 'diagnosis':
				maxLevel = 3;
				break;
			case 'therapy':
				maxLevel = 2;
				break;
			default:
				maxLevel = 1;
				break;
		}
	}

	async function processGeo(token?: number) {
		setCatalog();
		const result = await getPatientCohortMapChart(currentCatalog, filter);
		if (token && token !== loadToken) return;

		inputArray = (result || []).filter((x) => x.label != null);
		await processSVGColoring(inputArray, token);
	}

	async function processMetastasis(token?: number) {
		currentCatalog = 'metastasisLocation';
		const result = await getTNMBodyMap('all', filter);
		if (token && token !== loadToken) return;

		inputArray = result;
		await processSVGColoring(inputArray, token);
	}

	async function processRadiation(token?: number) {
		setCatalog();
		const result = await getTherapyRadiationMap(currentCatalog, filter);
		if (token && token !== loadToken) return;

		inputArray = result;
		await processSVGColoring(inputArray, token);
	}

	async function processDiagnosis(token?: number) {
		setCatalog();
		const result = await getDiagnosisBarChart(
			{
				genderWise: false,
				group: currentCatalog,
				abscissa: 'none'
			},
			filter
		);

		if (token && token !== loadToken) return;

		inputArray = result.groups.flatMap((group: { description: string; label: string; count: number[] }) =>
			result.category.map((_category: unknown, index: number) => ({
				description: group.description,
				label: group.label,
				count: group.count[index]
			}))
		);

		await processSVGColoring(inputArray, token);
	}

	async function processSVGColoring(inputArray: SVGInputItem[], token?: number) {
		switch (currentCatalog) {
			case 'ICD_ICD10Group':
				break;
			case 'ICD_ICD10_3':
				break;
			case 'ICD_ICD10':
				break;
			case 'countryCode':
				break;
			case 'postalCode':
				break;
			case 'radiation_supArea':
				break;
			case 'radiation_subArea':
				break;
			default:
				break;
		}

		const tableInput = inputArray.map(({ description, label, count, ...rest }) => ({
			...rest,
			label: label ?? '',
			longText: description ?? '',
			count: count ?? 0
		}));

		if (
			currentCatalog.startsWith('ICD') ||
			currentCatalog === 'countryCode' ||
			currentCatalog === 'postalCode' ||
			currentCatalog.startsWith('radiation')
		) {
			columns = [{ data: 'label' }, { data: 'longText' }, { data: 'count' }];
			headers = ['Label', get(t)('longText'), get(t)('count')];
		} else {
			columns = [{ data: 'label' }, { data: 'count' }];
			headers = ['Label', get(t)('count')];
		}

		await tick();

		let tries = 0;
		let tableEl: HTMLElement | null = document.getElementById(tableName);
		while (!tableEl && tries < 30) {
			await new Promise((r) => setTimeout(r, 50));
			tableEl = document.getElementById(tableName);
			tries++;
		}

		if (!tableEl) {
			console.warn('Table element not found for', tableName);
		} else {
			mapTable = createTable(
				SVGType,
				dataPasser,
				tableName,
				tableInput,
				columns,
				tableShownRows,
				sortingIndex
			);
		}

		if (token && token !== loadToken) return;

		maxCount = Math.max(...inputArray.map((item) => item.count));

		const activeDoc = svgObject?.contentDocument;
		if (!activeDoc) return;

		svgDoc = activeDoc;

		inputArray.forEach(({ label, count }) => {
			const color = calculateHeatmapColor(count, maxCount);
			const pathElement = activeDoc.getElementById(label);
			let description: string | undefined;

			if (pathElement) {
				pathElement.addEventListener('mouseover', (event: MouseEvent) => {
					description = inputArray.find((item) => item.label === label)?.description;
					onMouseOver(label, count, event, description);
				});

				pathElement.addEventListener('mouseout', () => onMouseOut(label));
				pathElement.addEventListener('click', () => handleClick(label, description ?? ''));
				changePathColor(label, color);
			} else {
				console.warn('SVG element fehlt:', label);
			}
		});

		await addLegend(svgObject);
	}

	function interpolateColor(
		startColor: { r: number; g: number; b: number },
		endColor: { r: number; g: number; b: number },
		factor: number
	): string {
		const r = Math.round(startColor.r + (endColor.r - startColor.r) * factor);
		const g = Math.round(startColor.g + (endColor.g - startColor.g) * factor);
		const b = Math.round(startColor.b + (endColor.b - startColor.b) * factor);
		return `rgb(${r}, ${g}, ${b})`;
	}

	function calculateHeatmapColor(count: number, maxCount: number): string {
		const whiteColor = { r: 255, g: 255, b: 255 };
		const primaryR = parseInt(primaryColorRGB.r, 10);
		const primaryG = parseInt(primaryColorRGB.g, 10);
		const primaryB = parseInt(primaryColorRGB.b, 10);
		const normalizedValue = calculateBrightness(count, maxCount);
		return interpolateColor(whiteColor, { r: primaryR, g: primaryG, b: primaryB }, normalizedValue);
	}

	function calculateBrightness(count: number, maxCount: number): number {
		if (showLogarithmStoreValue) {
			if (count <= 0 || maxCount <= 0) return 0;
			const logCount = Math.log(count);
			const logMaxCount = Math.log(maxCount);
			return Math.min(logCount / logMaxCount, 1);
		} else {
			return maxCount > 0 ? count / maxCount : 0;
		}
	}

	function changePathColor(pathId: string, color: string) {
		const pathElement = svgDoc?.getElementById(pathId);
		if (pathElement) {
			(pathElement as SVGPathElement).style.fill = color;
		}
	}

	function recolor(svgObject: HTMLObjectElement | null) {
		const doc = svgObject?.contentDocument;
		if (!doc || !inputArray?.length) return;

		svgDoc = doc;

		inputArray.forEach(({ label, count }) => {
			const color = calculateHeatmapColor(count, maxCount);
			const pathElement = doc.getElementById(label);
			if (pathElement) {
				(pathElement as SVGPathElement).style.fill = color;
			}
		});
	}

	function onMouseOver(label: string, count: number, event: MouseEvent, description?: string) {
		const pathElement = svgDoc?.getElementById(label);
		if (!pathElement || !event || !('pageX' in event)) return;

		currentColor = window.getComputedStyle(pathElement).fill;

		const rgbParts = currentColor.match(/\d+/g) || ['0', '0', '0'];
		const r = parseInt(rgbParts[0], 10);
		const g = parseInt(rgbParts[1], 10);
		const b = parseInt(rgbParts[2], 10);

		const newOpacity = 0.5;
		const newColor = `rgba(${r}, ${g}, ${b}, ${newOpacity})`;
		changePathColor(label, newColor);

		const logText = showLogarithmStoreValue ? `(log: ${Math.log(count)})` : '';
		tooltipText = description
			? `${
					SVGType === 'therapy' ? `oBDS Zielgebietsschlüssel ${label}` : label
			  } ➔ ${count} ${logText}<hr>${insertLineBreaks(description)}`
			: `${
					SVGType === 'therapy' ? `oBDS Zielgebietsschlüssel ${label}` : label
			  } ➔ ${count} ${logText}`;

		tooltip = document.getElementById('tooltip');
		if (tooltip) {
			const mouseX = event.pageX || event.clientX;
			const mouseY = event.pageY || event.clientY;

			tooltip.style.display = 'block';
			tooltip.innerHTML = tooltipText;

			tooltip.style.left = mouseX + (1600 - SVGWidth) + 'px';
			tooltip.style.top = mouseY + 55 + 'px';

			if (maxStoreValue) {
				tooltip.style.left = mouseX + 350 + 'px';
				tooltip.style.top = mouseY + 120 + 'px';
			}
		}
	}

	function onMouseOut(label: string) {
		tooltip = document.getElementById('tooltip');
		if (tooltip) {
			tooltip.style.display = 'none';
		}
		if (currentColor !== '') {
			changePathColor(label, currentColor);
		}
	}

	type QueryItem = {
		id: string;
		key: string;
		name: string;
		type: string;
		system?: string;
		values: QueryValue[];
		description?: string;
	};

	type QueryValue = {
		name: string;
		value: string | { min: number; max: number } | AggregatedValue[][];
		queryBindId: string;
		description?: string;
		parentGroupCode: string;
	};

	const addItem = (queryObject: QueryItem): void => {
		dataPasser.addStratifierToQueryAPI({
			label: queryObject.values[0].value,
			catalogueGroupCode: queryObject.key,
			parentGroupCode: queryObject.system
		});
	};

	async function handleClick(label: string, description: string) {
		currentLevel = Number(currentLevel);

		if (currentLevel < maxLevel) currentColor = '';

		let lensLabel = label;
		if (currentCatalog === 'radiation_areaGrouped') {
			lensLabel = description;
		}

		const queryItem: QueryItem = {
			id: 'Random generierte UUID',
			key: currentCatalog,
			name: 'childCategorie.name',
			system: SVGType,
			type: 'EQUALS',
			values: [
				{
					name: lensLabel,
					value: lensLabel,
					queryBindId: 'Auch eine random UUID',
					parentGroupCode: ''
				}
			]
		};

		addItem(queryItem);
		reloadOnly();

		if (currentLevel < maxLevel) {
			if (label == 'Berlin' || label == 'Bremen' || label == 'Hamburg') currentLevel += 2;
			else currentLevel += 1;

			updateSVG(currentLevel);

			const svgDir = currentSVG.match(/\/svg\/([^/]+)/)?.[1];
			const nextSVG = publicAssetPath(
				`/svg/${svgDir}/level${currentLevel}_${replaceUmlauts(label)}.svg`
			);
			const exists = await fileExists(nextSVG);

			if (exists) {
				currentSVG = nextSVG;
			} else {
				await backToPreviousLevel();
			}
		}
	}

	async function fileExists(url: string): Promise<boolean> {
		try {
			const response = await fetch(url, { method: 'HEAD' });
			return response.ok;
		} catch (_e) {
			return false;
		}
	}

	function updateSVG(currentLevel: number) {
		switch (currentLevel) {
			case 3:
				oldSVG_level2 = currentSVG;
				break;
			case 4:
				oldSVG_level3 = currentSVG;
				if (oldSVG_level2 == '') oldSVG_level2 = oldSVG_level3;
				break;
			default:
				break;
		}
	}

	async function backToPreviousLevel() {
		currentLevel--;
		switch (currentLevel) {
			case 2:
				currentSVG = oldSVG_level2;
				break;
			case 3:
				currentSVG = oldSVG_level3;
				break;
			default:
				currentSVG = publicAssetPath(`/svg/${currentSVG.match(/\/svg\/([^/]+)/)?.[1]}/level1.svg`);
				break;
		}
	}

	async function navigateBack() {
		currentLevel = Number(currentLevel);

		if (currentLevel > 1) {
			currentLevel--;
			updateCurrentSVGForNavigation();
		}
	}

	function updateCurrentSVGForNavigation() {
		if (
			currentSVG.includes('Berlin') ||
			currentSVG.includes('Bremen') ||
			currentSVG.includes('Hamburg')
		) {
			currentLevel--;
		}

		switch (currentLevel) {
			case 1:
				currentSVG = publicAssetPath(`/svg/${currentSVG.match(/\/svg\/([^/]+)/)?.[1]}/level1.svg`);
				break;
			case 2:
				currentSVG = oldSVG_level2;
				break;
			case 3:
				currentSVG = oldSVG_level3;
				break;
			default:
				break;
		}
	}

	async function addLegend(svgObject: HTMLObjectElement | null) {
		if (!showLegend || !svgObject?.contentDocument) return;

		await removeLegend();

		if (inputArray && inputArray.length > 0) {
			const svg = d3.select(svgObject.contentDocument.querySelector('svg'));
			if (svg.empty()) return;

			const rectWidth = 15;
			const rectHeight = 15;
			const rectSpacing = 0;
			const padding = 10;
			const textSize = 13;

			const rectX = 350;
			const rectY = 15;

			const legendGroup = svg
				.append('g')
				.attr('class', 'legend-group')
				.attr('transform', `rotate(270) translate(-${rectX}, ${rectY})`);

			const legendValues = d3.range(0, 10).map((i) => (i * maxCount) / 9);

			legendGroup
				.selectAll('rect')
				.data(legendValues)
				.enter()
				.append('rect')
				.attr('x', (_d, i) => i * (rectWidth + rectSpacing))
				.attr('y', 0)
				.attr('width', rectWidth)
				.attr('height', rectHeight)
				.attr('fill', (d) => calculateHeatmapColor(d as number, maxCount))
				.style('stroke', 'none');

			legendGroup
				.append('text')
				.attr('x', -padding)
				.attr('y', rectHeight / 2)
				.attr('dy', '0.35em')
				.style('text-anchor', 'end')
				.style('font-size', `${textSize}px`)
				.style('font-weight', 'normal')
				.style('font-family', 'Roboto, sans-serif')
				.style('fill', 'black')
				.style('stroke', 'black')
				.style('stroke-width', '0.2')
				.text(`${get(t)('count')}: 0`);

			legendGroup
				.append('text')
				.attr('x', 10 * (rectWidth + rectSpacing) + padding)
				.attr('y', rectHeight / 2)
				.attr('dy', '0.35em')
				.style('text-anchor', 'start')
				.style('font-size', `${textSize}px`)
				.style('font-weight', 'normal')
				.style('font-family', 'Roboto, sans-serif')
				.style('fill', 'black')
				.style('stroke', 'black')
				.style('stroke-width', '0.2px')
				.text(
					(showLogarithmStoreValue ? 'log(' : '') +
						'' +
						maxCount +
						'' +
						(showLogarithmStoreValue ? ')' : '')
				);
		}
	}

	async function removeLegend() {
		return new Promise<void>((resolve) => {
			const legendGroupDelete = d3
				.select(svgObject?.contentDocument?.querySelector('svg'))
				.select('.legend-group');

			if (!legendGroupDelete.empty()) {
				legendGroupDelete.remove();
			}

			resolve();
		});
	}

	function insertLineBreaks(description: string) {
		const length = 40;
		let result = '';
		let i = 0;

		while (i < description.length) {
			let nextChunk = description.slice(i, i + length);
			if (nextChunk.length < length) {
				result += nextChunk;
				break;
			}

			let lastSpaceIndex = nextChunk.lastIndexOf(' ');
			if (lastSpaceIndex === -1) {
				lastSpaceIndex = length;
			}

			result += nextChunk.slice(0, lastSpaceIndex);
			i += lastSpaceIndex;

			if (i < description.length) {
				result += '<br>';
				if (description[i] === ' ') {
					i++;
				}
			}
		}

		return result;
	}

	function replaceUmlauts(str: string) {
		return str
			.replace(/ä/g, 'ae')
			.replace(/Ä/g, 'Ae')
			.replace(/ö/g, 'oe')
			.replace(/Ö/g, 'Oe')
			.replace(/ü/g, 'ue')
			.replace(/Ü/g, 'Ue')
			.replace(/ß/g, 'ss');
	}

	function handleMaximized(event: { detail: { headlineMaximize: boolean } }) {
		maxStoreValue = event.detail.headlineMaximize;
		maximize();

		setTimeout(() => {
			if (maxStoreValue) {
				currentSVGWidth = maxSVGWidth;
				currentSVGHeight = maxSVGHeight;
				changeRowCount(mapTable, tableShownRowsMax);
			} else {
				currentSVGWidth = SVGWidth;
				currentSVGHeight = SVGHeight;
				changeRowCount(mapTable, tableShownRowsMin);
			}
		}, 0);
	}

	function maximize() {
		maxStoreValue = !maxStoreValue;
		dispatch('maximized', { maxStoreValue });
	}

	function handleChartToggled(event: { detail: { headlineShowChart: boolean } }) {
		showChartStoreValue = event.detail.headlineShowChart;
		dispatch('chartToggled', { showChartStoreValue });
	}

	function handleLogarithmToggled(event: { detail: { headlineInitialLogarithm: boolean } }) {
		showLogarithmStoreValue = event.detail.headlineInitialLogarithm;
		isToggled = true;
		initializeSVG();
		dispatch('logarithmToggled', { showLogarithmStoreValue });
	}
</script>

<Headline
	{headlineTitle}
	{headlineTooltip}
	headlineMaximize={maxStoreValue}
	headlineShowChart={showChartStoreValue}
	headlineIsChart={true}
	headlineInitialTop5={null}
	headlineInputTableData={inputArray}
	headlineInputTableHeader={headers}
	headlineInitialLogarithm={showLogarithmStoreValue}
	headlineChartJSElement={null}
	headlineD3Element={svgObject}
	headlineLoading={null}
	headlineLoadingStatus={null}
	on:maximized={handleMaximized}
	on:chartToggled={handleChartToggled}
	on:logarithmToggled={handleLogarithmToggled}
/>

<lens-data-passer bind:this={dataPasser}></lens-data-passer>
<div class="km-tooltip" id="tooltip"></div>

{#if !mounted}
	<div class="bigSpinnerContainer">
		<button class="bigSpinnerButton" style="height:720px">
			<img class="bigSpinner" id="spinner" src={loadingIcon} alt="Spinner" />
		</button>
	</div>
{/if}

<div style={mounted ? '' : 'display: none;'}>
	<div class="stage" style={showChartStoreValue ? '' : 'display: none;'}>
		<div class="svgWrapper" style={`width:${currentSVGWidth}px; height:${currentSVGHeight}px;`}>
			{#if !filterActive && currentLevel > 1}
				<button on:click={() => navigateBack()} class="iconRoundButton" aria-label="Zurück">
					<img src={backIcon} alt="back" class="iconRound" />
				</button>
			{/if}

			{#key currentSVG}
				<object
					bind:this={svgObject}
					title="SVG"
					type="image/svg+xml"
					data={currentSVG}
					width={currentSVGWidth}
					height={currentSVGHeight}
					id={SVGType}
					class="bodymap"
					on:load={handleSvgLoad}
				></object>
			{/key}
		</div>
	</div>
</div>

{#if currentCatalog.startsWith('ICD') || currentCatalog === 'countryCode' || currentCatalog === 'postalCode' || currentCatalog.startsWith('radiation')}
	<div class="data-table bodymap-table" style={!showChartStoreValue ? '' : 'display: none;'}>
		<div class="data-table bodymap-table">
			<table id={tableName} class="display" style="width:100%">
				<thead>
					<tr>
						<th>Label</th>
						<th>{$t('longText')}</th>
						<th>{$t('count')}</th>
					</tr>
				</thead>
			</table>
		</div>
	</div>
{:else}
	<div class="data-table bodymap-table" style={!showChartStoreValue ? '' : 'display: none;'}>
		<div class="data-table bodymap-table">
			<table id={tableName} class="display" style="width:100%">
				<thead>
					<tr>
						<th>Label</th>
						<th>{$t('count')}</th>
					</tr>
				</thead>
			</table>
		</div>
	</div>
{/if}

<style>
	.stage {
		display: flex;
		justify-content: center;
		align-items: center;
		height: auto;
	}

	.svgWrapper {
		position: relative;
		display: inline-block;
		line-height: 0;
	}

	.iconRoundButton {
		position: absolute;
		top: 10px;
		left: 10px;
		z-index: 10;
		background: transparent;
		border: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.km-tooltip {
		overflow: visible;
		position: absolute;
		background-color: rgba(0, 0, 0, 0.8);
		color: white;
		padding: 5px;
		border-radius: 5px;
		font-size: 12px;
		display: none;
		white-space: nowrap;
		z-index: 100;
		transform: translateX(-80%);
	}

	.iconRound {
		width: 25px;
		height: 25px;
	}

	.bodymap {
		display: block;
	}

	:global(.bodymap-table) {
		min-width: 0;
		overflow: hidden;
	}

	:global(.bodymap-table .dataTables_wrapper) {
		min-width: 0;
		width: 100%;
		overflow-x: hidden;
	}

	:global(.bodymap-table table.dataTable) {
		width: 100% !important;
	}

	:global(.bodymap-table table.dataTable td),
	:global(.bodymap-table table.dataTable th) {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
