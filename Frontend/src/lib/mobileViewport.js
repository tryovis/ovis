export const MOBILE_LAYOUT_WIDTH = 1600;

export const DEFAULT_VIEWPORT_CONTENT = 'width=device-width, initial-scale=1, viewport-fit=cover';

// A fixed viewport width is already fitted to the device by mobile browsers.
// Adding a calculated initial-scale here can apply the fit a second time after
// a dynamic viewport update and leave the application at half screen width.
export const MOBILE_LANDSCAPE_VIEWPORT_CONTENT = `width=${MOBILE_LAYOUT_WIDTH}, viewport-fit=cover`;

export function resolveViewportContent(isMobileDevice, isLandscape) {
	return isMobileDevice && isLandscape
		? MOBILE_LANDSCAPE_VIEWPORT_CONTENT
		: DEFAULT_VIEWPORT_CONTENT;
}
