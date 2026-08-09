import { Chart } from 'chart.js';

type ChartTheme = {
	text: string;
	secondaryText: string;
	grid: string;
	border: string;
	tooltipBackground: string;
	tooltipText: string;
};

function readThemeColor(property: string, fallback: string): string {
	if (typeof document === 'undefined') return fallback;

	return getComputedStyle(document.body).getPropertyValue(property).trim() || fallback;
}

function getChartTheme(): ChartTheme {
	const darkMode =
		typeof document !== 'undefined' &&
		(document.body.classList.contains('dark-mode') ||
			document.documentElement.classList.contains('dark-mode'));

	return {
		text: readThemeColor('--chart-text-color', darkMode ? '#ffffff' : '#666666'),
		secondaryText: readThemeColor('--chart-muted-text-color', darkMode ? '#d2d2d2' : '#666666'),
		grid: readThemeColor(
			'--chart-grid-color',
			darkMode ? 'rgba(210, 210, 210, 0.22)' : 'rgba(0, 0, 0, 0.1)'
		),
		border: readThemeColor(
			'--chart-border-color',
			darkMode ? 'rgba(210, 210, 210, 0.35)' : 'rgba(0, 0, 0, 0.1)'
		),
		tooltipBackground: darkMode ? 'rgba(35, 35, 35, 0.96)' : 'rgba(0, 0, 0, 0.8)',
		tooltipText: '#ffffff'
	};
}

function applyScaleTheme(scale: Record<string, any>, theme: ChartTheme): void {
	scale.grid = {
		...(scale.grid ?? {}),
		color: theme.grid,
		tickColor: theme.grid
	};
	scale.border = { ...(scale.border ?? {}), color: theme.border };
	scale.ticks = { ...(scale.ticks ?? {}), color: theme.secondaryText };
	scale.title = { ...(scale.title ?? {}), color: theme.text };
}

function applyThemeToChart(chart: Chart, theme: ChartTheme): void {
	const options = chart.options as Record<string, any>;
	options.plugins ??= {};
	options.scales ??= {};

	options.color = theme.text;
	options.borderColor = theme.border;
	options.plugins.legend ??= {};
	options.plugins.legend.labels = {
		...(options.plugins.legend.labels ?? {}),
		color: theme.text
	};
	options.plugins.tooltip = {
		...(options.plugins.tooltip ?? {}),
		backgroundColor: theme.tooltipBackground,
		titleColor: theme.tooltipText,
		bodyColor: theme.tooltipText,
		borderColor: theme.border,
		borderWidth: 1
	};

	Object.values(options.scales).forEach((scale) => {
		applyScaleTheme(scale as Record<string, any>, theme);
	});
}

function applyChartDefaults(theme: ChartTheme): void {
	const defaults = Chart.defaults as any;
	defaults.plugins ??= {};
	defaults.plugins.legend ??= {};
	defaults.plugins.legend.labels ??= {};
	defaults.plugins.tooltip ??= {};
	defaults.scale ??= {};
	defaults.scale.grid ??= {};
	defaults.scale.border ??= {};
	defaults.scale.ticks ??= {};
	defaults.scale.title ??= {};

	defaults.color = theme.text;
	defaults.borderColor = theme.border;
	defaults.plugins.legend.labels.color = theme.text;
	defaults.plugins.tooltip.backgroundColor = theme.tooltipBackground;
	defaults.plugins.tooltip.titleColor = theme.tooltipText;
	defaults.plugins.tooltip.bodyColor = theme.tooltipText;
	defaults.plugins.tooltip.borderColor = theme.border;
	defaults.plugins.tooltip.borderWidth = 1;
	defaults.scale.grid.color = theme.grid;
	defaults.scale.grid.tickColor = theme.grid;
	defaults.scale.border.color = theme.border;
	defaults.scale.ticks.color = theme.secondaryText;
	defaults.scale.title.color = theme.text;
}

function syncChartTheme(): void {
	const theme = getChartTheme();
	applyChartDefaults(theme);

	const chartInstances = Object.values((Chart as any).instances ?? {}) as Chart[];
	chartInstances.forEach((chart) => {
		applyThemeToChart(chart, theme);
		chart.update();
	});
}

export function initChartThemeSync(): () => void {
	if (typeof document === 'undefined') return () => {};

	const sync = () => {
		syncChartTheme();
		window.dispatchEvent(new CustomEvent('ovis-theme-change'));
	};
	const observer = new MutationObserver((mutations) => {
		if (mutations.some((mutation) => mutation.attributeName === 'class')) sync();
	});

	sync();
	observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

	return () => observer.disconnect();
}
