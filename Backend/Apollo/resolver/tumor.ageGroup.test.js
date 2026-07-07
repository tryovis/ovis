const assert = require('node:assert/strict');
const test = require('node:test');

const { Query } = require('./tumor');

test('getTumors projects materialized diagnosis age group without bucketing', async () => {
	let capturedPipeline = [];
	const context = {
		collections: { diagnosis: 'diagnosis' },
		db: {
			collection() {
				return {
					aggregate(pipeline) {
						capturedPipeline = pipeline;
						return {
							toArray: async () => [
								{
									_id: { label: '0-17', abscissa: null },
									extra: undefined,
									count: 2
								},
								{
									_id: { label: '100+', abscissa: null },
									extra: undefined,
									count: 1
								}
							]
						};
					}
				};
			}
		}
	};

	await Query.getTumors(
		null,
		{
			groupedBy: {
				group: 'ageAtDiagnosisGroup',
				genderWise: false,
				abscissa: 'none'
			}
		},
		context
	);

	const projectStage = capturedPipeline.find((stage) => stage.$project);
	assert.equal(projectStage.$project.ageAtDiagnosisGroup, '$ageAtDiagnosisGroup');
	const pipelineJson = JSON.stringify(capturedPipeline);
	assert.doesNotMatch(pipelineJson, /\$bucket/);
	assert.doesNotMatch(pipelineJson, /icdograding|fECOG|xECOG|ICDO|\$year|\$month|\$week/);
});
