const { hasTableColumn } = require('./tableColumns');
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const asText = (input) => ({
	$convert: {
		input: { $cond: [{ $in: [{ $type: input }, ['array', 'object']] }, null, input] },
		to: 'string',
		onError: '',
		onNull: ''
	}
});
const arrayOrEmpty = (input) => ({ $cond: [{ $isArray: input }, input, []] });

const joinText = (input) => ({
	$ifNull: [
		{
			$reduce: {
				input,
				initialValue: null,
				in: {
					$cond: [{ $eq: ['$$value', null] }, '$$this', { $concat: ['$$value', ', ', '$$this'] }]
				}
			}
		},
		''
	]
});

function visibleArrayText(collection, field) {
	if (collection === 'study' && field === 'studyPatients') {
		return asText({ $size: arrayOrEmpty('$studyPatients') });
	}
	if (collection !== 'therapy') return null;

	// Match the displayed cells, not every value stored inside an object. In
	// particular OPS text/IDs and substance ATC codes are not shown in these columns.
	const objectArrayText = {
		ops: asText('$$entry.code'),
		substance: asText('$$entry.substance'),
		complication: {
			$concat: [
				asText('$$entry.complication'),
				{
					$cond: [
						{ $eq: [asText('$$entry.grade'), ''] },
						'',
						{ $concat: [':', asText('$$entry.grade')] }
					]
				}
			]
		}
	};
	const text = Object.hasOwn(objectArrayText, field) ? objectArrayText[field] : null;
	if (text) {
		return joinText({ $map: { input: arrayOrEmpty(`$${field}`), as: 'entry', in: text } });
	}
	if (!['surgeon', 'metastasisResection'].includes(field)) return null;

	// getAllTherapies also accepts a legacy scalar string for these two fields,
	// and removes empty/non-string array entries before returning them to the UI.
	return joinText({
		$filter: {
			input: { $cond: [{ $isArray: `$${field}` }, `$${field}`, [`$${field}`]] },
			as: 'entry',
			cond: {
				$and: [
					{ $eq: [{ $type: '$$entry' }, 'string'] },
					{ $ne: [{ $trim: { input: asText('$$entry') } }, ''] }
				]
			}
		}
	});
}

const normalizeColumnFilters = (columnFilters) =>
	(Array.isArray(columnFilters) ? columnFilters : []).filter(
		({ field, value }) => field && String(value ?? '').trim() !== ''
	);

// The table loaders display German calendar dates, including the two study dates
// without a "Date" suffix. Use the browser timezone for both lookup and filtering.
const dateFields = new Set([
	'birthDate',
	'vitalDate',
	'diagnosisDate',
	'ICDO_histologyDate',
	'diagnosticOccurrenceDate',
	'therapyOccurrenceDate',
	'therapyEndDate',
	'progressOccurrenceDate',
	'metastasisDate',
	'consultationOccurrenceDate',
	'tumorBoardOccurrenceDate',
	'tnmOccurrenceDate',
	'molecularMarkerOccurrenceDate',
	'bioMaterialOccurrenceDate',
	'supplementaryOccurrenceDate',
	'statusOccurrenceDate',
	'start',
	'firstPatInPlanned',
	'recruitmentDate'
]);

function dateTimezone(timeZone) {
	if (!timeZone) return 'UTC';
	// Resolve aliases and reject arbitrary MongoDB expressions or unknown zones.
	return new Intl.DateTimeFormat('en', { timeZone }).resolvedOptions().timeZone;
}

function formattedColumnText(collection, field, timeZone) {
	if (!hasTableColumn(collection, field)) return null;
	if (dateFields.has(field)) {
		return {
			$dateToString: {
				date: { $convert: { input: `$${field}`, to: 'date', onError: null, onNull: null } },
				format: '%d.%m.%Y',
				timezone: dateTimezone(timeZone),
				onNull: ''
			}
		};
	}
	// GraphQL prints numeric/boolean legacy values as text even for String fields.
	// Scalar conversion excludes embedded objects and unrecognized arrays.
	return visibleArrayText(collection, field) ?? asText(`$${field}`);
}

const columnFilterStages = (columnFilters, collection) =>
	normalizeColumnFilters(columnFilters).map(({ field, value, timeZone }) => {
		const input = formattedColumnText(collection, field, timeZone);
		const regex = escapeRegex(value);
		return {
			$match: input
				? { $expr: { $regexMatch: { input, regex, options: 'i' } } }
				: { [field]: { $regex: regex, $options: 'i' } }
		};
	});

module.exports = { columnFilterStages, normalizeColumnFilters, formattedColumnText, escapeRegex };
