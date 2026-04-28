// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import * as d3 from 'd3';
import type { Selection } from 'd3-selection';
import { userStore } from '../../store/userStore';
import { calculateCubesPlotArea, calculateTNMValues, isTNMVisible } from './cubesGridData';
import { reloadOnly } from '../../store/reloadStore';
import { configStore } from '../../store/configStore';
import type { AggregatedValue } from '../../types/query';
import type { _3dType, Cubes3DType, Grid3DType } from 'd3-3d';

const textScaleGap = 15;
let colorPalette: string[];

interface UserStoreValue {
	colorPalette: string[];
}

userStore.subscribe((value: UserStoreValue) => {
	colorPalette = value.colorPalette;
});

interface CubeData {
	id: string;
	tnm: string;
	faces: Array<{ face: string; path: string; depth: number }>;
	[x: string]: unknown;
}

interface DataPasser {
	addStratifierToQueryAPI: (params: {
		label: string;
		catalogueGroupCode: string;
		parentGroupCode?: string;
	}) => void;
	getQueryAPI: () => unknown;
}

interface TNMData {
	[x: string]: unknown;
}

interface ScaleData {
	projected: { x: number; y: number };
	[x: string]: unknown;
}

export function plot3DGraph(
	dataPasser: DataPasser,
	tnmData: TNMData[],
	selectedTType: { value: string },
	selectedNType: { value: string },
	data: CubeData[][][],
	cubesGroup: Selection<SVGGElement, unknown, HTMLElement, unknown>,
	xGridGroup: Selection<SVGGElement, unknown, HTMLElement, unknown>,
	yGridGroup: Selection<SVGGElement, unknown, HTMLElement, unknown>,
	zGridGroup: Selection<SVGGElement, unknown, HTMLElement, unknown>,
	xScaleGroup: Selection<SVGGElement, unknown, HTMLElement, unknown>,
	zScaleGroup: Selection<SVGGElement, unknown, HTMLElement, unknown>,
	cubes3d: Cubes3DType,
	xGrid3D: Grid3DType,
	yGrid3D: Grid3DType,
	zGrid3D: Grid3DType,
	xScale3D: _3dType,
	zScale3D: _3dType,
	tt: number,
	angleX: number,
	angleY: number,
	maximizeTNM3DChart: boolean
): void {
	const { uniqueTValues, uniqueNValues, uniqueMValues, lengthOfT, lengthOfN, lengthOfM } =
		calculateTNMValues(tnmData);

	/* ----------- GRIDS ----------- */
	xGridGroup = generateGrid(xGridGroup, 'x', data[1], xGrid3D); //X-grid
	yGridGroup = generateGrid(yGridGroup, 'y', data[2], yGrid3D); //Y-grid
	zGridGroup = generateGrid(zGridGroup, 'z', data[3], zGrid3D); //Z-grid

	/* --------- CUBES --------- */
	const cubes = cubesGroup.selectAll('g.cube').data(data[0], (d: unknown) => (d as CubeData).id);

	const enteredCubes = cubes
		.enter()
		.append('g')
		.attr('class', 'cube')
		.attr('fill', (d: unknown) => setColor((d as CubeData).tnm, uniqueMValues))
		.attr('id', (d: unknown) => (d as CubeData).id)
		.attr('stroke', 'black')
		.merge(cubes)
		.sort(cubes3d.sort)
		.on('mouseover', (event: MouseEvent) => handleCubeMouseOver(event, maximizeTNM3DChart))
		.on('mouseout', (event: MouseEvent) => handleCubeMouseOut(event))
		.on('click', (event: MouseEvent, d: unknown) => handleCubeClick(event, dataPasser, d as CubeData));

	cubes.exit().remove();

	/* --------- FACES --------- */
	const faces = cubes
		.merge(enteredCubes)
		.selectAll('path.face')
		.data(
			(d: unknown) => (d as CubeData).faces,
			(d: unknown) => (d as { face: string }).face
		);

	faces
		.enter()
		.append('path')
		.attr('class', 'face')
		.attr('fill-opacity', 0.85)
		.classed('_3d', true)
		.merge(faces)
		.transition()
		.duration(tt)
		.attr('d', cubes3d.draw);

	faces.exit().remove();

	/* ----------- X-SCALE ----------- */
	const { minX, maxX, distX, minZ, maxZ, distZ } = calculateCubesPlotArea(
		selectedTType,
		selectedNType,
		lengthOfT,
		lengthOfN,
		lengthOfM
	);

	const isSingleCube = lengthOfT === 1 && lengthOfN === 1;

	if (
		isTNMVisible(selectedTType) ||
		(isTNMVisible(selectedNType) && !isTNMVisible(selectedTType))
	) {
		const adjustedMinX = minX - 0.5;

		if (
			(isTNMVisible(selectedTType) && isTNMVisible(selectedNType)) ||
			(isTNMVisible(selectedTType) && !isTNMVisible(selectedNType))
		) {
			const positionConditionX = isSingleCube
				? (d: unknown) => (d as { x: number }).x === 0
				: (d: unknown) => {
						const dx = (d as { x: number }).x;
						return dx === adjustedMinX ||
							(dx >= adjustedMinX && dx <= maxX && (dx - adjustedMinX) % distX === 0);
					};

			drawScale(
				'x-scale',
				xScaleGroup,
				data[4] as ScaleData[],
				xScale3D,
				10,
				0,
				positionConditionX,
				(d: unknown) => Math.floor(((d as { x: number }).x - adjustedMinX) / distX),
				'T',
				uniqueTValues
			);
		} else if (!isTNMVisible(selectedTType) && isTNMVisible(selectedNType)) {
			const positionConditionX = isSingleCube
				? (d: unknown) => (d as { x: number }).x === 0
				: (d: unknown) => {
						const dx = (d as { x: number }).x;
						return dx === adjustedMinX ||
							(dx >= adjustedMinX && dx <= maxX && (dx - adjustedMinX) % distX === 0);
					};

			drawScale(
				'x-scale',
				xScaleGroup,
				data[4] as ScaleData[],
				xScale3D,
				0,
				0,
				positionConditionX,
				(d: unknown) => Math.floor(((d as { x: number }).x - adjustedMinX) / distX),
				'N',
				uniqueNValues
			);
		}
	}

	/* ----------- Z-SCALE ----------- */
	if (isTNMVisible(selectedNType) && isTNMVisible(selectedTType)) {
		const positionConditionZ = isSingleCube
			? (d: unknown) => (d as { z: number }).z === (minZ + maxZ) / 2
			: (d: unknown) => {
					const dz = (d as { z: number }).z;
					return dz === maxZ || (dz >= minZ && dz <= maxZ && (maxZ - dz) % distZ === 0);
				};

		drawScale(
			'z-scale',
			zScaleGroup,
			data[5] as ScaleData[],
			zScale3D,
			-textScaleGap * 2,
			0,
			positionConditionZ,
			(d: unknown) => Math.floor((maxZ - (d as { z: number }).z) / distZ),
			'N',
			uniqueNValues
		);
	}

	/*--------- SORT TEXT & FACES ---------*/
	enteredCubes.selectAll('._3d').sort(cubes3d.sort);

	//Calculate the sine values for both angles
	const sineX = Math.sin(angleX);
	const sineY = Math.sin(angleY);

	//Calculate the angles in the range [0, 2*PI)
	const normalizedAngleX = ((angleX % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
	const normalizedAngleY = ((angleY % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

	//Order of elements based on both x-axis and y-axis angles
	if (sineX > 0 && normalizedAngleX >= 0 && normalizedAngleX < Math.PI / 2) {
		xScaleGroup.raise();
		zScaleGroup.raise();
		xGridGroup.raise();
		yGridGroup.lower();
		zGridGroup.lower();
		if (sineY > 0 && normalizedAngleY >= Math.PI / 2 && normalizedAngleY < Math.PI) {
			zGridGroup.raise();
		} else if (sineY < 0 && normalizedAngleY >= Math.PI && normalizedAngleY < (3 * Math.PI) / 2) {
			yGridGroup.raise();
			zGridGroup.raise();
		} else if (
			sineY < 0 &&
			normalizedAngleY >= (3 * Math.PI) / 2 &&
			normalizedAngleY < 2 * Math.PI
		) {
			yGridGroup.raise();
		}
	} else if (sineX > 0 && normalizedAngleX >= Math.PI / 2 && normalizedAngleX < Math.PI) {
		cubesGroup.lower();
		if (sineY > 0 && normalizedAngleY >= Math.PI / 2 && normalizedAngleY < Math.PI) {
			zGridGroup.lower();
		} else if (sineY < 0 && normalizedAngleY >= Math.PI && normalizedAngleY < (3 * Math.PI) / 2) {
			yGridGroup.lower();
			zGridGroup.lower();
		} else if (
			sineY < 0 &&
			normalizedAngleY >= (3 * Math.PI) / 2 &&
			normalizedAngleY < 2 * Math.PI
		) {
			yGridGroup.lower();
		}
	} else if (sineX < 0 && normalizedAngleX >= Math.PI && normalizedAngleX < (3 * Math.PI) / 2) {
		xGridGroup.lower();
		yGridGroup.raise();
		zGridGroup.raise();
		if (sineY > 0 && normalizedAngleY >= Math.PI / 2 && normalizedAngleY < Math.PI) {
			zGridGroup.lower();
		} else if (sineY < 0 && normalizedAngleY >= Math.PI && normalizedAngleY < (3 * Math.PI) / 2) {
			yGridGroup.lower();
			zGridGroup.lower();
		} else if (
			sineY < 0 &&
			normalizedAngleY >= (3 * Math.PI) / 2 &&
			normalizedAngleY < 2 * Math.PI
		) {
			yGridGroup.lower();
		}
	} else if (sineX < 0 && normalizedAngleX >= (3 * Math.PI) / 2 && normalizedAngleX < 2 * Math.PI) {
		yGridGroup.lower();
		zGridGroup.lower();
		cubesGroup.raise();
		xScaleGroup.raise();
		zScaleGroup.raise();
		if (sineY > 0 && normalizedAngleY >= Math.PI / 2 && normalizedAngleY < Math.PI) {
			xScaleGroup.lower();
			zScaleGroup.raise();
			xGridGroup.lower();
			zGridGroup.raise();
		} else if (sineY < 0 && normalizedAngleY >= Math.PI && normalizedAngleY < (3 * Math.PI) / 2) {
			cubesGroup.raise();
			zScaleGroup.raise();
			xScaleGroup.lower();
			xGridGroup.lower();
			yGridGroup.raise();
			zGridGroup.raise();
		} else if (
			sineY < 0 &&
			normalizedAngleY >= (3 * Math.PI) / 2 &&
			normalizedAngleY < 2 * Math.PI
		) {
			cubesGroup.raise();
			xScaleGroup.raise();
			yGridGroup.raise();
		}
	}
}

function handleCubeMouseOver(event: MouseEvent, maximizeTNM3DChart: boolean): void {
	const face = event.target as Element;
	const cube = face.parentElement;
	if (!cube) return;
	const cubeId = cube.id;

	const cubeData = d3.select(`#${cubeId}`).datum() as { count: number; tnm?: string };

	const count = cubeData.count;
	const tnm = cubeData.tnm;

	d3.select(cube).selectAll('.face').attr('fill-opacity', 1.0);

	const tooltip = d3.select('.infobox');
	tooltip.style('display', 'block').html(`${tnm ? `${tnm}: ${count}` : `${count}`}`);

	// Calculate and set the tooltip position based on the mouse coordinates depending on whether the 3D chart is maximized
	let mouseX: number, mouseY: number;

	if (maximizeTNM3DChart) {
		mouseX = event.pageX;
		mouseY = event.pageY;
		tooltip.style('left', `${mouseX - 50}px`).style('top', `${mouseY - 50}px`);
	} else {
		[mouseX, mouseY] = d3.pointer(event);
		tooltip.style('left', `${mouseX}px`).style('top', `${mouseY + 50}px`);
	}
}

function handleCubeMouseOut(event: MouseEvent): void {
	const face = event.target as Element;
	const cube = face.parentElement;
	if (!cube) return;

	d3.select(cube).selectAll('.face').attr('fill-opacity', 0.85);
	d3.select('.infobox').style('display', 'none');
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
};

function parseTNM(tnm: string) {
	console.log('Parsing TNM:', tnm); // Debugging-Ausgabe

	// Define regex patterns to extract values after T, N, and M
	const tPattern = /T(\d*[a-zA-Z]*)/i;
	const nPattern = /N(\d*[a-zA-Z]*)/i;
	const mPattern = /M(\d*[a-zA-Z]*)/i;

	// Extract the values using the patterns
	const tValue = tnm.match(tPattern)?.[1] || '-';
	const nValue = tnm.match(nPattern)?.[1] || '-';
	const mValue = tnm.match(mPattern)?.[1] || '-';

	console.log('Extracted values -> T:', tValue, 'N:', nValue, 'M:', mValue); // Debugging-Ausgabe

	return { T: tValue, N: nValue, M: mValue };
}

interface ConfigStoreValue {
	TNM3DChartSelectedTType?: { value: string };
	TNM3DChartSelectedNType?: { value: string };
	TNM3DChartSelectedMType?: { value: string };
}

function handleCubeClick(event: MouseEvent, dataPasser: DataPasser, cubeDataInput: CubeData) {
	let TNM3DChartSelectedTType: { value: string } | null = null;
	let TNM3DChartSelectedNType: { value: string } | null = null;
	let TNM3DChartSelectedMType: { value: string } | null = null;

	configStore.subscribe((value: ConfigStoreValue) => {
		TNM3DChartSelectedTType = value.TNM3DChartSelectedTType ?? null;
		TNM3DChartSelectedNType = value.TNM3DChartSelectedNType ?? null;
		TNM3DChartSelectedMType = value.TNM3DChartSelectedMType ?? null;
	});

	const queryT =
		TNM3DChartSelectedTType?.value === 'group' || TNM3DChartSelectedTType?.value === 'groupnull'
			? 'TGroup'
			: 'T';
	const queryN =
		TNM3DChartSelectedNType?.value === 'group' || TNM3DChartSelectedNType?.value === 'groupnull'
			? 'NGroup'
			: 'N';
	const queryM =
		TNM3DChartSelectedMType?.value === 'group' || TNM3DChartSelectedMType?.value === 'groupnull'
			? 'MGroup'
			: 'M';

	const addItem = (queryObject: QueryItem): void => {
		console.log('ADD ITEM', queryObject);
		dataPasser.addStratifierToQueryAPI({
			label: queryObject.values[0].value,
			catalogueGroupCode: queryObject.key,
			parentGroupCode: queryObject.system
		});
		console.log(dataPasser.getQueryAPI());
		console.log('AFTER ADD ITEM');
	};

	const tnm = cubeDataInput.tnm;

	const { T, N, M } = parseTNM(tnm);
	console.log('T=================>', TNM3DChartSelectedTType);
	console.log('TAVLAUE', T);
	const queryItemT = {
		id: 'Random generierte UUID', //uuidv4(),
		key: queryT,
		name: 'childCategorie.name', //Im Katalog hinterlegt
		type: 'EQUALS',
		values: [
			{
				name: 'test', //Anzeigename
				value: T,
				queryBindId: 'Auch eine random UUID' //Storebindung
			}
		]
	};

	const queryItemN = {
		id: 'Random generierte UUID', //uuidv4(),
		key: queryN,
		name: 'childCategorie.name', //Im Katalog hinterlegt
		type: 'EQUALS',
		values: [
			{
				name: 'test', //Anzeigename
				value: N,
				queryBindId: 'Auch eine random UUID' //Storebindung
			}
		]
	};

	const queryItemM = {
		id: 'Random generierte UUID', //uuidv4(),
		key: queryM,
		name: 'childCategorie.name', //Im Katalog hinterlegt
		type: 'EQUALS',
		values: [
			{
				name: 'test', //Anzeigename
				value: M,
				queryBindId: 'Auch eine random UUID' //Storebindung
			}
		]
	};

	addItem(queryItemT);
	addItem(queryItemN);
	addItem(queryItemM);
	reloadOnly();
}

interface GridData {
	size: number;
	ccw?: boolean;
	path?: string;
}

function generateGrid(
	gridGroup: Selection<SVGGElement, unknown, HTMLElement, unknown>,
	axis: string,
	gridData: GridData[],
	grid3D: Grid3DType
) {
	// Ensure gridData has a minimum size
	let adjustedGridData = gridData;
	if (gridData.length < 2) {
		// Define a minimum grid size when there's only one cube
		const minGridSize = 1000; // Set this to an appropriate size
		adjustedGridData = adjustGridSize(gridData, minGridSize);
	}

	const grid = gridGroup.selectAll(`path.grid-${axis}`).data(adjustedGridData);

	grid
		.enter()
		.append('path')
		.attr(`class`, `grid-${axis}`)
		.merge(grid)
		.attr('stroke', 'black')
		.attr('stroke-width', 0.3)
		.attr('fill', function (d: unknown) {
			return (d as GridData).ccw ? 'white' : '#717171';
		})
		.attr('fill-opacity', 0.8)
		.attr('d', grid3D.draw);

	grid.exit().remove();
	return gridGroup;
}

// Function to adjust grid size
function adjustGridSize(gridData: GridData[], minSize: number): GridData[] {
	return gridData.map((d) => {
		return { ...d, size: Math.max(d.size, minSize) }; // Ensure size is at least `minSize`
	});
}

function setColor(tnm: string, uniqueMLabels: string[]): string {
	const m = tnm.split('M')[tnm.split('M').length - 1].trim();
	const mindex = uniqueMLabels.indexOf(m);
	if (uniqueMLabels.includes('*')) return colorPalette[0];
	else return colorPalette[mindex] ?? colorPalette[0];
}

type PositionCondition = (d: unknown) => boolean;
type IndexFunction = (d: unknown) => number;

function drawScale(
	selector: string,
	scaleGroup: Selection<SVGGElement, unknown, HTMLElement, unknown>,
	scaleData: ScaleData[],
	scale3D: _3dType,
	xGap: number,
	yGap: number,
	positionCondition: PositionCondition,
	index: IndexFunction,
	labelPrefix: string,
	catValues: string[]
) {
	/* ----------- SCALE ----------- */
	const scale = scaleGroup.selectAll('path.' + selector).data(scaleData);
	scale
		.enter()
		.append('path')
		.attr('class', selector)
		.merge(scale)
		.attr('stroke', 'black')
		.attr('stroke-width', 1.5)
		.attr('d', scale3D.draw);

	scale.exit().remove();

	/* ----------- SCALE TEXT ----------- */
	const text = scaleGroup.selectAll('text.' + selector).data(scaleData[0] ?? []);
	text
		.enter()
		.append('text')
		.attr('class', selector)
		.attr('font-family', 'system-ui, sans-serif')
		.attr('font-weight', 'bold')
		.attr('font-size', '14px')
		.merge(text)
		.attr('x', (d: unknown) => (d as ScaleData).projected.x + xGap)
		.attr('y', (d: unknown) => (d as ScaleData).projected.y)
		.text(function (d: unknown) {
			if (typeof positionCondition === 'function' && positionCondition(d)) {
				const ind = index(d);
				if (ind < catValues.length) {
					return labelPrefix + catValues[ind];
				} else {
					return '';
				}
			} else {
				return '';
			}
		});

	text.exit().remove();
}

export function initializeLegend(
	svg: Selection<SVGSVGElement, unknown, HTMLElement, unknown>,
	svgWidth: number,
	tnmData: TNMData[],
	selectedMType: { value: string }
): void {
	const { uniqueMValues, lengthOfM } = calculateTNMValues(tnmData);

	if (isTNMVisible(selectedMType)) {
		const legendWidth = 100;
		// marginTop + length of M*circle diameter + dist between circles + marginBottom
		const legendHeight = 20 + lengthOfM * 10 + (lengthOfM - 1) * 10 + 20;
		const legendX = svgWidth - legendWidth; // Legende am rechten Rand
		const legendY = 10; // Abstand vom oberen Rand

		// Create a legend group
		const legend = svg.append('g').attr('transform', 'translate(' + legendX + ',' + legendY + ')');

		// Add a background rectangle for the legend
		legend
			.append('rect')
			.attr('width', legendWidth)
			.attr('height', legendHeight)
			.attr('fill', 'white')
			.attr('opacity', 0.7);

		// Add circles and labels for each uniqueMValue in the legend
		legend
			.selectAll('.legend-circle')
			.data(uniqueMValues)
			.enter()
			.append('circle')
			.attr('cx', 15)
			.attr('cy', (_d: string, i: number) => 25 + i * 20)
			.attr('r', 5)
			.attr('fill', (_d: string, i: number) => colorPalette[i]);

		legend
			.selectAll('.legend-label')
			.data(uniqueMValues)
			.enter()
			.append('text')
			.attr('x', 25)
			.attr('y', function (_d: string, i: number) {
				return 25 + i * 20;
			})
			.attr('dy', '0.32em')
			.text((_d: string, i: number) => 'M' + uniqueMValues[i])
			.attr('font-size', '12px');
	}
}
