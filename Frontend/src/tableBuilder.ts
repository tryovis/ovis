// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import jQuery from 'jquery';
import { escapeHtml } from './lib/escape-html';
import { copyFilterValue } from './lib/copy-filter-value';
import { showViewportTooltip } from './lib/tooltip-popover';
import {
	bindColumnFilter,
	collectColumnSuggestions,
	createColumnFilterInput
} from './lib/table-column-suggestions';
import DataTable from 'datatables.net';
import 'datatables.net';
import type { LensDataPasser } from '@samply/lens';

import { get } from 'svelte/store';
import { userStore } from './store/userStore';
import { t } from './store/languageStore';
import type { ConfigColumns, Api } from 'datatables.net';
import moment from 'moment';
import { reloadOnly } from '../src/store/reloadStore';
import { datePickerStore } from './store/datePickerStore'; // Importiere den Store
import { numberPickerStore } from './store/numberPickerStore'; // Importiere den Store
import { TNMPickerStore } from './store/TNMPickerStore'; // Importiere den Store
import {
	addChartQueryItem,
	createArrayFilterItems,
	isArrayFilterColumn
} from './tableFilterItems';
import type { QueryItem } from './tableFilterItems';
import { applyFixedFilterSelection } from './components/therapy/fixedFilterSelection';

let currentDataPasser: LensDataPasser | null = null;

type TNMPickerState = {
	show: boolean;
	selectedTNM: string | null;
	collection: string | null;
	typeOfTNM: string | null;
};

type NumberPickerState = {
	show: boolean;
	selectedNumber: string | number | null;
	collection: string | null;
	fieldName: string | null;
	onConfirm?: () => boolean | void;
};

type DatePickerState = {
	show: boolean;
	selectedDate: string | null;
	collection: string | null;
	typeOfDate: string | null;
	fieldLabel?: string;
	onConfirm?: () => boolean | void;
};

type WritableSet<T> = { set: (value: T) => void };

const tnmPickerStore = TNMPickerStore as unknown as WritableSet<TNMPickerState>;
const numberStore = numberPickerStore as unknown as WritableSet<NumberPickerState>;
const dateStore = datePickerStore as unknown as WritableSet<DatePickerState>;

type TableColumnFilter = {
	field: string;
	value: string;
	timeZone?: string;
};

type TablePageRequest = {
	offset: number;
	limit: number;
	sortField: string | null;
	sortDirection: 'asc' | 'desc';
	columnFilters: TableColumnFilter[];
};

type TablePageResult = {
	rows: unknown[];
	total: number;
	filtered: number;
};

type TableCellClickHandlers = Record<string, (row: Record<string, unknown>) => void | Promise<void>>;

type ServerSideTableOptions = {
	fetchPage?: (request: TablePageRequest) => Promise<TablePageResult>;
	fetchSuggestions?: (
		field: string,
		search: string,
		columnFilters: TableColumnFilter[],
		signal: AbortSignal
	) => Promise<string[]>;
	fixedFilter?: string | null;
	// When supplied, only these columns select rows; display-only columns stay inert.
	cellClickHandlers?: TableCellClickHandlers;
};

const addItem = (queryObject: QueryItem): void => {
	if (!currentDataPasser) {
		return;
	}
	const system =
		queryObject.key === 'tumorID'
			? 'diagnosis'
			: queryObject.key === 'patID'
			? 'patient'
			: queryObject.system === 'histology'
			? 'diagnosis'
			: queryObject.system;
	const normalizedQueryObject = {
		...queryObject,
		system,
		name: `${system ?? ''}:${queryObject.key}:${queryObject.type}`
	};
	console.log('ADDED QUERY ITEM', queryObject);
	addChartQueryItem(currentDataPasser, normalizedQueryObject, get(userStore).currentFilter);
	console.log(currentDataPasser.getQueryAPI());
};

export function createTable(
	collection: string,
	dataPasser: LensDataPasser | null,
	tableID: string,
	tableData: unknown[],
	columns: ConfigColumns[],
	rowCount: number,
	sortingIndex: number,
	sortingDirection?: string | null,
	enableCellClick?: boolean,
	serverSideOptions?: ServerSideTableOptions | null
): Api<unknown>;
export function createTable(
	tableID: string,
	tableData: unknown[],
	columns: ConfigColumns[],
	rowCount: number,
	sortingIndex: number,
	sortingDirection?: string | null,
	enableCellClick?: boolean,
	serverSideOptions?: ServerSideTableOptions | null
): Api<unknown>;
export function createTable(
	collectionOrTableID: string,
	dataPasserOrTableData: LensDataPasser | null | unknown[],
	tableIDOrColumns: string | ConfigColumns[],
	tableDataOrRowCount: unknown[] | number,
	columnsOrSortingIndex: ConfigColumns[] | number,
	rowCountOrSortingDirection: number | string | null = null,
	sortingIndexOrEnableCellClick: number | boolean | null = null,
	sortingDirection: string | null = null,
	enableCellClick: boolean | ServerSideTableOptions | null = true,
	serverSideOptions: ServerSideTableOptions | null = null
): Api<unknown> {
	const usesLegacySignature = Array.isArray(dataPasserOrTableData);
	const collection = usesLegacySignature ? '' : collectionOrTableID;
	const dataPasser = usesLegacySignature ? null : dataPasserOrTableData;
	const tableID = usesLegacySignature ? collectionOrTableID : (tableIDOrColumns as string);
	const tableData = usesLegacySignature
		? dataPasserOrTableData
		: (tableDataOrRowCount as unknown[]);
	const columns = usesLegacySignature
		? (tableIDOrColumns as ConfigColumns[])
		: (columnsOrSortingIndex as ConfigColumns[]);
	const rowCount = usesLegacySignature
		? (tableDataOrRowCount as number)
		: (rowCountOrSortingDirection as number);
	const sortingIndex = usesLegacySignature
		? (columnsOrSortingIndex as number)
		: (sortingIndexOrEnableCellClick as number);
	const effectiveSortingDirection = usesLegacySignature
		? typeof rowCountOrSortingDirection === 'string'
			? rowCountOrSortingDirection
			: null
		: sortingDirection;
	const effectiveEnableCellClick = usesLegacySignature
		? typeof sortingIndexOrEnableCellClick === 'boolean'
			? sortingIndexOrEnableCellClick
			: false
		: typeof enableCellClick === 'boolean'
		? enableCellClick
		: true;
	const effectiveServerSideOptions = usesLegacySignature
		? typeof enableCellClick === 'object'
			? enableCellClick
			: serverSideOptions
		: serverSideOptions ?? (typeof enableCellClick === 'object' ? enableCellClick : null);
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const columnFilter = (index: number, value: string): TableColumnFilter => ({
		field: columns[index].data,
		value,
		...(columns[index].date ? { timeZone } : {})
	});
	const applySelectionScope = () => {
		currentDataPasser = dataPasser;
		return applyFixedFilterSelection(dataPasser, effectiveServerSideOptions?.fixedFilter ?? null, get(userStore).currentFilter);
	};

	if (DataTable.isDataTable(`#${tableID}`)) {
		const existingTable = jQuery(`#${tableID}`).DataTable() as Api<unknown>;
		existingTable.clear(); // Clear only the table body
		existingTable.destroy();
	}
	currentDataPasser = dataPasser;
	// Check if the header and filters already exist, and remove them if they do

	const existingHeader = jQuery(`#${tableID} thead tr.${tableID}-filters`);
	if (existingHeader.length) {
		existingHeader.remove();
	}

	//<lens-data-passer bind:this={dataPasser} />
	// Append the header and filters only if they don't exist
	if (!jQuery(`#${tableID} thead tr.${tableID}-filters`).length) {
		const originalHeader = jQuery(`#${tableID} thead tr`).first();
		const clonedHeader = originalHeader.clone(true);
		clonedHeader.addClass(`${tableID}-filters`).appendTo(`#${tableID} thead`);

		// Remove sorting icons from cloned header
		clonedHeader.find('th').removeClass('sorting_asc sorting_desc sorting');
		clonedHeader.find('th').each(function (this: HTMLTableCellElement) {
			createColumnFilterInput(this, this.textContent ?? '');
		});
	}

	const dataTableConfig: Record<string, unknown> = {
		dom: 'rtip',
		orderCellsTop: true,
		order: effectiveSortingDirection
			? [[sortingIndex, effectiveSortingDirection]]
			: [[sortingIndex, 'desc']],
		columnDefs: [
			{
				targets: 'dateColumn',
				type: 'date-moment',
				render: function (data: string | string[] | null, type: string) {
					let processedData = data;
					if (Array.isArray(processedData)) {
						processedData = processedData.join(', ');
					}
					if (processedData == null) {
						processedData = '';
					}
					return type === 'sort'
						? processedData
							? moment(processedData, 'DD.MM.YYYY').format('YYYY-MM-DD')
							: '0000-00-00'
						: (type === 'display' ? escapeHtml(cellText(processedData)) : processedData);
				}
			},
			{
				targets: '_all',
				render: function (data: string | string[] | null, type: string) {
					let processedData = data;
					if (Array.isArray(processedData)) {
						processedData = processedData.join(', ');
					}
					if (processedData == null) {
						processedData = '';
					}
					if (type === 'display' && tableID === 'userManagementTable') {
						// Truncate based on content length
						const maxLength = 7;
						return processedData && processedData.length > maxLength
							? `<span class="tooltip">
                <span class="tooltiptext">${escapeHtml(processedData)}</span>
                ${
									typeof processedData === 'string'
										? escapeHtml(processedData.substring(0, maxLength) + '…')
										: ''
								}
              </span>`
							: escapeHtml(cellText(processedData));
					}
					return type === 'display' ? escapeHtml(cellText(processedData)) : processedData;
				},

				createdCell: function (
					this: { api: () => Api<unknown> },
					cell: Node,
					cellData: string | string[] | null,
					_rowData: unknown,
					_rowIndex: number,
					colIndex: number
				) {
					const tableCell = cell as HTMLElement;
					if (tableID !== 'userManagementTable') {
						truncateCellData(tableCell, cellData, colIndex, this.api());
					}

					bindCellClickHandler(
						() => dataTable,
						tableCell,
						cellData,
						colIndex,
						collection,
						effectiveEnableCellClick,
						applySelectionScope,
						effectiveServerSideOptions?.cellClickHandlers
					);
				}
			}
		],

		initComplete: function (this: { api: () => Api<unknown> }) {
			const api = this.api();
			if (api.settings()[0].bDestroying || !api.table().node().isConnected) return;
			const indexes = getColumnIndexes(api);
			const translate = get(t);
			const filterRow = api.table().header().rows[1];
			const unbind = indexes.map((colIdx) => {
				const header = api.column(colIdx).header();
				const cell = filterRow.cells[header.cellIndex];
				const input =
					cell.querySelector('input') ?? createColumnFilterInput(cell, header.textContent ?? '');
				return bindColumnFilter(input, {
					id: tableID + '-suggestions-' + colIdx,
					loadingMessage: translate('tableFilterValuesLoading'),
					emptyMessage: translate('tableFilterNoMatches'),
					errorMessage: translate('tableFilterValuesUnavailable'),
					load: (query, signal) => {
						const siblings = indexes
							.filter((index) => index !== colIdx)
							.map((column) => ({ column, value: api.column(column).search() }))
							.filter(({ value }) => value.trim() !== '');
						if (effectiveServerSideOptions?.fetchSuggestions) {
							return effectiveServerSideOptions.fetchSuggestions(
								columns[colIdx].data,
								query,
								siblings.map(({ column, value }) => columnFilter(column, value)),
								signal
							);
						}
						// Locally paged result sets (Kaplan-Meier) keep their complete rows outside DataTables.
						if (effectiveServerSideOptions?.fetchPage) {
							const read = (row: number, index: number) =>
								String(tableData[row][columns[index].data] ?? '');
							return collectColumnSuggestions(tableData.length, read, colIdx, query, siblings, signal);
						}
						// Reuse DataTables' orthogonal search data, including formatted cells and off-page rows.
						const rows = api.settings()[0].aoData;
						const read = (row: number, index: number) => rows[row]._aFilterData?.[index] ?? '';
						return collectColumnSuggestions(rows.length, read, colIdx, query, siblings, signal);
					},
					apply: (value) => {
						const column = api.column(colIdx);
						if (column.search() !== value) column.search(value, false, false).draw();
					}
				});
			});
			api.one('destroy.dt.columnFilters', () => unbind.forEach((dispose) => dispose()));
		},
		drawCallback: function (this: { api: () => Api<unknown> }) {
			const api = this.api();
			getRowIndexes(api).forEach((rowIndex) => {
				const row = api.row(rowIndex).node() as HTMLElement;
				jQuery(row)
					.find('td')
					.each(function (this: HTMLTableCellElement, _colIdx: number) {
						const cellData = api.cell(this).data() as string | string[] | null;
						if (tableID !== 'userManagementTable') {
							truncateCellData(this, cellData, _colIdx, api);
						}
						bindCellClickHandler(
							() => dataTable,
							this,
							cellData,
							_colIdx,
							collection,
							effectiveEnableCellClick,
							applySelectionScope,
							effectiveServerSideOptions?.cellClickHandlers
						);
					});
			});
			if (tableID !== 'userManagementTable') {
				adjustColumnWidths(api, columns);
			}
		},
		data: effectiveServerSideOptions?.fetchPage ? undefined : tableData,
		deferRender: true,
		paging: rowCount !== -1,
		pageLength: rowCount,
		lengthChange: false,
		columns: columns,
		autoWidth: false
	};

	if (effectiveServerSideOptions?.fetchPage) {
		dataTableConfig.serverSide = true;
		dataTableConfig.searchDelay = 500;
		dataTableConfig.ajax = async function (request: any, callback: (data: unknown) => void) {
			const order = request.order?.[0];
			const orderColumnIndex = typeof order?.column === 'number' ? order.column : sortingIndex;
			const orderedColumn = request.columns?.[orderColumnIndex];
			const sortField = typeof orderedColumn?.data === 'string' ? orderedColumn.data : null;
			const sortDirection = order?.dir === 'asc' ? 'asc' : 'desc';
			const columnFilters = (request.columns ?? [])
				.map((column: any, index: number) => columnFilter(index, column.search?.value ?? ''))
				.filter(
					(columnFilter: TableColumnFilter) =>
						columnFilter.field && columnFilter.value.trim() !== ''
				);

			const page = await effectiveServerSideOptions.fetchPage({
				offset: request.start ?? 0,
				limit: request.length ?? rowCount,
				sortField,
				sortDirection,
				columnFilters
			});

			callback({
				draw: request.draw,
				recordsTotal: page.total,
				recordsFiltered: page.filtered,
				data: page.rows
			});
		};
	}

	const dataTable: Api<unknown> = new DataTable(`#${tableID}`, dataTableConfig);
	// Delegation also covers cells replaced by sorting, filtering, or pagination.
	// Use the top layer so clipped cells and scroll containers cannot hide the tooltip.
	jQuery(dataTable.table().node())
		.off('mouseenter.ovisTooltip')
		.on('mouseenter.ovisTooltip', 'tbody .tooltip', function (this: HTMLElement) {
			showViewportTooltip(this);
		});
	if (['generic_diagnosisHistologyTable', 'generic_diagnosisDiagnosticTable'].includes(tableID)) {
		const table = jQuery(dataTable.table().node());
		table.wrap('<div class="table-scroll-container"></div>');
	}

	if (tableID === 'userManagementTable') {
		// Filter clicks is additive; keep the original wide filter and admin columns aligned.
		const columnWidths = [100, 200, 50, 50, 50, 50, 100, 50, 400, 70, 50, 50, 50, 50];
		getColumnIndexes(dataTable).forEach((index) => {
			if (index < columnWidths.length) {
				jQuery(dataTable.column(index).header()).css('width', columnWidths[index] + 'px');
			}
		});

		getRowIndexes(dataTable).forEach((rowIndex) => {
			let maxHeight = 0;
			const row = jQuery(dataTable.row(rowIndex).node() as HTMLElement);

			row.find('td').each(function (this: HTMLElement) {
				const cell = jQuery(this);
				cell.css('height', 'auto');
				const cellHeight = cell.outerHeight() ?? 0;
				if (cellHeight > maxHeight) {
					maxHeight = cellHeight;
				}
			});

			row.find('td').css('height', maxHeight + 'px');
		});
	}

	return dataTable;
}

/** Cell text for display; empty values show as "-", the value an empty-cell click filters on. */
function cellText(value: unknown): string {
	const text = String(value ?? '');
	return text.trim() === '' ? '-' : text;
}

function truncateCellData(
	cell: HTMLElement,
	cellData: string | string[] | null | undefined,
	colIndex: number,
	api: Api<unknown>
) {
	const processedCellData = Array.isArray(cellData) ? cellData.join(', ') : (cellData ?? '') + '';
	const settings = api.settings()[0];
	requestAnimationFrame(() => {
		// A redraw can replace the table before this callback runs. Never use the
		// jQuery DataTable() constructor here: it can resurrect a destroyed table.
		if (!cell.isConnected || settings?.bDestroying || !settings?.aoColumns[colIndex]) return;

		const charWidth = 7; // Average character width in pixels (adjust if necessary)
		const cellWidth = jQuery(cell).width() ?? 0;
		const truncateLength = Math.floor(cellWidth / charWidth);

		if (settings && settings.aoColumns) {
			const columnType = settings.aoColumns[colIndex].type;

			if (
				truncateLength !== 0 &&
				columnType !== 'date-moment' &&
				processedCellData.length > truncateLength &&
				processedCellData.length > 4
			) {
				const truncatedData = processedCellData.substring(0, truncateLength) + '…';
				jQuery(cell).html(`<span class="tooltip">
                              <span class="tooltiptext">${escapeHtml(processedCellData)}</span>
                              ${escapeHtml(truncatedData)}
                            </span>`);
			} else {
				jQuery(cell).text(cellText(processedCellData));
			}
		}
	});
}

function getColumnIndexes(api: Api<unknown>): number[] {
	return Array.from({ length: api.columns().count() }, (_, index) => index);
}

function getRowIndexes(api: Api<unknown>): number[] {
	return Array.from({ length: api.rows().count() }, (_, index) => index);
}

function adjustColumnWidths(api: Api<unknown>, columns: ConfigColumns[]) {
	const table = jQuery(api.table().node());
	const totalWidth = table.parent().width() ?? 0; // Get the width of the parent container
	const columnWidths = columns.map((_col, idx: number) => {
		const cells = api.column(idx).nodes();
		let maxContentWidth = jQuery(api.column(idx).header()).text().length * 7; // Estimate width based on header text

		cells.each(function (this: HTMLElement) {
			const cell = jQuery(this);
			const cellContentWidth = cell.text().length * 7; // Estimate width based on character count
			if (cellContentWidth > maxContentWidth) {
				maxContentWidth = cellContentWidth;
			}
		});

		return maxContentWidth;
	});

	const totalSpecifiedWidth = columnWidths.reduce((acc: number, width: number) => acc + width, 0);
	const remainingWidth = totalWidth - totalSpecifiedWidth;
	const unspecifiedColumns = columns.filter((_col, idx: number) => !columns[idx].width).length;

	if (unspecifiedColumns > 0) {
		const widthPerColumn = remainingWidth / unspecifiedColumns;
		getColumnIndexes(api).forEach((colIdx) => {
			const header = api.column(colIdx).header();
			if (!columns[colIdx].width) {
				const newWidth = Math.max(columnWidths[colIdx], widthPerColumn);
				jQuery(header).css('width', newWidth + 'px');
			} else {
				jQuery(header).css('width', columnWidths[colIdx] + 'px');
			}
		});
	}
	if (totalWidth !== 0) table.css('width', totalWidth + 'px');
}

export function changeRowCount(dataTable: Api<unknown>, newRowCount: number) {
	console.log('Change Row Count entered!', newRowCount);
	dataTable.page.len(newRowCount).draw();
	console.log('Table drawn!');
}

function handleArray(columnName: string, cellData: string | string[]) {
	// === OPS & SUBSTANCE (gemeinsamer Zweig) ===
	if (isArrayFilterColumn(columnName)) {
		const queryItems = createArrayFilterItems(columnName, cellData);
		queryItems.forEach(addItem);

		if (queryItems.length > 0) reloadOnly?.();
		return;
	}

	// === COMPLICATION ===
	// Beispiel-Input: "Bleeding:2, Infection:3"
	if (columnName === 'complication') {
		String(cellData ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
			.forEach((entry) => {
				const idx = entry.indexOf(':');
				const left = idx === -1 ? entry.trim() : entry.slice(0, idx).trim();
				const right = idx === -1 ? '' : entry.slice(idx + 1).trim();

				if (left) {
					addItem({
						id: '-',
						key: 'complication_complication',
						name: '-',
						type: 'EQUALS',
						system: 'therapy',
						values: [{ name: left, value: left, queryBindId: '-' }]
					});
				}
				if (right) {
					addItem({
						id: '-',
						key: 'complication_grade',
						name: '-',
						type: 'EQUALS',
						system: 'therapy',
						values: [{ name: right, value: right, queryBindId: '-' }]
					});
				}
			});

		reloadOnly?.();
		return;
	}

	// === Default / andere Fälle ===
	// hier deine bisherige Logik für tumorID/ageAtDiagnosis/DaysSinceDiagnosis etc.
	// z.B.:
	// addItem({...});
	// numberPickerStore.set({...});
	// reloadOnly?.();
}

function bindCellClickHandler(
	getDataTable: () => Api<unknown>,
	tableCell: HTMLElement,
	cellData: unknown,
	colIndex: number,
	collection: string,
	enableCellClick: boolean,
	beforeSelect?: () => boolean | void,
	cellClickHandlers?: TableCellClickHandlers
) {
	if (!enableCellClick) {
		tableCell.onclick = null;
		return;
	}

	if (cellClickHandlers) {
		tableCell.onclick = function () {
			const table = getDataTable();
			const columnName = table.settings()[0]?.aoColumns[colIndex]?.data;
			const selectRow = cellClickHandlers[columnName];
			if (!selectRow) return;
			const row = tableCell.closest('tr');
			const rowData = row ? table.row(row).data() : undefined;
			if (!rowData || beforeSelect?.() === false) return;
			return selectRow(rowData as Record<string, unknown>);
		};
		return;
	}

	const isDate = moment(cellData, 'DD.MM.YYYY', true).isValid();
	if (isDate) {
		tableCell.onclick = function () {
			const settings = getDataTable().settings()[0];
			if (settings && settings.aoColumns) {
				const columnName = settings.aoColumns[colIndex].data as string;
				console.log('DATUMSKLICK', cellData, columnName);
				void copyFilterValue(cellData);
				dateStore.set({
					show: true,
					selectedDate: String(cellData),
					collection,
					typeOfDate: columnName,
					fieldLabel: settings.aoColumns[colIndex].nTh?.textContent?.trim(),
					onConfirm: beforeSelect
				});
			}
		};
		return;
	}

	tableCell.onclick = function () {
		let processedCellData = cellData;
		if (processedCellData === '' || processedCellData === null || processedCellData === undefined) {
			processedCellData = '-';
		}
		const settings = getDataTable().settings()[0];
		if (settings && settings.aoColumns) {
			let columnName = settings.aoColumns[colIndex].data as string;
			columnName = columnName.replace('.', '_');
			if (columnName === 'T' || columnName === 'N' || columnName === 'M') {
				const v = String(processedCellData ?? '').trim();

				if (v === '1' || v === '2' || v === '3' || v === '4') {
					void copyFilterValue(v);
					tnmPickerStore.set({
						show: true,
						selectedTNM: v,
						collection,
						typeOfTNM: columnName
					});
					return;
				}
			}

			if (
				columnName !== 'tumorID' &&
				columnName !== 'ageAtDiagnosis' &&
				!/DaysSinceDiagnosis$/.test(columnName)
			) {
				if (beforeSelect?.() === false) return;
				void copyFilterValue(cellData);
				if (
					columnName === 'ops' ||
					columnName === 'surgeon' ||
					columnName === 'substance' ||
					columnName === 'complication' ||
					columnName === 'metastasisResection'
				) {
					handleArray(columnName, processedCellData as string | string[]);
				} else {
					const filterValues: { key: string; value: string }[] = [];

					if (columnName === 'status') {
						const row = tableCell.closest('tr');
						const rowData = row
							? (getDataTable().row(row).data() as Record<string, unknown> | undefined)
							: undefined;

						if (rowData && Object.prototype.hasOwnProperty.call(rowData, 'type')) {
							const typeValue = rowData.type;
							filterValues.push({
								key: 'type',
								value:
									typeValue === '' || typeValue === null || typeValue === undefined
										? '-'
										: String(typeValue)
							});
						}
					}

					filterValues.push({ key: columnName, value: String(processedCellData) });
					filterValues.forEach(({ key, value }) =>
						addItem({
							id: '-',
							key,
							name: '-',
							type: 'EQUALS',
							system: collection,
							values: [{ name: value, value, queryBindId: '-' }]
						})
					);
					reloadOnly();
				}
			} else {
				void copyFilterValue(cellData);
				numberStore.set({
					show: true,
					selectedNumber: processedCellData as string | number,
					collection,
					fieldName: columnName,
					onConfirm: beforeSelect
				});
			}
		}
	};
}
