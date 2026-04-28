const nullValues = ['-', '', ' ', null];

const nullAst = '{"operand":"OR","children":[]}';

function roundToNextUTCMidnight(timestamp) {
	let date = new Date(timestamp);
	date.setUTCHours(0, 0, 0, 0);

	if (timestamp % 86400000 !== 0) {
		date.setUTCDate(date.getUTCDate() + 1);
	}
	return date;
}

const arrayFields = [
	'ICDO',
	'ECOG',
	'radiation',
	'complication',
	'substance',
	'ops',
	'surgeon',
	'metastasisResection'
];

function logicalOp(op) {
	switch (op) {
		case 'AND':
			return { $and: [] };
		case 'OR':
			return { $or: [] };
		case 'NOR':
			return { $nor: [] }; // neu
		case 'XOR':
			// schon bestehende XOR-Definition
			return { $nor: [{ $nor: [] }, { $and: [] }] };
		default:
			throw new Error(`Unknown logical operator: ${op}`);
	}
}

function parseBooleanString(v) {
	return v === 'true' || v === 'false' ? v === 'true' : v;
}

async function getExcludedTumorIDs(db, system, key, excludedValue, isSpecialCase = false) {
	const dbCollection = db.collection(system);
	const diagnosisCollection = db.collection('diagnosis');
	const systemTumorIDs = (await dbCollection.distinct('tumorID')) || [];
	console.log(
		'CHECK 1 - Gibt die TumorIDs der angefragten Collection aus:',
		system,
		systemTumorIDs
	);

	const dbKey = key;
	const filterValues = isSpecialCase ? nullValues : [excludedValue];
	console.log('CHECK 2 filterValues', filterValues);
	console.log('DB KEY', dbKey);

	// Bestimme, ob Collection 'patient' ist, die tumorIDs als Array speichert
	const isPatient = system === 'patient';

	// 1) Finde IDs in der Collection matching filterValues
	const pipeline = [
		{
			$addFields: {
				tmpArr: {
					$cond: {
						if: { $isArray: `$${dbKey}` },
						then: `$${dbKey}`,
						else: [`$${dbKey}`]
					}
				}
			}
		},
		{
			$match: {
				$expr: {
					$gt: [{ $size: { $setIntersection: ['$tmpArr', filterValues] } }, 0]
				}
			}
		}
	];
	// Für Patient: tumorIDs array aufsplitten
	if (isPatient) {
		pipeline.push({ $unwind: '$tumorID' });
		pipeline.push({
			$group: {
				_id: null,
				ts: { $addToSet: '$tumorID' }
			}
		});
	} else {
		pipeline.push({
			$group: {
				_id: null,
				ts: { $addToSet: '$tumorID' }
			}
		});
	}

	const collectionSet = (await dbCollection.aggregate(pipeline).next())?.ts || [];
	console.log('CHECK 3', collectionSet);

	// 2) Diagnosen-IDs außerhalb dieser Collection
	const diagnosisSet = await getDiagnosisOnlyTumorIDs(db, system);

	return [...new Set([...collectionSet, ...diagnosisSet])];
}

async function expression(db, colname, { key, type, system, value }) {
	key = key.replaceAll('!', '');
	let match = {};

	value = parseBooleanString(value);

	switch (type) {
		case 'EQUALS':
			match[key] = { $eq: value };
			if (value === '-') {
				match[key] = { $in: nullValues };
				if (system === colname) {
					// Own collection: filter directly on the field (no tumorID indirection)
					return match;
				}
				const excludedTumorIDs = await getExcludedTumorIDs(db, system, key, '-', true);
				return { tumorID: { $in: excludedTumorIDs } };
			}
			break;
		case 'BETWEEN':
			let { min, max } = value;
			const __bothNullish = (min == null || min === '') && (max == null || max === '');
			if (__bothNullish) {
				// Nur fehlende/Null/leer Werte zurückgeben
				match = { $or: [{ [key]: { $exists: false } }, { [key]: { $in: nullValues } }] };
				break;
			}
			if (key.toLowerCase().includes('date')) {
				min = roundToNextUTCMidnight(min);
				max = roundToNextUTCMidnight(max);
			}
			const __range = {};
			if (min != null && min !== '') __range.$gte = min;
			if (max != null && max !== '') __range.$lte = max;
			match[key] = __range;
			break;
	}
	//console.log("MATCH ==================> ", match)
	if (system === colname) return match;

	let tids =
		(
			await db
				.collection(system)
				.aggregate([{ $match: match }, { $group: { _id: null, ts: { $addToSet: '$tumorID' } } }])
				.next()
		)?.ts?.flat() || [];

	return { tumorID: { $in: tids } };
}

async function getDiagnosisOnlyTumorIDs(db, systemName) {
	const systemTumorIDs = await db.collection(systemName).distinct('tumorID');
	const diagAgg = await db
		.collection('diagnosis')
		.aggregate([
			{ $group: { _id: '$tumorID' } },
			{ $match: { _id: { $nin: systemTumorIDs } } },
			{ $group: { _id: null, ts: { $addToSet: '$_id' } } }
		])
		.next();
	return diagAgg?.ts?.flat() || [];
}

async function genMatchObject(filter, colname, db) {
	// ─── Fast-path: OR of many EQUALS on the same field/system ───
	// Prevents N DB roundtrips for huge lists (e.g. hundreds/thousands of patient IDs)
	if (
		filter?.operand === 'OR' &&
		Array.isArray(filter.children) &&
		filter.children.length > 1 &&
		filter.children.every((c) => !c.children && c.type === 'EQUALS')
	) {
		const systemName = filter.children[0]?.system;
		const field = String(filter.children[0]?.key ?? '').replaceAll('!', '');

		const sameFieldAndSystem =
			!!systemName &&
			!!field &&
			filter.children.every(
				(c) => c.system === systemName && String(c.key ?? '').replaceAll('!', '') === field
			);

		if (sameFieldAndSystem) {
			const values = filter.children.map((c) => parseBooleanString(c.value));
			// If '-' is involved we fall back to the existing slow-but-correct handling
			if (!values.includes('-')) {
				if (systemName === colname) {
					return { [field]: { $in: values } };
				} else {
					// Map foreign-system matches to tumorIDs in ONE query
					const tids =
						(
							await db
								.collection(systemName)
								.aggregate([
									{ $match: { [field]: { $in: values } } },
									{ $group: { _id: null, ts: { $addToSet: '$tumorID' } } }
								])
								.next()
						)?.ts?.flat() || [];
					return { tumorID: { $in: tids } };
				}
			}
		}
	}

	// Spezial-Case: Negierte NBETWEEN-Gruppe (NOT BETWEEN) mit AND NOT (OR ...)
	if (
		filter.key?.startsWith('!') &&
		filter.operand === 'OR' &&
		filter.children.every((c) => c.type === 'NBETWEEN')
	) {
		const field = filter.children[0].key.slice(1);
		const systemName = filter.children[0].system;
		const isDate = field.toLowerCase().includes('date');

		// 1) Bereiche aus den Kindern extrahieren und ggf. Datum runden
		const clauses = filter.children.map((c) => {
			let { min, max } = c.value;
			if (isDate) {
				min = roundToNextUTCMidnight(min);
				max = roundToNextUTCMidnight(max);
			}
			return { min, max };
		});
		// 2) Eigenes System: direkt AND von NOT BETWEEN
		if (systemName === colname) {
			return {
				$and: clauses.map(({ min, max }) => ({
					$or: [{ [field]: { $lt: min } }, { [field]: { $gt: max } }]
				}))
			};
		}
		// 3) Fremdsystem: IDs, die in einem der Intervalle liegen, zusammen sammeln
		const excludedInRanges = await db.collection(systemName).distinct('tumorID', {
			$or: clauses.map(({ min, max }) => ({
				[field]: { $gte: min, $lte: max }
			}))
		});
		// NOT-BETWEEN (Fremd-Collection): alle ausserhalb der Intervalle
		// (inkl. TIDs ohne Eintrag im Fremdsystem)
		return { tumorID: { $nin: excludedInRanges } };
	}

	// ─── Spezial-Case: Negation von '-' ───
	if (
		filter.key?.startsWith('!') &&
		filter.operand === 'OR' &&
		filter.children.length === 1 &&
		filter.children[0].type === 'NEQUALS' &&
		filter.children[0].value === '-'
	) {
		const field = filter.key.slice(1);
		const systemName = filter.children[0].system;
		const isArray = arrayFields.includes(field);
		// Feld liegt in einem Array von Objekten, z.B. "ICDO.grading"
		const arrPath = (() => {
			const dot = field.indexOf('.');
			if (dot <= 0) return null;
			const arr = field.slice(0, dot);
			if (!arrayFields.includes(arr)) return null;
			return { arr, sub: field.slice(dot + 1) };
		})();

		// — Eigenes System: direkt auf das Feld —
		if (systemName === colname) {
			if (isArray) {
				// keine Null-Werte im Array zulassen (und missing/null Arrays ausschließen)
				return {
					$expr: {
						$and: [
							{ $gt: [{ $size: { $ifNull: ['$' + field, []] } }, 0] },
							{
								$eq: [
									{ $size: { $setIntersection: [{ $ifNull: ['$' + field, []] }, nullValues] } },
									0
								]
							}
						]
					}
				};
			} else if (arrPath) {
				// Array von Objekten: mind. ein Element mit vorhandenem, nicht-leerem Subfeld
				return {
					[arrPath.arr]: {
						$elemMatch: {
							[arrPath.sub]: { $exists: true, $nin: nullValues }
						}
					}
				};
			} else {
				// Feld darf nicht fehlen und nicht in nullValues sein
				return { [field]: { $exists: true, $nin: nullValues } };
			}
		}

		// — Fremdsystem: tumorID-basiert mit Diagnose-ohne-System —
		// — Fremdsystem: Nur TIDs mit *vorhandenem* nicht-leerem Wert zulassen (NOT "-")
		let presentNonNullIDs;
		if (isArray) {
			presentNonNullIDs =
				(
					await db
						.collection(systemName)
						.aggregate([
							{
								$match: {
									$expr: {
										$and: [
											{ $gt: [{ $size: { $ifNull: ['$' + field, []] } }, 0] },
											{ $eq: [{ $size: { $setIntersection: ['$' + field, nullValues] } }, 0] }
										]
									}
								}
							},
							{ $group: { _id: null, ts: { $addToSet: '$tumorID' } } }
						])
						.next()
				)?.ts || [];
		} else if (arrPath) {
			presentNonNullIDs =
				(
					await db
						.collection(systemName)
						.aggregate([
							{
								$match: {
									[arrPath.arr]: {
										$elemMatch: { [arrPath.sub]: { $exists: true, $nin: nullValues } }
									}
								}
							},
							{ $group: { _id: null, ts: { $addToSet: '$tumorID' } } }
						])
						.next()
				)?.ts || [];
		} else {
			presentNonNullIDs = await db
				.collection(systemName)
				.distinct('tumorID', { [field]: { $exists: true, $nin: nullValues } });
		}
		return { tumorID: { $in: presentNonNullIDs } };
	}
	if (
		filter.key?.startsWith('!') &&
		filter.operand === 'OR' &&
		filter.children.every((c) => c.type === 'NEQUALS')
	) {
		const field = filter.key.slice(1);
		const excludedValues = filter.children.map((c) => parseBooleanString(c.value));
		const systemName = filter.children[0].system;
		const isArrayField = arrayFields.includes(field);

		// — Fremdsystem: Filter auf tumorID-Ebene —
		if (systemName !== colname) {
			const clauses = await Promise.all(
				excludedValues.map(async (val) => {
					// hole nur die TumorIDs IM System mit genau diesem Wert
					val = parseBooleanString(val);
					let systemOnlyIDs;
					if (isArrayField) {
						systemOnlyIDs =
							(
								await db
									.collection(systemName)
									.aggregate([
										{ $match: { [field]: { $elemMatch: { $eq: val } } } },
										{ $group: { _id: null, ts: { $addToSet: '$tumorID' } } }
									])
									.next()
							)?.ts || [];
					} else {
						systemOnlyIDs = await db.collection(systemName).distinct('tumorID', { [field]: val });
					}
					return { tumorID: { $in: systemOnlyIDs } };
				})
			);

			const norObj = logicalOp('NOR');
			norObj.$nor = clauses;
			return norObj;
		}

		// — Eigenes System: direkt auf Feld —
		// Spezialfall "-" = alle Null-Fälle ausschließen
		if (excludedValues.length === 1 && excludedValues[0] === '-') {
			const norObj = logicalOp('NOR');
			if (isArrayField) {
				norObj.$nor = [
					{ $expr: { $gt: [{ $size: { $setIntersection: ['$' + field, nullValues] } }, 0] } }
				];
			} else {
				norObj.$nor = [{ [field]: { $in: nullValues } }];
			}
			return norObj;
		}

		// — Mehrfachwerte ausschließen —
		const clauses = excludedValues.map((val) => {
			if (val === '-') {
				// genau wie beim Single-Case: alle nullValues matchen
				if (isArrayField) {
					return {
						$expr: { $gt: [{ $size: { $setIntersection: [`$${field}`, nullValues] } }, 0] }
					};
				} else {
					return { [field]: { $in: nullValues } };
				}
			} else {
				// ganz normales Excluding
				if (isArrayField) {
					return { [field]: { $elemMatch: { $eq: val } } };
				}
				return { [field]: { $eq: val } };
			}
		});

		const norObj = logicalOp('NOR');
		norObj.$nor = clauses;
		return norObj;
	}

	// ─── Fallback: rekursiv alle Children auswerten ───
	let pos = 0;
	let arry = Array(filter.children.length).fill(null);
	for (const ele of filter.children) {
		if (!ele.children) {
			arry[pos] = await expression(db, colname, ele);
			pos += 1;
		} else {
			let ex = await genMatchObject(ele, colname, db);
			arry[pos] = ex;
			pos += 1;
		}
	}
	console.log(filter.operand, 'filter.operand');
	let c = logicalOp(filter.operand);
	console.log(c, 'filter.operator outer');
	let cKey = Object.keys(c)[0];
	if (c[cKey].length == 2) {
		console.log(c[cKey]);
		c.$nor[0].$nor = arry;
		c.$nor[1].$and = arry;
	} else {
		c[cKey] = arry;
	}
	return c;
}

const filterStage = (colname, { key, type, system, value }) => {
	if (['true', 'false'].includes(value)) {
		value = value === 'true';
	}
	// Clean Key
	const cleanKey = key.startsWith('!') ? key.slice(1) : key;

	// System-Check
	if (system !== colname) return null;

	// Array-Name und Feld extrahieren
	const [arr, field] = cleanKey.split('.', 2);
	if (!arrayFields.includes(arr)) return null;

	const fieldRef = `$$it.${field}`;
	let condExpr;

	// Sonderfall: '-' (Null-/Leereinträge) mit NEQUALS vs. EQUALS
	if (value === '-') {
		const inNulls = { $in: [fieldRef, nullValues] };
		// Für EQUALS: nur Null-/Leereinträge, für NEQUALS: alle außer Null-/Leereinträge
		condExpr = type === 'NEQUALS' ? { $not: [inNulls] } : inNulls;

		// BETWEEN / NBETWEEN
	} else if (type === 'BETWEEN' || type === 'NBETWEEN') {
		let { min, max } = value || {};
		const bothNullish = (min == null || min === '') && (max == null || max === '');
		if (bothNullish) {
			// Wie bei "-": leere Werte (inkl. fehlender Felder) matchen
			condExpr = { $in: [fieldRef, nullValues] };
		} else {
			if (field.toLowerCase().includes('date')) {
				min = roundToNextUTCMidnight(min);
				max = roundToNextUTCMidnight(max);
			}

			const ands = [];
			if (min != null && min !== '') ands.push({ $gte: [fieldRef, min] });
			if (max != null && max !== '') ands.push({ $lte: [fieldRef, max] });
			const rangeCond = ands.length ? { $and: ands } : { $expr: true };

			condExpr = type === 'NBETWEEN' ? { $not: [rangeCond] } : rangeCond;
		}

		// NEQUALS: Werte ungleich einem bestimmten Wert
	} else if (type === 'NEQUALS') {
		condExpr = { $ne: [fieldRef, value] };

		// Default EQUALS
	} else {
		condExpr = { $eq: [fieldRef, value] };
	}

	// Rückgabe des $set-$filter-Stage
	return {
		$set: {
			[arr]: {
				$filter: {
					input: `$${arr}`,
					as: 'it',
					cond: condExpr
				}
			}
		}
	};
};

/**
 * Generiert die Array-Filter-Stages für ein AST-Filter-Objekt.
 * Unterstützt Spezialfälle für OR-Gruppen von BETWEEN und EQUALS.
 */
function genArryFilterStage(filter, colname) {
	// OR von mehreren (N)BETWEEN auf demselben Feld, vereint
	if (
		filter.operand === 'OR' &&
		filter.children.every(
			(c) => !c.children && (c.type === 'BETWEEN' || c.type === 'NBETWEEN') && c.system === colname
		)
	) {
		// Typ feststellen: BETWEEN oder NBETWEEN
		const isNegated = filter.children[0].type === 'NBETWEEN';

		// Key und Array/Feld extrahieren
		const rawKey = filter.children[0].key;
		const cleanKey = rawKey.startsWith('!') ? rawKey.slice(1) : rawKey;
		const [arr, field] = cleanKey.split('.', 2);
		if (!arrayFields.includes(arr)) return [];

		// Für jedes Kind die AND-Bedingung bauen
		const orConds = filter.children.map((c) => {
			let { min, max } = c.value;
			const bothNullish = (min == null || min === '') && (max == null || max === '');
			if (bothNullish) {
				// Element ist 'leer': Feld fehlt/ist null oder gehört zu nullValues ("", " ", "-")
				return {
					$or: [
						{ $eq: [{ $ifNull: [`$$it.${field}`, '__NULL__'] }, '__NULL__'] },
						{ $in: [`$$it.${field}`, nullValues] }
					]
				};
			}
			if (field.toLowerCase().includes('date')) {
				min = roundToNextUTCMidnight(min);
				max = roundToNextUTCMidnight(max);
			}
			const ands = [];
			if (min != null && min !== '') ands.push({ $gte: [`$$it.${field}`, min] });
			if (max != null && max !== '') ands.push({ $lte: [`$$it.${field}`, max] });
			return ands.length ? { $and: ands } : { $expr: true };
		});

		// Entweder OR oder NOT(OR)
		const condExpr = isNegated ? { $not: { $or: orConds } } : { $or: orConds };

		// Ein einziger $set-Stage
		return [
			{
				$set: {
					[arr]: {
						$filter: {
							input: `$${arr}`,
							as: 'it',
							cond: condExpr
						}
					}
				}
			}
		];
	}

	// OR von mehreren EQUALS auf demselben Feld
	if (
		filter.operand === 'OR' &&
		filter.children.every((c) => !c.children && c.type === 'EQUALS' && c.system === colname)
	) {
		const rawKey = filter.children[0].key;
		const cleanKey = rawKey.startsWith('!') ? rawKey.slice(1) : rawKey;
		const [arr, field] = cleanKey.split('.', 2);
		if (!arrayFields.includes(arr)) return [];

		const values = filter.children.map((c) => parseBooleanString(c.value));
		// Wenn nur '-' ausgewählt, alle nullValues nutzen
		const condList = values.length === 1 && values[0] === '-' ? nullValues : values;

		return [
			{
				$set: {
					[arr]: {
						$filter: {
							input: `$${arr}`,
							as: 'it',
							cond: { $in: [`$$it.${field}`, condList] }
						}
					}
				}
			}
		];
	}

	// Alle anderen Fälle rekursiv abarbeiten
	const stages = [];
	for (const it of filter.children) {
		if (!it.children) {
			const stg = filterStage(colname, it);
			if (stg) stages.push(stg);
		} else {
			stages.push(...genArryFilterStage(it, colname));
		}
	}
	return stages;
}

module.exports.filter2match = async ({ value, column, db }) => {
	//console.log(value, "rawast")
	//console.log(value === nullAst, "if")
	if (value === nullAst) return [];
	const ast = parseFilterAst(value);
	const gen2Arry = await genMatchObject(ast, column, db);
	const filterArry = genArryFilterStage(ast, column);
	//console.log("FILTER ARRAY -----",filterArry)
	let agg = [{ $match: gen2Arry }, ...filterArry];
	//console.log(JSON.stringify(agg), "match")
	return agg;
};

function parseFilterAst(raw) {
	return JSON.parse(raw.replaceAll(/_(?!3)(?!id)/g, '.'));
}
