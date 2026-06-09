<script lang="ts">
	// @ts-nocheck
	import Headline from '../../components/Headline.svelte';
	import * as d3 from 'd3';
	import { gridPlanes3D, cubes3D, lineStrips3D } from 'd3-3d';
	import { onMount } from 'svelte';
	import { maxStore } from '../../store/maxStore';
	import { getTNM3DChart } from '../../graphQl/gql-tnm';
	import { createTable, changeRowCount } from '../../tableBuilder';
	import { generateCubesData, generateGridData } from './cubesGridData';
	import { initializeLegend, plot3DGraph } from './drawTNM';
	import { get } from 'svelte/store';
	import { t } from '../../store/languageStore';
	import type { LensDataPasser } from '@samply/lens';
	import { filterActiveStore } from '../../store/filterActiveStore.js';
	import { configStore } from '../../store/configStore';
	import { addUserFilter } from '../../components/UserFilter';
	import { iconPath } from '$lib/path-utils';

	let filterActive = true;

	// Abonnieren des filterActiveStore und den Wert aktualisieren
	filterActiveStore.subscribe((value) => {
		filterActive = value.filterActive; // Hier den Wert direkt zuweisen
	});

	const translate = (key: string): string => get(t)(key);
	const loadingIcon = iconPath('spinner.svg');

	type TnmDataRow = { T: string; N: string; M: string; count: number };
	type SelectOption = { label: string; value: string };
	type Tnm3DConfigState = {
		TNM3DChartShowChart: boolean;
		TNM3DChartSelectedTNMType: SelectOption;
		TNM3DChartSelectedTType: SelectOption;
		TNM3DChartSelectedNType: SelectOption;
		TNM3DChartSelectedMType: SelectOption;
		TNM3DChartSelectedTimeType: SelectOption;
	};
	type GroupSelection = d3.Selection<SVGGElement, unknown, null, undefined>;
	type SvgSelection = d3.Selection<SVGSVGElement, unknown, null, undefined>;
	type Cubes3DFactory = ReturnType<typeof cubes3D>;
	type Grid3DFactory = ReturnType<typeof gridPlanes3D>;
	type LineStrips3DFactory = ReturnType<typeof lineStrips3D>;
	type DragEventLike = { x: number; y: number };

	let updating = false;

	let tnmData: TnmDataRow[] = [];

	let tnm3DChartTable: unknown;
	let tableShownRows = 9;
	let sortingIndex = 3;

	let tableData: TnmDataRow[] = [];
	let headers: string[] = [];

	// Access the store variables
	let maximizeTNM3DChart: boolean;
	maxStore.subscribe((value: { maximizeTNM3DChart: boolean }) => {
		({ maximizeTNM3DChart } = value);
	});

	let TNM3DChartShowChart: boolean;
	let TNM3DChartSelectedTNMType: SelectOption;
	let TNM3DChartSelectedTType: SelectOption;
	let TNM3DChartSelectedNType: SelectOption;
	let TNM3DChartSelectedMType: SelectOption;
	let TNM3DChartSelectedTimeType: SelectOption;
	let showChart: boolean;

	const svgMinHeight: number = 400; //height of SVG for minimized TNM chart
	const svgMaxHeight: number = 695; //height of SVG for maximized TNM chart
	const svgMinWidth: number = 700; //width of SVG for minimized TNM chart
	const svgMaxWidth: number = 1565; //width of SVG for maximized TNM chart
	const minScale: number = 15; //scale for minimized TNM chart
	const maxScale: number = 20; //scale for maximized TNM chart
	const startAngle = Math.PI / 6; //rotation angle at the beginning of the drawn TNM graph

	let dataPasser: LensDataPasser;

	let svgWidth: number = svgMinWidth;
	let svgHeight: number = svgMinHeight;
	let origin: { x: number; y: number }; //center of the coordinate system
	let scale: number = minScale; //scale used to draw the grids with cubes

	let maxVal: number; //largest value on the x and z axes -> used to draw the grids

	let cubesGroup!: GroupSelection;
	let cubesData: unknown[] = [];
	let cubes3d!: Cubes3DFactory;
	let xGridGroup!: GroupSelection;
	let yGridGroup!: GroupSelection;
	let zGridGroup!: GroupSelection;
	let xScaleGroup!: GroupSelection;
	let zScaleGroup!: GroupSelection;
	let xGridData: unknown[] = [];
	let yGridData: unknown[] = [];
	let zGridData: unknown[] = [];
	let xGrid3D!: Grid3DFactory;
	let yGrid3D!: Grid3DFactory;
	let zGrid3D!: Grid3DFactory;
	let xLineData: { x: number; y: number; z: number }[] = [];
	let xScale3D!: LineStrips3DFactory;
	let zLineData: { x: number; y: number; z: number }[] = [];
	let zScale3D!: LineStrips3DFactory;

	let mounted = false;
	let svgContainer: SVGSVGElement | null = null;
	let svg!: SvgSelection;
	let exportSvgContainer: Element | null = null;

	const TNMTypes = [
		{ label: translate('totalLong'), value: 'total' },
		{ label: translate('tnmPathological'), value: 'pathological' },
		{ label: translate('tnmDefinitive'), value: 'definitive' },
		{ label: translate('tnmClinical'), value: 'clinical' }
		//{ label: $t("tnmTumorboardClinical"), value: 'tbc' },
		//{ label: $t("tnmTumorboardPathological"), value: 'tbp' },
	];

	let selectedTNMType: SelectOption = { label: translate('tnmPathological'), value: 'total' };

	const TTypes = [
		{ label: 'T ' + translate('grouped'), value: 'group' },
		{ label: 'T ' + translate('detailed'), value: 'detail' },
		{ label: 'T ' + translate('grouped') + ' ' + translate('withoutUnknowns'), value: 'groupnull' },
		{
			label: 'T ' + translate('detailed') + ' ' + translate('withoutUnknowns'),
			value: 'detailnull'
		},
		{ label: 'T ' + translate('hideInformation'), value: 'hide' }
	];
	let selectedTType: SelectOption = {
		label: 'T ' + translate('grouped') + translate('withoutUnknowns'),
		value: 'groupnull'
	};

	const NTypes = [
		{ label: 'N ' + translate('grouped'), value: 'group' },
		{ label: 'N ' + translate('detailed'), value: 'detail' },
		{ label: 'N ' + translate('grouped') + ' ' + translate('withoutUnknowns'), value: 'groupnull' },
		{
			label: 'N ' + translate('detailed') + ' ' + translate('withoutUnknowns'),
			value: 'detailnull'
		},
		{ label: 'N ' + translate('hideInformation'), value: 'hide' }
	];
	let selectedNType: SelectOption = {
		label: 'N ' + translate('grouped') + translate('withoutUnknowns'),
		value: 'groupnull'
	};

	const MTypes = [
		{ label: 'M ' + translate('grouped'), value: 'group' },
		{ label: 'M ' + translate('detailed'), value: 'detail' },
		{ label: 'M ' + translate('grouped') + ' ' + translate('withoutUnknowns'), value: 'groupnull' },
		{
			label: 'M ' + translate('detailed') + ' ' + translate('withoutUnknowns'),
			value: 'detailnull'
		},
		{ label: 'M ' + translate('hideInformation'), value: 'hide' }
	];
	let selectedMType: SelectOption = {
		label: 'M ' + translate('grouped') + translate('withoutUnknowns'),
		value: 'groupnull'
	};

	const TimeTypes = [
		{ label: translate('showTNMData'), value: 'all' },
		{ label: translate('firstEntryTumor'), value: 'newest' },
		{ label: translate('lastEntryTumor'), value: 'oldest' }
	];
	let selectedTimeType: SelectOption = { label: translate('showTNMData'), value: 'all' };

	$: {
		if (
			mounted &&
			(selectedTType || selectedNType || selectedMType || selectedTNMType || selectedTimeType)
		) {
			if (isMounted()) {
				paintChart(scale);
			}
		}
	}

	let filter = JSON.stringify({ operand: 'OR', children: [] });

	onMount(async () => {
		await import('@samply/lens');

		if (filterActive) {
			filter = JSON.stringify(dataPasser.getAstAPI());
		}
		filter = JSON.stringify(await addUserFilter(JSON.parse(filter)));

		mounted = true;

		configStore.subscribe((value: Tnm3DConfigState) => {
			TNM3DChartShowChart = value.TNM3DChartShowChart;
			TNM3DChartSelectedTNMType = value.TNM3DChartSelectedTNMType;
			TNM3DChartSelectedTType = value.TNM3DChartSelectedTType;
			TNM3DChartSelectedNType = value.TNM3DChartSelectedNType;
			TNM3DChartSelectedMType = value.TNM3DChartSelectedMType;
			TNM3DChartSelectedTimeType = value.TNM3DChartSelectedTimeType;
		});

		showChart = TNM3DChartShowChart;
		selectedTNMType = TNM3DChartSelectedTNMType;
		selectedTType = TNM3DChartSelectedTType;
		selectedNType = TNM3DChartSelectedNType;
		selectedMType = TNM3DChartSelectedMType;
		selectedTimeType = TNM3DChartSelectedTimeType;

		//paintChart(scale);
	});

	function initializeTable(): void {
		tableData = tnmData;
		const columns = [
			{ data: 'T', header: 'T' },
			{ data: 'N', header: 'N' },
			{ data: 'M', header: 'M' },
			{ data: 'count', header: translate('count') }
		];
		headers =
			columns.length > 0 && columns.some((column) => column.header)
				? columns.map((column) => column.header) // Use actual headers if available
				: columns.map((_, index) => `col${index + 1}`); // Fallback to default column names

		tnm3DChartTable = createTable(
			'tnm',
			dataPasser,
			'tnm3DChartTable',
			tableData,
			columns,
			tableShownRows,
			sortingIndex
		);
	}

	function initializeSvg(): void {
		if (svgContainer) {
			svgContainer.innerHTML = '';
		}
		svg = d3.select(svgContainer);
	}

	function initializeSvgGroups(): void {
		cubesGroup = svg.append('g').attr('class', 'cubes');
		xGridGroup = svg.append('g').attr('class', 'x-grid');
		yGridGroup = svg.append('g').attr('class', 'y-grid');
		zGridGroup = svg.append('g').attr('class', 'z-grid');
		xScaleGroup = svg.append('g').attr('class', 'x-scale');
		zScaleGroup = svg.append('g').attr('class', 'z-scale');
	}

	async function paintChart(scale: number) {
		//SVG groups
		cubesGroup = null;
		xGridGroup = null;
		yGridGroup = null;
		zGridGroup = null;
		xScaleGroup = null;
		zScaleGroup = null;
		//3D variables
		cubes3d = null;
		xGrid3D = null;
		yGrid3D = null;
		zGrid3D = null;
		xScale3D = null;
		zScale3D = null;

		svg = null;

		initializeSvg();

		updating = true;
		const result = await getTNM3DChart(
			selectedTType.value,
			selectedNType.value,
			selectedMType.value,
			selectedTimeType.value,
			selectedTNMType.value,
			filter
		);
		console.log('RESULT TNM', result);
		updating = false;

		tnmData = result as TnmDataRow[];

		initializeTable();
		initializeSvgGroups();

		let adjustedScale: number;

		{
			//Generation of cubes data
			const {
				cubesData: cubes,
				maxVal: max,
				adjustedScale: newScale
			} = generateCubesData(tnmData, scale, selectedTType, selectedNType, selectedMType);
			cubesData = cubes;
			maxVal = max;
			adjustedScale = newScale;
		}

		{
			//Generation of grid data
			const {
				xGridData: xGrid,
				yGridData: yGrid,
				zGridData: zGrid,
				xLineData: xLine,
				zLineData: zLine
			} = generateGridData(tnmData, selectedTType, selectedNType);
			xGridData = xGrid;
			yGridData = yGrid;
			zGridData = zGrid;
			xLineData = xLine;
			zLineData = zLine;
		}

		origin = { x: svgWidth / 2, y: svgHeight / 2 + 120 };

		//Cubes 3D
		cubes3d = cubes3D()
			.rotateY(startAngle)
			.rotateX(-startAngle)
			.origin(origin)
			.scale(adjustedScale);

		//Grids 3D
		xGrid3D = createGrid3D(adjustedScale);
		yGrid3D = createGrid3D(adjustedScale);
		zGrid3D = createGrid3D(adjustedScale);

		//Scales 3D
		xScale3D = lineStrips3D()
			.origin(origin)
			.rotateY(startAngle)
			.rotateX(-startAngle)
			.scale(adjustedScale);

		zScale3D = lineStrips3D()
			.origin(origin)
			.rotateY(startAngle)
			.rotateX(-startAngle)
			.scale(adjustedScale);

		const data = [
			cubes3d(cubesData), //0
			xGrid3D(xGridData), //1
			yGrid3D(yGridData), //2
			zGrid3D(zGridData), //3
			xScale3D([xLineData]), //4
			zScale3D([zLineData]) //5
		];

		plot3DGraph(
			dataPasser,
			tnmData,
			selectedTType,
			selectedNType,
			data,
			cubesGroup,
			xGridGroup,
			yGridGroup,
			zGridGroup,
			xScaleGroup,
			zScaleGroup,
			cubes3d,
			xGrid3D,
			yGrid3D,
			zGrid3D,
			xScale3D,
			zScale3D,
			1000,
			-startAngle,
			startAngle,
			maximizeTNM3DChart
		);

		initializeLegend(svg, svgWidth, tnmData, selectedMType);

		initializeDragInteraction();
		exportSvgContainer = document.querySelector('#Plot');

		configStore.update((storeValues) => {
			storeValues.TNM3DChartSelectedTNMType = selectedTNMType;
			storeValues.TNM3DChartSelectedTType = selectedTType;
			storeValues.TNM3DChartSelectedNType = selectedNType;
			storeValues.TNM3DChartSelectedMType = selectedMType;
			storeValues.TNM3DChartSelectedTimeType = selectedTimeType;
			return storeValues;
		});
	}

	function createGrid3D(scale: number): Grid3DFactory {
		const numOfFields = maxVal + 1 + 1;

		return gridPlanes3D()
			.rows(numOfFields)
			.origin(origin)
			.rotateY(startAngle)
			.rotateX(-startAngle)
			.scale(scale);
	}

	const dragState = {
		mx: 0,
		my: 0,
		mouseX: 0,
		mouseY: 0,
		beta: 0,
		alpha: 0
	};

	function initializeDragInteraction(): void {
		const drag = d3
			.drag<SVGSVGElement, unknown>()
			.on('drag', dragged)
			.on('start', dragStart)
			.on('end', dragEnd);
		svg.call(drag);
	}

	function dragged(event: DragEventLike) {
		dragHandler(event);
	}

	function dragStart(event: DragEventLike) {
		dragStartHandler(event);
	}

	function dragEnd(event: DragEventLike) {
		dragEndHandler(event);
	}

	function dragHandler(event: DragEventLike): void {
		dragState.beta = ((event.x - dragState.mx + dragState.mouseX) * Math.PI) / 230;
		dragState.alpha = (((event.y - dragState.my + dragState.mouseY) * Math.PI) / 230) * -1;

		const angleOfRotationY = dragState.beta + startAngle;
		const angleOfRotationX = dragState.alpha - startAngle;

		// Temporary data - rotated data of cubes and grids
		const tmpData = [
			cubes3d.rotateY(angleOfRotationY).rotateX(angleOfRotationX)(cubesData), //0
			xGrid3D.rotateY(angleOfRotationY).rotateX(angleOfRotationX)(xGridData), //1
			yGrid3D.rotateY(angleOfRotationY).rotateX(angleOfRotationX)(yGridData), //2
			zGrid3D.rotateY(angleOfRotationY).rotateX(angleOfRotationX)(zGridData), //3
			xScale3D.rotateY(angleOfRotationY).rotateX(angleOfRotationX)([xLineData]), //4
			zScale3D.rotateY(angleOfRotationY).rotateX(angleOfRotationX)([zLineData]) //5
		];

		plot3DGraph(
			dataPasser,
			tnmData,
			selectedTType,
			selectedNType,
			tmpData,
			cubesGroup,
			xGridGroup,
			yGridGroup,
			zGridGroup,
			xScaleGroup,
			zScaleGroup,
			cubes3d,
			xGrid3D,
			yGrid3D,
			zGrid3D,
			xScale3D,
			zScale3D,
			0,
			angleOfRotationX,
			angleOfRotationY,
			maximizeTNM3DChart
		);
	}

	function dragStartHandler(event: DragEventLike): void {
		dragState.mx = event.x;
		dragState.my = event.y;
	}

	function dragEndHandler(event: DragEventLike): void {
		dragState.mouseX = event.x - dragState.mx + dragState.mouseX;
		dragState.mouseY = event.y - dragState.my + dragState.mouseY;
	}

	function handleChartToggled(event: { detail: { headlineShowChart: boolean } }) {
		showChart = event.detail.headlineShowChart;
		configStore.update((storeValues) => {
			storeValues.TNM3DChartShowChart = showChart;
			return storeValues;
		});
	}

	function handleMaximized(event: { detail: { headlineMaximize: boolean } }) {
		maximizeTNM3DChart = event.detail.headlineMaximize;
		maxStore.update((storeValues) => {
			storeValues.maximizeTNM3DChart = !storeValues.maximizeTNM3DChart;
			return storeValues; // Return the updated values
		});
		if (maximizeTNM3DChart) {
			mounted = true;
			svgHeight = svgMaxHeight;
			svgWidth = svgMaxWidth;
			scale = maxScale;

			tableShownRows = 20;
			changeRowCount(tnm3DChartTable, tableShownRows);
		} else {
			mounted = true;
			svgHeight = svgMinHeight;
			svgWidth = svgMinWidth;
			scale = minScale;

			tableShownRows = 9;
			changeRowCount(tnm3DChartTable, tableShownRows);
		}
	}

	function isMounted(): boolean {
		return mounted;
	}
</script>

<Headline
	headlineTitle={$t('tnm3DChart')}
	headlineTooltip={$t('tooltip_tnm3dchart')}
	headlineMaximize={maximizeTNM3DChart}
	headlineShowChart={showChart}
	headlineIsChart={true}
	headlineInitialTop5={null}
	headlineInitialLogarithm={null}
	headlineInputTableData={tableData}
	headlineInputTableHeader={headers}
	headlineChartJSElement={null}
	headlineD3Element={exportSvgContainer}
	on:chartToggled={handleChartToggled}
	on:maximized={handleMaximized}
/>

<!-- prettier-ignore -->
<lens-data-passer bind:this={dataPasser}></lens-data-passer>
<div class="straight-line-container">
	<div class="dropdown-container">
		<div class="dropdown">
			<label for="time">{$t('tnmType')}</label>
			<select class="dropbtn" bind:value={selectedTNMType.value}>
				{#each TNMTypes as option (option.value)}
					<option class="dropdown-option" value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>

		<div class="dropdown">
			<label for="chartType">T(umor):</label>
			<select class="dropbtn" bind:value={selectedTType.value}>
				{#each TTypes as option (option.value)}
					<option class="dropdown-option" value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>

		<div class="dropdown">
			<label for="confidence">N(odes):</label>
			<select class="dropbtn" bind:value={selectedNType.value}>
				{#each NTypes as option (option.value)}
					<option class="dropdown-option" value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>

		<div class="dropdown">
			<label for="time">M(etastasis):</label>
			<select class="dropbtn" bind:value={selectedMType.value}>
				{#each MTypes as option (option.value)}
					<option class="dropdown-option" value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>

		<div class="dropdown">
			<label for="time">{$t('time')}:</label>
			<select class="dropbtn" bind:value={selectedTimeType.value}>
				{#each TimeTypes as option (option.value)}
					<option class="dropdown-option" value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>
	</div>
</div>

<div style={!showChart ? '' : 'display: none;'}>
	<div class="data-table">
		<table id="tnm3DChartTable" class="display" style="width:100%">
			<thead>
				<tr>
					<th>T</th>
					<th>N</th>
					<th>M</th>
					<th>{$t('count')}</th>
				</tr>
			</thead>
		</table>
	</div>
</div>

<div class="chart-container" style={showChart ? '' : 'display: none;'}>
	<div id="Plot" style={!updating ? '' : 'display: none;'}>
		<!-- prettier-ignore -->
		<svg id="tnm chart" width={svgWidth} height={svgHeight} bind:this={svgContainer}></svg>
	</div>
	<!-- prettier-ignore -->
	<div class="infobox" style="display: none;"></div>
	<div style={updating ? '' : 'display: none;'} class="bigSpinnerContainer">
		<button class="bigSpinnerButton" style="height:700px"
			><img class="bigSpinner" id="spinner" src={loadingIcon} alt="Spinner" /></button
		>
	</div>
</div>

<style>
	.dropdown-container {
		display: flex;
		flex: 1;
		width: 100%
	}
	.chart-container {
		margin: 10px;
		height: 80%
	}
	#Plot {
		width: auto;
		height: 100%
	}

	.dropdown {
		flex: 1;
		margin-right: 10px; /* Add margin between dropdowns if needed */
	}
	.infobox {
		position: absolute;
		background-color: #323232;
		color: #fff;
		opacity: 0.9;
		padding: 5px;
		border: 1px solid #ccc;
		border-radius: 3px;
		font-size: 14px;
		font-family: Roboto, -apple-system, sans-serif;
		text-transform: capitalize;
	}

</style>
