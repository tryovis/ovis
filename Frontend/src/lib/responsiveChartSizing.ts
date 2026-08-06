export function usesShortDesktopViewport(): boolean {
	if (typeof window === 'undefined') return false;

	return window.matchMedia(
		'(min-width: 900px) and (min-height: 680px) and (max-height: 820px)'
	).matches;
}

export function usesMobileLandscapeLayout(): boolean {
	return (
		typeof document !== 'undefined' &&
		document.documentElement.dataset.ovisMobileLayout === 'landscape'
	);
}

export function usesCompactChartLayout(): boolean {
	return usesMobileLandscapeLayout() || usesShortDesktopViewport();
}

export function responsiveChartFontSize(
	normalSize = 12,
	mobileSize = 9,
	shortDesktopSize = 11
): number {
	if (usesMobileLandscapeLayout()) return mobileSize;
	if (usesShortDesktopViewport()) return shortDesktopSize;
	return normalSize;
}

export function responsiveLegendLabels() {
	const mobile = usesMobileLandscapeLayout();
	const shortDesktop = usesShortDesktopViewport();
	const color =
		typeof document !== 'undefined'
			? getComputedStyle(document.body).color
			: 'rgb(0, 0, 0)';

	return {
		color,
		font: {
			size: responsiveChartFontSize(),
			family: 'Roboto, Helvetica, Arial, sans-serif',
			weight: '500' as const
		},
		boxWidth: mobile ? 12 : shortDesktop ? 26 : 40,
		boxHeight: mobile ? 7 : shortDesktop ? 10 : 12,
		padding: mobile ? 4 : shortDesktop ? 7 : 10
	};
}
