import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build } from 'esbuild';

const testDirectory = await mkdtemp(join(tmpdir(), 'ovis-table-rows-'));
const outfile = join(testDirectory, 'tableRows.mjs');
after(() => rm(testDirectory, { recursive: true, force: true }));

await build({
	entryPoints: ['Frontend/src/tableRows.ts'],
	outfile,
	bundle: true,
	format: 'esm',
	platform: 'node',
	logLevel: 'silent'
});

const { calculateTableShownRows, calculateTableShownRowsForContainer, getTablePanelBottom } =
	await import(pathToFileURL(outfile).href);

test('calculateTableShownRows uses the current table panel height instead of another table panel', () => {
	const firstPanelRows = calculateTableShownRows({
		panelHeight: 430,
		hasNavbar: false,
		fallbackRows: 10
	});
	const currentPanelRows = calculateTableShownRows({
		panelHeight: 330,
		hasNavbar: false,
		fallbackRows: 10
	});

	assert.equal(firstPanelRows, 8);
	assert.equal(currentPanelRows, 5);
});

test('calculateTableShownRows uses fallback only when panel height is missing', () => {
	assert.equal(
		calculateTableShownRows({
			panelHeight: undefined,
			hasNavbar: false,
			fallbackRows: 10
		}),
		10
	);

	assert.equal(
		calculateTableShownRows({
			panelHeight: 120,
			hasNavbar: false,
			fallbackRows: 10
		}),
		1
	);
});

test('calculateTableShownRows uses the rendered row height when provided', () => {
	assert.equal(
		calculateTableShownRows({
			panelHeight: 430,
			hasNavbar: false,
			fallbackRows: 10,
			rowHeight: 26
		}),
		10
	);
});

function withPanelGeometry(check) {
	const previousElement = globalThis.HTMLElement;
	const previousStyle = globalThis.getComputedStyle;
	class Element {
		clientHeight = 330;
		top = 120;
		bottom = 450;
		style = {};
		content;
		querySelector() {
			return null;
		}
		closest() {
			return this.content;
		}
		getBoundingClientRect() {
			return { top: this.top, bottom: this.bottom };
		}
	}
	globalThis.HTMLElement = Element;
	globalThis.getComputedStyle = (element) => element.style;
	try {
		const panel = new Element();
		const content = new Element();
		content.bottom = 940;
		content.style = { paddingBottom: '4px', borderBottomWidth: '1px' };
		panel.style = { marginBottom: '3px' };
		panel.content = content;
		check({ panel, content, container: { closest: () => panel } });
	} finally {
		globalThis.HTMLElement = previousElement;
		globalThis.getComputedStyle = previousStyle;
	}
}

test('maximized capacity stays stable as the loaded page makes its own panel shorter', () => {
	withPanelGeometry(({ panel, container }) => {
		for (const height of [430, 360, 290, 220, 150, 85]) {
			panel.clientHeight = height;
			panel.bottom = panel.top + height;
			assert.equal(calculateTableShownRowsForContainer(container, 10, 32, true), 20);
			assert.equal(getTablePanelBottom(container, true), 932);
		}
		// Restoring the dashboard uses the actual grid cell again.
		panel.clientHeight = 330;
		assert.equal(calculateTableShownRowsForContainer(container, 10, 32, false), 5);
	});
});

test('maximized capacity follows viewport and panel position changes, including mobile bounds', () => {
	withPanelGeometry(({ panel, content, container }) => {
		content.bottom = 740;
		assert.equal(calculateTableShownRowsForContainer(container, 10, 32, true), 13);
		assert.equal(getTablePanelBottom(container, true), 732);
		panel.top += 45;
		assert.equal(calculateTableShownRowsForContainer(container, 10, 32, true), 12);
		assert.equal(calculateTableShownRowsForContainer(container, 10, 26, true), 15);
	});
});

test('missing maximized layout uses a stable fallback instead of auto-sized content', () => {
	withPanelGeometry(({ panel, container }) => {
		panel.content = undefined;
		for (const height of [430, 200, 80]) {
			panel.clientHeight = height;
			assert.equal(calculateTableShownRowsForContainer(container, 10, 32, true), 10);
		}
	});
});
