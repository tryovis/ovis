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
			return { $nor: [] };
		case 'XOR':
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

	const isPatient = system === 'patient';

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

function getSingleLeafSystem(ast) {
	if (!ast) return null;
	if (!Array.isArray(ast.children)) return ast.system || null;

	let found = null;

	for (const child of ast.children) {
		const childSystem = getSingleLeafSystem(child);
		if (!childSystem) return null;
		if (found === null) found = childSystem;
		if (found !== childSystem) return null;
	}

	return found;
}

async function astToLocalMatch(ast, systemName, db) {
	return Array.isArray(ast.children)
		? await genMatchObject(ast, systemName, db)
		: await expression(db, systemName, ast);
}

function combineLogicalClauses(operand, clauses) {
	if (clauses.length === 0) return {};
	if (clauses.length === 1) return clauses[0];

	const combined = logicalOp(operand);
	const key = Object.keys(combined)[0];

	if (combined[key].length === 2) {
		combined.$nor[0].$nor = clauses;
		combined.$nor[1].$and = clauses;
	} else {
		combined[key] = clauses;
	}

	return combined;
}

async function tryBuildSameEntryForeignAnd(filter, colname, db) {
	if (filter?.operand !== 'AND' || !Array.isArray(filter.children)) return null;

	const groupedBySystem = new Map();
	const normalChildren = [];

	for (const child of filter.children) {
		const systemName = getSingleLeafSystem(child);

		if (systemName && systemName !== colname) {
			if (!groupedBySystem.has(systemName)) groupedBySystem.set(systemName, []);
			groupedBySystem.get(systemName).push(child);
		} else {
			normalChildren.push(child);
		}
	}

	const hasRealForeignGroup = [...groupedBySystem.values()].some((children) => children.length > 1);
	if (!hasRealForeignGroup) return null;

	const clauses = [];

	for (const child of normalChildren) {
		clauses.push(await astToLocalMatch(child, colname, db));
	}

	for (const [systemName, children] of groupedBySystem.entries()) {
		if (children.length === 1) {
			clauses.push(await astToLocalMatch(children[0], colname, db));
			continue;
		}

		const localClauses = [];

		for (const child of children) {
			localClauses.push(await astToLocalMatch(child, systemName, db));
		}

		const localMatch = combineLogicalClauses('AND', localClauses);

		const tids =
			(
				await db
					.collection(systemName)
					.aggregate([
						{ $match: localMatch },
						{ $group: { _id: null, ts: { $addToSet: '$tumorID' } } }
					])
					.next()
			)?.ts?.flat() || [];

		clauses.push({ tumorID: { $in: tids } });
	}

	return combineLogicalClauses('AND', clauses);
}

async function genMatchObject(filter, colname, db) {
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

			if (!values.includes('-')) {
				if (systemName === colname) {
					return { [field]: { $in: values } };
				}

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

	if (
		filter.key?.startsWith('!') &&
		filter.operand === 'OR' &&
		filter.children.every((c) => c.type === 'NBETWEEN')
	) {
		const field = filter.children[0].key.slice(1);
		const systemName = filter.children[0].system;
		const isDate = field.toLowerCase().includes('date');

		const clauses = filter.children.map((c) => {
			let { min, max } = c.value;
			if (isDate) {
				min = roundToNextUTCMidnight(min);
				max = roundToNextUTCMidnight(max);
			}
			return { min, max };
		});

		if (systemName === colname) {
			return {
				$and: clauses.map(({ min, max }) => ({
					$or: [{ [field]: { $lt: min } }, { [field]: { $gt: max } }]
				}))
			};
		}

		const excludedInRanges = await db.collection(systemName).distinct('tumorID', {
			$or: clauses.map(({ min, max }) => ({
				[field]: { $gte: min, $lte: max }
			}))
		});

		return { tumorID: { $nin: excludedInRanges } };
	}

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

		const arrPath = (() => {
			const dot = field.indexOf('.');
			if (dot <= 0) return null;
			const arr = field.slice(0, dot);
			if (!arrayFields.includes(arr)) return null;
			return { arr, sub: field.slice(dot + 1) };
		})();

		if (systemName === colname) {
			if (isArray) {
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
			}

			if (arrPath) {
				return {
					[arrPath.arr]: {
						$elemMatch: {
							[arrPath.sub]: { $exists: true, $nin: nullValues }
						}
					}
				};
			}

			return { [field]: { $exists: true, $nin: nullValues } };
		}

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

		if (systemName !== colname) {
			const clauses = await Promise.all(
				excludedValues.map(async (val) => {
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

		const clauses = excludedValues.map((val) => {
			if (val === '-') {
				if (isArrayField) {
					return {
						$expr: { $gt: [{ $size: { $setIntersection: [`$${field}`, nullValues] } }, 0] }
					};
				}

				return { [field]: { $in: nullValues } };
			}

			if (isArrayField) {
				return { [field]: { $elemMatch: { $eq: val } } };
			}

			return { [field]: { $eq: val } };
		});

		const norObj = logicalOp('NOR');
		norObj.$nor = clauses;
		return norObj;
	}

	const sameEntryForeignAnd = await tryBuildSameEntryForeignAnd(filter, colname, db);
	if (sameEntryForeignAnd) return sameEntryForeignAnd;

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

	const cleanKey = key.startsWith('!') ? key.slice(1) : key;

	if (system !== colname) return null;

	const [arr, field] = cleanKey.split('.', 2);
	if (!arrayFields.includes(arr)) return null;

	const fieldRef = `$$it.${field}`;
	let condExpr;

	if (value === '-') {
		const inNulls = { $in: [fieldRef, nullValues] };
		condExpr = type === 'NEQUALS' ? { $not: [inNulls] } : inNulls;
	} else if (type === 'BETWEEN' || type === 'NBETWEEN') {
		let { min, max } = value || {};
		const bothNullish = (min == null || min === '') && (max == null || max === '');

		if (bothNullish) {
			condExpr = {
				$or: [
					{ $eq: [{ $ifNull: [fieldRef, '__NULL__'] }, '__NULL__'] },
					{ $in: [fieldRef, nullValues] }
				]
			};
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
	} else if (type === 'NEQUALS') {
		condExpr = { $ne: [fieldRef, value] };
	} else {
		condExpr = { $eq: [fieldRef, value] };
	}

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

function genArryFilterStage(filter, colname) {
	if (
		filter.operand === 'OR' &&
		filter.children.every(
			(c) => !c.children && (c.type === 'BETWEEN' || c.type === 'NBETWEEN') && c.system === colname
		)
	) {
		const isNegated = filter.children[0].type === 'NBETWEEN';

		const rawKey = filter.children[0].key;
		const cleanKey = rawKey.startsWith('!') ? rawKey.slice(1) : rawKey;
		const [arr, field] = cleanKey.split('.', 2);
		if (!field || !arrayFields.includes(arr)) return [];

		const orConds = filter.children.map((c) => {
			let { min, max } = c.value;
			const bothNullish = (min == null || min === '') && (max == null || max === '');

			if (bothNullish) {
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

		const condExpr = isNegated ? { $not: { $or: orConds } } : { $or: orConds };

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

	if (
		filter.operand === 'OR' &&
		filter.children.every((c) => !c.children && c.type === 'EQUALS' && c.system === colname)
	) {
		const rawKey = filter.children[0].key;
		const cleanKey = rawKey.startsWith('!') ? rawKey.slice(1) : rawKey;
		const [arr, field] = cleanKey.split('.', 2);
		if (!field || !arrayFields.includes(arr)) return [];

		const values = filter.children.map((c) => parseBooleanString(c.value));
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

function astEveryLeaf(ast, predicate) {
	if (!Array.isArray(ast.children)) return predicate(ast);
	return ast.children.every((child) => astEveryLeaf(child, predicate));
}

async function tumorAstToPatientMatch(ast, db) {
	const tumorMatch = Array.isArray(ast.children)
		? await genMatchObject(ast, 'diagnosis', db)
		: await expression(db, 'diagnosis', ast);

	const tumorIDs = await db.collection('diagnosis').distinct('tumorID', tumorMatch);

	const patIDs = await db.collection('diagnosis').distinct('patID', {
		tumorID: { $in: tumorIDs }
	});

	return { patID: { $in: patIDs } };
}

async function genPatientMatchObject(ast, db) {
	if (!Array.isArray(ast.children)) {
		return ast.system === 'patient'
			? expression(db, 'patient', ast)
			: tumorAstToPatientMatch(ast, db);
	}

	if (astEveryLeaf(ast, (leaf) => leaf.system === 'patient')) {
		return genMatchObject(ast, 'patient', db);
	}

	if (astEveryLeaf(ast, (leaf) => leaf.system !== 'patient')) {
		return tumorAstToPatientMatch(ast, db);
	}

	const clauses = [];

	for (const child of ast.children) {
		clauses.push(await genPatientMatchObject(child, db));
	}

	return combineLogicalClauses(ast.operand, clauses);
}

module.exports.filter2match = async ({ value, column, db }) => {
	if (value === nullAst) return [];

	const ast = parseFilterAst(value);

	const gen2Arry =
		column === 'patient'
			? await genPatientMatchObject(ast, db)
			: await genMatchObject(ast, column, db);

	const filterArry = genArryFilterStage(ast, column);

	let agg = [{ $match: gen2Arry }, ...filterArry];

	return agg;
};

function parseFilterAst(raw) {
	return JSON.parse(raw.replaceAll(/_(?!3)(?!id)/g, '.'));
}
