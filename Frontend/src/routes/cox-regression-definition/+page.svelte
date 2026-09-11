<script lang="ts">
	import { t } from '../../store/languageStore';

	const covariates = [
		{ label: 'coxAge', description: 'coxAgeDescription' },
		{ label: 'coxGender', description: 'coxGenderDescription' },
		{ label: 'coxUicc', description: 'coxUiccDescription' },
		{ label: 'coxTStage', description: 'coxTStageDescription' },
		{ label: 'coxNStage', description: 'coxNStageDescription' },
		{ label: 'coxMStage', description: 'coxMStageDescription' },
		{ label: 'coxGrading', description: 'coxGradingDescription' },
		{ label: 'coxEcog', description: 'coxEcogDescription' },
		{ label: 'coxDiagnosisYear', description: 'coxDiagnosisYearDescription' },
		{ label: 'coxSynchronousMetastasis', description: 'coxSynchronousMetastasisDescription' }
	];

	const omittedReasons = [
		'coxOmittedMissingSurvival',
		'coxOmittedInvalidTime',
		'coxOmittedInvalidEvent',
		'coxOmittedMissingCovariate'
	];
</script>

<svelte:head>
	<title>{$t('coxDefinitionTitle')}</title>
</svelte:head>

<article class="box_style box_level2 cox-methodology">
	<a class="back-link" href="/survival">← {$t('coxDefinitionBack')}</a>
	<h1>{$t('coxDefinitionTitle')}</h1>
	<p class="lead">{$t('coxDefinitionIntro')}</p>

	<section>
		<h2>{$t('coxDefinitionCohortTitle')}</h2>
		<ul>
			<li>{$t('coxDefinitionCohortFilter')}</li>
			<li>{$t('coxDefinitionCohortIndex')}</li>
			<li>{$t('coxDefinitionCohortEndpoint')}</li>
		</ul>
	</section>

	<section>
		<h2>{$t('coxDefinitionVariablesTitle')}</h2>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>{$t('coxDefinitionVariableColumn')}</th>
						<th>{$t('coxDefinitionRuleColumn')}</th>
					</tr>
				</thead>
				<tbody>
					{#each covariates as covariate}
						<tr>
							<td><b>{$t(covariate.label)}</b></td>
							<td>{$t(covariate.description)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section>
		<h2>{$t('coxDefinitionOmittedTitle')}</h2>
		<p>{$t('coxDefinitionOmittedIntro')}</p>
		<ul>
			{#each omittedReasons as reason}
				<li>{$t(reason)}</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2>{$t('coxDefinitionInterpretationTitle')}</h2>
		<ul>
			<li>{$t('coxDefinitionHazardRatio')}</li>
			<li>{$t('coxDefinitionConfidenceInterval')}</li>
			<li>{$t('coxDefinitionPValue')}</li>
			<li>{$t('coxCIndexExplanation')}</li>
			<li>{$t('coxDefinitionPhTest')}</li>
		</ul>
	</section>

	<section>
		<h2>{$t('coxMethodSoftware')}</h2>
		<p>{$t('coxRPackageDescription')}</p>
		<p>{$t('coxDefinitionSoftwareRuntime')}</p>
		<p>{$t('coxDefinitionModelScope')}</p>
		<p>
			<a href="https://cran.r-project.org/package=survival" target="_blank" rel="noreferrer">
				{$t('coxRPackageSource')}
			</a>
		</p>
	</section>
</article>

<style>
	.cox-methodology {
		box-sizing: border-box;
		width: calc(100% - 2rem);
		height: calc(100% - 2rem);
		min-height: 0;
		margin: 1rem auto;
		padding: 1.25rem 1.5rem 2rem;
		overflow-y: auto;
		overscroll-behavior-y: contain;
		line-height: 1.5;
	}

	.back-link {
		display: inline-block;
		margin-bottom: 0.5rem;
	}

	h1 {
		margin: 0 0 0.5rem;
		font-size: 1.55rem;
	}

	h2 {
		margin: 0 0 0.55rem;
		font-size: 1.1rem;
	}

	.lead {
		margin-top: 0;
		font-style: italic;
	}

	section {
		margin-top: 1.35rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(128, 128, 128, 0.35);
	}

	ul {
		margin: 0.4rem 0 0;
		padding-left: 1.3rem;
	}

	li + li {
		margin-top: 0.4rem;
	}

	.table-wrap {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th,
	td {
		padding: 0.55rem 0.7rem;
		border: 1px solid rgba(128, 128, 128, 0.3);
		text-align: left;
		vertical-align: top;
	}

	th {
		background: rgba(128, 128, 128, 0.12);
	}

	td:first-child {
		width: 22%;
		white-space: nowrap;
	}

	a {
		color: var(--primary-color, #087f4c);
	}

	@media (max-width: 700px) {
		.cox-methodology {
			width: calc(100% - 1rem);
			height: calc(100% - 1rem);
			margin: 0.5rem;
			padding: 1rem;
		}

		td:first-child {
			white-space: normal;
		}
	}
</style>
