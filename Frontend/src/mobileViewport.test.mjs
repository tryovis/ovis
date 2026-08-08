import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
	DEFAULT_VIEWPORT_CONTENT,
	MOBILE_LANDSCAPE_VIEWPORT_CONTENT,
	MOBILE_LAYOUT_WIDTH,
	resolveViewportContent
} from './lib/mobileViewport.js';

const layoutSource = await readFile(new URL('./routes/+layout.svelte', import.meta.url), 'utf8');

test('mobile landscape uses one browser-managed fit for the desktop-width layout', () => {
	assert.equal(MOBILE_LAYOUT_WIDTH, 1600);
	assert.equal(MOBILE_LANDSCAPE_VIEWPORT_CONTENT, 'width=1600, viewport-fit=cover');
	assert.doesNotMatch(MOBILE_LANDSCAPE_VIEWPORT_CONTENT, /initial-scale/);
	assert.equal(resolveViewportContent(true, true), MOBILE_LANDSCAPE_VIEWPORT_CONTENT);
	assert.match(layoutSource, /viewportMeta\.content = MOBILE_LANDSCAPE_VIEWPORT_CONTENT/);
	assert.doesNotMatch(layoutSource, /mobileLandscapeScale|physicalViewportWidth/);
});

test('portrait and desktop retain the regular device-width viewport', () => {
	assert.equal(DEFAULT_VIEWPORT_CONTENT, 'width=device-width, initial-scale=1, viewport-fit=cover');
	assert.equal(resolveViewportContent(true, false), DEFAULT_VIEWPORT_CONTENT);
	assert.equal(resolveViewportContent(false, true), DEFAULT_VIEWPORT_CONTENT);
	assert.equal(resolveViewportContent(false, false), DEFAULT_VIEWPORT_CONTENT);
});
