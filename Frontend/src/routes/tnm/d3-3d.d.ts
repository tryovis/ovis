declare module 'd3-3d' {
	interface _3dType {
		(data: unknown[]): unknown[];
		sort: (a: { depth: number }, b: { depth: number }) => number;
		draw: (d: { path: string }) => string;
		scale: (scale: number) => _3dType;
		origin: (origin: { x: number; y: number }) => _3dType;
		rotateY: (angle: number) => _3dType;
		rotateX: (angle: number) => _3dType;
		rotateZ: (angle: number) => _3dType;
		shape: (shape: string, data: unknown[]) => unknown[];
	}

	interface Grid3DType extends _3dType {
		rows: (rows: number) => Grid3DType;
		columns: (cols: number) => Grid3DType;
	}

	interface Cubes3DType extends _3dType {
		(size: number): Cubes3DType;
	}

	interface LineStrips3DType extends _3dType {
		(size: number): LineStrips3DType;
	}

	export function _3d(): _3dType;
	export function gridPlanes3D(): Grid3DType;
	export function cubes3D(): Cubes3DType;
	export function lineStrips3D(): LineStrips3DType;
}