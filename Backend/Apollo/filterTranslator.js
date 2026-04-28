const filter = [
	{
		column: 'icd10',
		columnDisplay: 'ICD 10 Code',
		value: {
			operator: '|',
			elements: [
				{
					value: 1,
					expression: '<'
				},
				{
					operator: '&',
					elements: [
						{
							value: 2,
							expression: '<'
						},
						{
							operator: '&',
							elements: [
								{
									operator: '&',
									elements: [
										{
											value: 3,
											expression: '≥'
										},
										{
											value: 4,
											expression: '<'
										}
									]
								},
								{
									value: 5,
									expression: '<'
								},
								{
									operator: '&',
									elements: [
										{
											value: 6,
											expression: '<'
										},
										{
											operator: '&',
											elements: [
												{
													value: 7,
													expression: '<'
												},
												{
													operator: '&',
													elements: [
														{
															value: 8,
															expression: '≥'
														},
														{
															value: 9,
															expression: '<'
														}
													]
												}
											]
										}
									]
								}
							]
						}
					]
				}
			]
		},
		type: 0
	},
	{
		column: 'icd',
		columnDisplay: 'ICD',
		value: {
			operator: '|',
			elements: [
				{
					value: 'C34',
					expression: 'beginnt mit'
				},
				{
					value: 'C34.3',
					expression: '=',
					negated: true
				},
				{
					value: 'C32.2',
					expression: '='
				}
			]
		},
		type: 1
	},
	{
		column: 'icd',
		columnDisplay: 'ICD',
		value: {
			operator: 'xor',
			elements: [
				{
					value: 'C34.3',
					expression: '='
				},
				{
					value: 'C32.2',
					expression: '='
				}
			]
		},
		type: 1
	}
];

const trail = {
	first: 'eins',
	inner: {
		zwei: 2,
		drei: 3
	}
};

const LogicalOperator = {
	AND: '&',
	OR: '|',
	XOR: 'xor'
};

//returns e.g. { "$or": [] }
function logicalOp(op) {
	let opStr = '';
	switch (op) {
		case LogicalOperator.AND:
			opStr = '$and';
			break;
		case LogicalOperator.OR:
			opStr = '$or';
			break;
		case LogicalOperator.XOR:
			return JSON.parse(`{"$nor": [ {"$nor": []}, {"$and": []} ] }`);
			break;
	}
	return JSON.parse(`{"${opStr}": []}`);
}

const Operation = {
	EQUAL: '=',
	UNEQUAL: '≠',
	GREATER_THEN: '>',
	LESS_THEN: '<',
	GREATER_OR_EQUAL: '≥',
	LESS_OR_EQUAL: '≤',
	STARTS_WITH: 'beginnt mit',
	CONTAINS: 'beinhaltet',
	REGEX: 'RegEx'
};

function expression(field, { expression, value, negated = false }) {
	let opStr = '';
	let bool = !negated;
	switch (expression) {
		case Operation.EQUAL:
			opStr = '$eq';
			break;
		case Operation.UNEQUAL:
			opStr = '$ne';
			break;
		case Operation.GREATER_THEN:
			opStr = '$gt';
			break;
		case Operation.LESS_THEN:
			opStr = '$lt';
			break;
		case Operation.GREATER_OR_EQUAL:
			opStr = '$gte';
			break;
		case Operation.LESS_OR_EQUAL:
			opStr = '$lte';
			break;
		case Operation.STARTS_WITH:
			return JSON.parse(
				`{ "$expr": { "$eq": [ { "$regexMatch": { "input": "$${field}", "regex": "^${value}", "options": "i" } }, ${bool}] } }`
			);
		case Operation.CONTAINS:
			return JSON.parse(
				`{ "$expr": { "$eq": [ { "$regexMatch": { "input": "$${field}", "regex": "${value}", "options": "i" } }, ${bool}] } }`
			);
		case Operation.REGEX:
			return JSON.parse(
				`{ "$expr": { "$eq": [ { "$regexMatch": { "input": "$${field}", "regex": "${value}" } }, ${bool}] } }`
			);
	}
	let posetive = `{"${field}": {"${opStr}": "${value}"}}`;
	let negation = `{"${field}": { "$not": {"${opStr}": "${value}"}} }`;
	if (negated) return JSON.parse(negation);
	return JSON.parse(posetive);
}

const genMatchObject = (filter, field) => {
	let pos = 0;
	let arry = Array(filter.elements.length).fill(null);
	filter.elements.forEach((ele) => {
		if (!ele.elements) {
			arry[pos] = expression(field, ele);
			pos += 1;
		} else {
			let ex = genMatchObject(ele, field);
			let con = logicalOp(ele.operator);
			let conKey = Object.keys(con)[0];
			con[conKey] = ex;
			arry[pos] = con;
			pos += 1;
		}
	});

	console.log(filter.operator, 'filter.operator');
	let c = logicalOp(filter.operator);
	console.log(c, 'filter.operator outer');
	let cKey = Object.keys(c)[0];
	if (c[cKey].length == 2) {
		console.log(c[cKey]);
		c.$nor[0].$nor = arry;
		c.$nor[1].$and = arry;
	} else c[cKey] = arry;
	return c;
};

module.exports.filter2match = (fil) => {
	const gen2Arry = genMatchObject(fil.value, fil.column);
	console.log(JSON.stringify(gen2Arry), 'match');
	return gen2Arry;
};
