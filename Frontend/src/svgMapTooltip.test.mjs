import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createPointerTooltipStyle } from './lib/tooltip-popover.js';

const genericSvg = await readFile(
	new URL('./components/GenericSVG.svelte', import.meta.url),
	'utf8'
);

test('SVG map tooltip is component-local and rendered in the top layer', () => {
	assert.match(genericSvg, /bind:this=\{tooltip\}[^>]*popover="manual"[^>]*role="tooltip"/);
	assert.doesNotMatch(genericSvg, /document\.getElementById\('tooltip'\)/);
	assert.doesNotMatch(genericSvg, /title="SVG"/);
	assert.doesNotMatch(genericSvg, /mouseX \+ \(1600 - SVGWidth\)/);
	assert.match(genericSvg, /createPointerTooltipStyle\(/);
	assert.match(genericSvg, /\.km-tooltip\s*\{[^}]*position:\s*fixed;/s);
	assert.match(genericSvg, /\.km-tooltip\s*\{[^}]*pointer-events:\s*none;/s);
	assert.match(genericSvg, /\.km-tooltip:popover-open\s*\{[^}]*display:\s*block;/s);
});

test('pointer tooltip opens beside the pointer when space is available', () => {
	const style = createPointerTooltipStyle(100, 100, { width: 200, height: 100 }, 800, 600);

	assert.match(style, /position:fixed;z-index:10000;margin:0;transform:none;/);
	assert.match(style, /left:112px;right:auto;top:112px;bottom:auto;/);
});

test('pointer tooltip flips at the viewport edges', () => {
	const style = createPointerTooltipStyle(790, 590, { width: 200, height: 100 }, 800, 600);

	assert.match(style, /left:578px;right:auto;top:478px;bottom:auto;/);
});

test('oversized pointer tooltips stay pinned to the safe viewport inset', () => {
	const style = createPointerTooltipStyle(4, 4, { width: 900, height: 700 }, 800, 600);

	assert.match(style, /left:12px;right:auto;top:12px;bottom:auto;/);
});
