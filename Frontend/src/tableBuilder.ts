// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import jQuery from 'jquery';
import DataTable from 'datatables.net';
import 'datatables.net';
import type { LensDataPasser } from '@samply/lens';
import type { ConfigColumns, Api } from 'datatables.net';
import moment from 'moment';
import { reloadOnly } from '../src/store/reloadStore';
import { datePickerStore } from './store/datePickerStore'; // Importiere den Store
import { numberPickerStore } from './store/numberPickerStore'; // Importiere den Store
import { TNMPickerStore } from './store/TNMPickerStore'; // Importiere den Store
import {
	appendQueryItemToFirstGroup,
	createArrayFilterItems,
	isArrayFilterColumn
} from './tableFilterItems';
import type { QueryItem } from './tableFilterItems';

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
};

type DatePickerState = {
	show: boolean;
	selectedDate: string | null;
	collection: string | null;
	typeOfDate: string | null;
};

type WritableSet<T> = { set: (value: T) => void };

const tnmPickerStore = TNMPickerStore as unknown as WritableSet<TNMPickerState>;
const numberStore = numberPickerStore as unknown as WritableSet<NumberPickerState>;
const dateStore = datePickerStore as unknown as WritableSet<DatePickerState>;

type TableColumnFilter = {
	field: string;
	value: string;
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

type ServerSideTableOptions = {
	fetchPage: (request: TablePageRequest) => Promise<TablePageResult>;
};

const normalizeColumnSearch = (value: string): string =>
	value.replace(/^\(+/, '').replace(/\)+$/, '');

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
	const queryBeforeAdd = currentDataPasser.getQueryAPI();
	currentDataPasser.setQueryStoreAPI(
		appendQueryItemToFirstGroup(queryBeforeAdd, normalizedQueryObject)
	);
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
			const title = jQuery(this).text();
			jQuery(this).html('<input style="width: 80%" type="text" placeholder="' + title + '" />');
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
						: processedData;
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
                <span class="tooltiptext">${processedData}</span>
                ${
									typeof processedData === 'string'
										? processedData.substring(0, maxLength) + '…'
										: ''
								}
              </span>`
							: processedData;
					}
					return processedData;
				},

				createdCell: function (
					cell: Node,
					cellData: string | string[] | null,
					_rowData: unknown,
					_rowIndex: number,
					colIndex: number
				) {
					const tableCell = cell as HTMLElement;
					if (tableID !== 'userManagementTable') {
						truncateCellData(tableCell, cellData, colIndex);
					}

					bindCellClickHandler(
						() => dataTable,
						tableCell,
						cellData,
						colIndex,
						collection,
						effectiveEnableCellClick
					);
				}
			}
		],

		initComplete: function (this: { api: () => Api<unknown> }) {
			const api = this.api();

			getColumnIndexes(api).forEach((colIdx) => {
				const cell = jQuery(`.${tableID}-filters th`).eq(
					jQuery(api.column(colIdx).header()).index()
				);
				let input = jQuery('input', cell);
				if (!input.length) {
					const title = jQuery(api.column(colIdx).header()).text();
					jQuery(cell).html(
						'<input style="width: 80%" type="text" placeholder="' + title + '" />'
					);
					input = jQuery('input', cell);
				}

				let filterTimer: ReturnType<typeof setTimeout> | null = null;
				const applySearch = (inputElement: HTMLInputElement) => {
					const searchValue = inputElement.value;
					inputElement.setAttribute('title', searchValue);
					const regexr = '({search})';
					api
						.column(colIdx)
						.search(
							searchValue !== '' ? regexr.replace('{search}', '(((' + searchValue + ')))') : '',
							searchValue !== '',
							searchValue === ''
						)
						.draw();
				};

				input
					.off('keyup change')
					.on('change', function (e) {
						applySearch(e.target as HTMLInputElement);
					})
					.on('keyup', function (e) {
						e.stopPropagation();
						const inputElement = e.target as HTMLInputElement;
						if (filterTimer) {
							clearTimeout(filterTimer);
						}
						filterTimer = setTimeout(() => applySearch(inputElement), 500);
					});
			});
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
							truncateCellData(this, cellData, _colIdx);
						}
						bindCellClickHandler(
							() => dataTable,
							this,
							cellData,
							_colIdx,
							collection,
							effectiveEnableCellClick
						);
					});
			});
			if (tableID !== 'userManagementTable') {
				adjustColumnWidths(api, columns);
			}
		},
		data: effectiveServerSideOptions ? undefined : tableData,
		deferRender: true,
		paging: true,
		pageLength: rowCount,
		lengthChange: false,
		columns: columns,
		autoWidth: false
	};

	if (effectiveServerSideOptions) {
		dataTableConfig.serverSide = true;
		dataTableConfig.searchDelay = 500;
		dataTableConfig.ajax = async function (request: any, callback: (data: unknown) => void) {
			const order = request.order?.[0];
			const orderColumnIndex = typeof order?.column === 'number' ? order.column : sortingIndex;
			const orderedColumn = request.columns?.[orderColumnIndex];
			const sortField = typeof orderedColumn?.data === 'string' ? orderedColumn.data : null;
			const sortDirection = order?.dir === 'asc' ? 'asc' : 'desc';
			const columnFilters = (request.columns ?? [])
				.map((column: any) => ({
					field: column.data,
					value: normalizeColumnSearch(column.search?.value ?? '')
				}))
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

function truncateCellData(
	cell: HTMLElement,
	cellData: string | string[] | null | undefined,
	colIndex: number
) {
	const processedCellData = Array.isArray(cellData) ? cellData.join(', ') : (cellData ?? '') + '';
	requestAnimationFrame(() => {
		const charWidth = 7; // Average character width in pixels (adjust if necessary)
		const cellWidth = jQuery(cell).width() ?? 0;
		const truncateLength = Math.floor(cellWidth / charWidth);

		const settings = jQuery(cell).closest('table').DataTable().settings()[0];

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
                              <span class="tooltiptext">${processedCellData}</span>
                              ${truncatedData}
                            </span>`);
			} else {
				jQuery(cell).html(processedCellData);
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
	enableCellClick: boolean
) {
	if (!enableCellClick) {
		tableCell.onclick = null;
		return;
	}

	const isDate = moment(cellData, 'DD.MM.YYYY', true).isValid();
	if (isDate) {
		tableCell.onclick = function () {
			const settings = getDataTable().settings()[0];
			if (settings && settings.aoColumns) {
				const columnName = settings.aoColumns[colIndex].data as string;
				console.log('DATUMSKLICK', cellData, columnName);
				dateStore.set({
					show: true,
					selectedDate: cellData as string | null,
					collection,
					typeOfDate: columnName
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
				numberStore.set({
					show: true,
					selectedNumber: processedCellData as string | number,
					collection,
					fieldName: columnName
				});
			}
		}
	};
}
