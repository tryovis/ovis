import { base } from '$app/paths';

const normalize = (value: string) => (value.startsWith('/') ? value : `/${value}`);

export const appPath = (value: string): string => `${base}${normalize(value)}`;

export const iconPath = (file: string): string => {
	const path = normalize(file).replace(/^\/icons\//, '/');
	return `${base}/icons${path}`;
};

export const apiPath = (value: string): string => {
	const path = normalize(value).replace(/^\/api\//, '/');
	return `${base}/api${path}`;
};

export const publicAssetPath = (value: string): string => `${base}${normalize(value)}`;
