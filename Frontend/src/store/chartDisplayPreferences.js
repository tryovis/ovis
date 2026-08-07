export const DEFAULT_CHART_SHOW_TOP5 = true;
export const DEFAULT_CHART_HIDE_NULL_VALUES = true;

export function resolveChartDisplayPreferences(user) {
	return {
		showTop5:
			typeof user?.chartShowTop5 === 'boolean' ? user.chartShowTop5 : DEFAULT_CHART_SHOW_TOP5,
		hideNullValues:
			typeof user?.chartHideNullValues === 'boolean'
				? user.chartHideNullValues
				: DEFAULT_CHART_HIDE_NULL_VALUES
	};
}

export function applyChartDisplayPreferencesToConfig(config, preferences) {
	Object.keys(config).forEach((key) => {
		if (key.endsWith('ShowTop5')) {
			config[key] = preferences.showTop5;
		} else if (key.endsWith('ShowNull')) {
			config[key] = !preferences.hideNullValues;
		}
	});

	return config;
}
