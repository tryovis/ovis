const sharedConfig = require('../.prettierrc.cjs');

module.exports = {
	...sharedConfig,
	plugins: ['prettier-plugin-svelte'],
	pluginSearchDirs: [__dirname],
	overrides: [{ files: '*.svelte', options: { parser: 'svelte' } }]
};
