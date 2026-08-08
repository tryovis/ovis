import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createViewportTooltipStyle } from './lib/tooltip-popover.js';

const appCss = await readFile(new URL('./app.css', import.meta.url), 'utf8');
const headline = await readFile(new URL('./components/Headline.svelte', import.meta.url), 'utf8');
const headlineTableExport = await readFile(
	new URL('./components/HeadlineTableExport.svelte', import.meta.url),
	'utf8'
);

test('all headline icon tooltips use the shared viewport popover', () => {
	assert.match(headline, /import \{ showViewportTooltip \} from '\$lib\/tooltip-popover';/);
	assert.match(headline, /tooltipPosition = showViewportTooltip\(event\);/);
	assert.equal(headline.match(/class="tooltiptext"/g)?.length, 8);
	assert.equal(headline.match(/on:mouseenter=\{handleMouseEnter\}/g)?.length, 8);
	assert.match(
		headlineTableExport,
		/import \{ showViewportTooltip \} from '\$lib\/tooltip-popover';/
	);
	assert.match(headlineTableExport, /tooltipPosition = showViewportTooltip\(event\);/);
	assert.equal(headlineTableExport.match(/class="tooltiptext"/g)?.length, 1);
	assert.equal(headlineTableExport.match(/on:mouseenter=\{handleMouseEnter\}/g)?.length, 1);
	assert.match(
		appCss,
		/\.tooltip \.tooltiptext:popover-open\s*\{[^}]*display:\s*block;[^}]*max-height:\s*calc\(100dvh - 24px\);[^}]*overflow-y:\s*auto;/s
	);
});

test('viewport positioning opens toward the available space in every corner', () => {
	const topLeft = createViewportTooltipStyle(
		{ left: 20, right: 48, top: 20, bottom: 48, width: 28, height: 28 },
		800,
		600
	);
	const topRight = createViewportTooltipStyle(
		{ left: 752, right: 780, top: 20, bottom: 48, width: 28, height: 28 },
		800,
		600
	);
	const bottomLeft = createViewportTooltipStyle(
		{ left: 20, right: 48, top: 552, bottom: 580, width: 28, height: 28 },
		800,
		600
	);
	const bottomRight = createViewportTooltipStyle(
		{ left: 752, right: 780, top: 552, bottom: 580, width: 28, height: 28 },
		800,
		600
	);

	assert.match(topLeft, /left:20px;right:auto;top:52px;bottom:auto;/);
	assert.match(topRight, /left:auto;right:20px;top:52px;bottom:auto;/);
	assert.match(bottomLeft, /left:20px;right:auto;top:auto;bottom:52px;/);
	assert.match(bottomRight, /left:auto;right:20px;top:auto;bottom:52px;/);
});

test('viewport positioning keeps edge triggers inside a safe inset', () => {
	const style = createViewportTooltipStyle(
		{ left: 2, right: 30, top: 2, bottom: 30, width: 28, height: 28 },
		800,
		600
	);

	assert.match(style, /position:fixed;z-index:10000;margin:0;transform:none;/);
	assert.match(style, /left:12px;right:auto;top:34px;bottom:auto;/);
});
