<script lang="ts">
	import { t } from '../../store/languageStore';
	import { userStore } from '../../store/userStore';
	import { onDestroy } from 'svelte';
	import { legacyBodyMapSources } from './bodyMapLegacySources';

	let primaryColor = '';

	const verifiedBodyMapSources = [
		{
			assets: [
				'level2_C00-C14.svg',
				'level3_C10.svg',
				'level3_C11.svg',
				'level3_C13.svg',
				'level3_C13x.svg'
			],
			sourceName: 'Illu01 head neck.jpg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Illu01_head_neck.jpg',
			licenseName: 'Public domain',
			licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
			attribution: 'CDC / SEER, Arcadian',
			conditionKey: 'bodyMapPublicDomainUse'
		},
		{
			assets: ['level2_C15-C26.svg'],
			sourceName: 'Digestive system diagram edit.svg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Digestive_system_diagram_edit.svg',
			licenseName: 'Public domain',
			licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
			attribution: 'Mariana Ruiz Villarreal (LadyofHats) and listed editors',
			conditionKey: 'bodyMapPublicDomainUse'
		},
		{
			assets: ['level2_C40-C41.svg', 'level3_C40.svg', 'level3_C41.svg'],
			sourceName: 'Human skeleton front en.svg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Human_skeleton_front_en.svg',
			licenseName: 'Public domain',
			licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
			attribution: 'Mariana Ruiz Villarreal (LadyofHats)',
			conditionKey: 'bodyMapPublicDomainUse'
		},
		{
			assets: ['level2_C50-C50.svg', 'level3_C50.svg'],
			sourceName: 'Diagram 3 of 3 showing stage 2B breast cancer CRUK 015-it.svg',
			sourceUrl:
				'https://commons.wikimedia.org/wiki/File:Diagram_3_of_3_showing_stage_2B_breast_cancer_CRUK_015-it.svg',
			licenseName: 'CC BY-SA 4.0',
			licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
			attribution: 'Cancer Research UK / Wikimedia Commons',
			conditionKey: 'bodyMapCcBySaUse'
		},
		{
			assets: ['level2_C51-C58.svg'],
			sourceName: 'Scheme female reproductive system-en.svg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Scheme_female_reproductive_system-en.svg',
			licenseName: 'Public domain',
			licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
			attribution: 'CDC; vector version by Mysid',
			conditionKey: 'bodyMapPublicDomainUse'
		},
		{
			assets: ['level2_C60-C63.svg', 'level3_C60.svg', 'level3_C61.svg', 'level3_C63.svg'],
			sourceName: 'Male anatomy 1.png',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Male_anatomy_1.png',
			licenseName: 'CC BY-SA 4.0',
			licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
			attribution: 'Tsaitgaist / Sciencia58',
			conditionKey: 'bodyMapCcBySaUse'
		},
		{
			assets: ['level2_C64-C68.svg', 'level3_C64.svg', 'level3_C65.svg', 'level3_C66.svg'],
			sourceName: 'Urinary system.svg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Urinary_system.svg',
			licenseName: 'CC BY-SA 3.0',
			licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
			attribution: 'Jmarchn',
			conditionKey: 'bodyMapCcBySaUse'
		},
		{
			assets: ['level2_C69-C72.svg'],
			sourceName: 'Brain anatomy.svg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Brain_anatomy.svg',
			licenseName: 'CC BY-SA 4.0',
			licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
			attribution: 'InjuryMap',
			conditionKey: 'bodyMapCcBySaUse'
		},
		{
			assets: ['level1.svg', 'level3_C26.svg'],
			sourceName: 'Digestive system diagram en.svg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Digestive_system_diagram_en.svg',
			licenseName: 'Public domain',
			licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
			attribution: 'Mariana Ruiz Villarreal (LadyofHats)',
			conditionKey: 'bodyMapPublicDomainUse'
		},
		{
			assets: ['level3_C07.svg', 'level3_C08.svg'],
			sourceName: 'Blausen 0780 SalivaryGlands.png',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Blausen_0780_SalivaryGlands.png',
			licenseName: 'CC BY 3.0',
			licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
			attribution: 'BruceBlaus / Blausen.com staff',
			conditionKey: 'bodyMapCcByUse'
		},
		{
			assets: ['level3_C09.svg'],
			sourceName: 'Illu mouth.jpg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Illu_mouth.jpg',
			licenseName: 'Public domain',
			licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
			attribution: 'National Cancer Institute / SEER',
			conditionKey: 'bodyMapPublicDomainUse'
		},
		{
			assets: ['level3_C15.svg'],
			sourceName: 'Tractus intestinalis esophagus.svg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Tractus_intestinalis_esophagus.svg',
			licenseName: 'CC BY-SA 2.5',
			licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.5/',
			attribution: 'Orem and contributors listed on the source page',
			conditionKey: 'bodyMapCcBySaUse'
		},
		{
			assets: ['level3_C16.svg'],
			sourceName: 'Stomach-ca.svg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Stomach-ca.svg',
			licenseName: 'Public domain',
			licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
			attribution: 'Authors and contributors listed on the source page',
			conditionKey: 'bodyMapPublicDomainUse'
		},
		{
			assets: ['level3_C17.svg'],
			sourceName: 'Blausen 0817 SmallIntestine Anatomy.png',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Blausen_0817_SmallIntestine_Anatomy.png',
			licenseName: 'CC BY 3.0',
			licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
			attribution: 'BruceBlaus / Blausen.com staff',
			conditionKey: 'bodyMapCcByUse'
		},
		{
			assets: ['level3_C18.svg'],
			sourceName: 'Offal, Marking, Medical (Pixabay 1463369)',
			sourceUrl: 'https://pixabay.com/illustrations/offal-marking-medical-colon-liver-1463369/',
			licenseName: 'Pixabay Content License',
			licenseUrl: 'https://pixabay.com/service/license-summary/',
			attribution: 'Elionas2 (credit appreciated, not required by the current license)',
			conditionKey: 'bodyMapPixabayUse'
		},
		{
			assets: ['level3_C19.svg', 'level3_C20.svg', 'level3_C21.svg'],
			sourceName: 'Rectum anatomy en.svg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Rectum_anatomy_en.svg',
			licenseName: 'CC BY 3.0',
			licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
			attribution: 'Armin Kübelbeck',
			conditionKey: 'bodyMapCcByUse'
		},
		{
			assets: ['level3_C22.svg'],
			sourceName: 'Anatomy Abdomen Tiesworks.jpg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Anatomy_Abdomen_Tiesworks.jpg',
			licenseName: 'Public domain',
			licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
			attribution: 'Ties van Brussel (Tvanbr)',
			conditionKey: 'bodyMapPublicDomainUse'
		},
		{
			assets: ['level3_C23.svg', 'level3_C25.svg'],
			sourceName: 'Blausen 0699 PancreasAnatomy2.png',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Blausen_0699_PancreasAnatomy2.png',
			licenseName: 'CC BY 3.0',
			licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
			attribution: 'BruceBlaus / Blausen.com staff',
			conditionKey: 'bodyMapCcByUse'
		},
		{
			assets: ['level3_C32.svg'],
			sourceName: 'Larynx and nearby structures.jpg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Larynx_and_nearby_structures.jpg',
			licenseName: 'Public domain',
			licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
			attribution: 'National Cancer Institute / Alan Hoofring',
			conditionKey: 'bodyMapPublicDomainUse'
		},
		{
			assets: ['level3_C33.svg', 'level3_C37.svg'],
			sourceName: '201701 Trachea and Bronchial tree.svg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:201701_Trachea_and_Bronchial_tree.svg',
			licenseName: 'CC BY 4.0',
			licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
			attribution: 'Database Center for Life Science (DBCLS); SVG by Yayamamo',
			conditionKey: 'bodyMapCcByUse'
		},
		{
			assets: ['level3_C34.svg'],
			sourceName: 'Lungs diagram simple.svg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Lungs_diagram_simple.svg',
			licenseName: 'CC BY 2.5',
			licenseUrl: 'https://creativecommons.org/licenses/by/2.5/',
			attribution: 'Patrick J. Lynch, medical illustrator',
			conditionKey: 'bodyMapCcByUse'
		},
		{
			assets: ['level3_C38.svg'],
			sourceName: 'Compartments of the mediastinum.png',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Compartments_of_the_mediastinum.png',
			licenseName: 'CC BY-SA 3.0',
			licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
			attribution: 'Anatomy & Physiology, Connexions / OpenStax',
			conditionKey: 'bodyMapCcBySaUse'
		},
		{
			assets: ['level3_C68.svg'],
			sourceName: '2605 The Bladder.jpg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:2605_The_Bladder.jpg',
			licenseName: 'CC BY 3.0',
			licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
			attribution: 'OpenStax College',
			conditionKey: 'bodyMapCcByUse'
		},
		{
			assets: ['level3_C69.svg'],
			sourceName: 'Three Internal chambers of the Eye.png',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Three_Internal_chambers_of_the_Eye.png',
			licenseName: 'CC BY 3.0',
			licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
			attribution: 'Holly Fischer',
			conditionKey: 'bodyMapCcByUse'
		},
		{
			assets: ['level3_C69.svg'],
			sourceName: 'Tear system.svg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Tear_system.svg',
			licenseName: 'CC BY-SA 2.5',
			licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.5/',
			attribution: 'FML / Erin Silversmith',
			conditionKey: 'bodyMapCcBySaUse'
		},
		{
			assets: ['level3_C72.svg'],
			sourceName: 'Brain human normal inferior view with labels en.svg',
			sourceUrl:
				'https://commons.wikimedia.org/wiki/File:Brain_human_normal_inferior_view_with_labels_en.svg',
			licenseName: 'CC BY 2.5',
			licenseUrl: 'https://creativecommons.org/licenses/by/2.5/',
			attribution: 'Patrick J. Lynch / Beao',
			conditionKey: 'bodyMapCcByUse'
		},
		{
			assets: ['level3_C74.svg'],
			sourceName: 'Illu adrenal gland.jpg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:Illu_adrenal_gland.jpg',
			licenseName: 'Public domain',
			licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
			attribution: 'National Cancer Institute / SEER',
			conditionKey: 'bodyMapPublicDomainUse'
		},
		{
			assets: ['level3_C75.svg'],
			sourceName: '1801 The Endocrine System.jpg',
			sourceUrl: 'https://commons.wikimedia.org/wiki/File:1801_The_Endocrine_System.jpg',
			licenseName: 'CC BY 3.0',
			licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
			attribution: 'OpenStax College',
			conditionKey: 'bodyMapCcByUse'
		}
	];

	type CombinedBodyMapSource = {
		assets: string[];
		sourceName: string;
		sourceUrl?: string;
		licenseName?: string;
		licenseUrl?: string;
		attribution?: string;
		conditionKey: string;
	};

	function formatBodyMapAsset(asset: string): string {
		if (/^level[_-]?1(?:\.svg)?$/i.test(asset)) return 'Level 1';

		const match = asset.match(/level[_-]?(\d+)[_-]?c?(\d{2})(?:[-_]?c?(\d{2}))?/i);
		if (!match) return asset.replace(/\.svg$/i, '');

		const [, level, start, end] = match;
		return `Level ${level} · C${start}${end ? `–C${end}` : ''}`;
	}

	function normalizeBodyMapAsset(asset: string): string {
		return formatBodyMapAsset(asset)
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '');
	}

	const verifiedAssetIds = new Set(
		verifiedBodyMapSources.flatMap((source) => source.assets.map(normalizeBodyMapAsset))
	);

	const legacySourceGroups = new Map<string, CombinedBodyMapSource>();
	for (const legacySource of legacyBodyMapSources) {
		if (verifiedAssetIds.has(normalizeBodyMapAsset(legacySource.asset))) continue;

		const groupKey = legacySource.sourceUrl ?? legacySource.sourceText;
		const existingGroup = legacySourceGroups.get(groupKey);
		if (existingGroup) {
			existingGroup.assets.push(legacySource.asset);
			continue;
		}

		legacySourceGroups.set(groupKey, {
			assets: [legacySource.asset],
			sourceName: legacySource.sourceText,
			sourceUrl: legacySource.sourceUrl,
			conditionKey: 'bodyMapUnverifiedUse'
		});
	}

	const combinedBodyMapSources: CombinedBodyMapSource[] = [
		...verifiedBodyMapSources,
		...legacySourceGroups.values()
	];

	const unsubscribe = userStore.subscribe((v: any) => {
		primaryColor = v?.primaryColor ?? '';
	});

	onDestroy(unsubscribe);
</script>

<div class="box_style box_level2 footer-content-box" style="--linkColor: {primaryColor}">
	<h1>{$t('licenseInformation')}</h1>

	<!-- Übersetzungsblock (enthält <section> mit .translated-link im Lizenz-Link) -->
	{@html $t('licenseInformationFull')}

	<!-- Zusätzliche Listen -->
	<section>
		<h3>{$t('dataSources')}</h3>
		<ul>
			<li>
				<a
					href="https://seer.cancer.gov/seerstat/variables/seer/raresiterecode/"
					target="_blank"
					rel="noopener noreferrer"
					>https://seer.cancer.gov/seerstat/variables/seer/raresiterecode/</a
				>
			</li>
			<li>
				<a
					href="https://www.suche-postleitzahl.org/downloads"
					target="_blank"
					rel="noopener noreferrer">https://www.suche-postleitzahl.org/downloads</a
				>
			</li>
			<li>
				<a href="https://www.bfarm.de/DE/Home/_node.html" target="_blank" rel="noopener noreferrer"
					>OPS / ICD10 / ICDO</a
				>
			</li>
		</ul>

		<h3>{$t('worldMapSources')}</h3>
		<p>{$t('worldMapSourcesFull')}</p>

		<div class="source-table-wrapper">
			<table class="source-table aligned-source-table">
				<colgroup>
					<col class="asset-column" />
					<col class="source-column" />
					<col class="conditions-column" />
				</colgroup>
				<thead>
					<tr>
						<th>{$t('mapAssets')}</th>
						<th>{$t('licenseAndSource')}</th>
						<th>{$t('permittedUseAndConditions')}</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td class="asset-list">
							<span>level1.svg</span>
							<span>level1_3stellig.svg</span>
						</td>
						<td>
							<a
								href="https://simplemaps.com/resources/svg-license"
								target="_blank"
								rel="noopener noreferrer"
							>
								SimpleMaps Free SVG / MIT License
							</a>
						</td>
						<td>{$t('simpleMapsUse')}</td>
					</tr>
					<tr>
						<td class="asset-list">
							<span>level2_*.svg</span>
							<span>level3_*.svg</span>
							<span>level4_*.svg</span>
						</td>
						<td>
							<a
								href="https://www.openstreetmap.org/copyright"
								target="_blank"
								rel="noopener noreferrer"
							>
								© OpenStreetMap contributors — ODbL 1.0
							</a><br />
							<a
								href="https://www.suche-postleitzahl.org"
								target="_blank"
								rel="noopener noreferrer"
							>
								Generated by suche-postleitzahl.org
							</a><br />
							<a
								href="https://github.com/betschki/DE-PLZ-states"
								target="_blank"
								rel="noopener noreferrer"
							>
								Additional processing source for level4_Ulm.svg: DE-PLZ-states
							</a>
						</td>
						<td>{$t('osmMapsUse')}</td>
					</tr>
				</tbody>
			</table>
		</div>

		<h3>Icons</h3>
		<ul>
			<li>
				<a href="https://www.flaticon.com" target="_blank" rel="noopener noreferrer"
					>www.flaticon.com</a
				>
			</li>
			<li>
				<a href="https://icon-sets.iconify.design" target="_blank" rel="noopener noreferrer"
					>https://icon-sets.iconify.design</a
				>
			</li>
		</ul>

		<h3>{$t('bodyMapSources')}</h3>

		<p>{$t('bodyMapSourcesFull')}</p>

		<div class="source-table-wrapper">
			<table class="source-table aligned-source-table">
				<colgroup>
					<col class="asset-column" />
					<col class="source-column" />
					<col class="conditions-column" />
				</colgroup>
				<thead>
					<tr>
						<th>{$t('bodyMapAssets')}</th>
						<th>{$t('licenseAndSource')}</th>
						<th>{$t('permittedUseAndConditions')}</th>
					</tr>
				</thead>
				<tbody>
					{#each combinedBodyMapSources as source}
						<tr>
							<td class="asset-list">
								{#each source.assets as asset}
									<span>{formatBodyMapAsset(asset)}</span>
								{/each}
							</td>
							<td>
								{#if source.sourceUrl}
									<a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">
										{source.sourceName}
									</a>
								{:else}
									{source.sourceName}
								{/if}
								{#if source.licenseUrl && source.licenseName}
									<br />
									<a href={source.licenseUrl} target="_blank" rel="noopener noreferrer">
										{source.licenseName}
									</a>
								{/if}
								{#if source.attribution}
									<br />{$t('bodyMapAttribution')}: {source.attribution}
								{/if}
							</td>
							<td>{$t(source.conditionKey)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!--
       <h3>{$t("images")}</h3>
    <ul>
      <li>
        <a
          href="https://www.flaticon.com"
          target="_blank"
          rel="noopener noreferrer"
          >www.flaticon.com</a
        >
      </li>
      <li>
        <a
          href="https://icon-sets.iconify.design"
          target="_blank"
          rel="noopener noreferrer"
          >https://icon-sets.iconify.design</a
        >
      </li>
    </ul>
  -->
	</section>
</div>

<style global>
	/* Links in diesem Block (inkl. {@html}-Inhalt) einfärben */
	.footer-content-box a,
	.footer-content-box .translated-link {
		color: var(--linkColor) !important;
		text-decoration: none;
	}

	.footer-content-box a:hover,
	.footer-content-box .translated-link:hover {
		text-decoration: underline;
	}

	.footer-content-box .source-table-wrapper {
		width: 100%;
		overflow-x: auto;
		margin-top: 0.75rem;
	}

	.footer-content-box .source-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	.footer-content-box .aligned-source-table {
		min-width: 720px;
		table-layout: fixed;
	}

	.footer-content-box .aligned-source-table .asset-column {
		width: 18%;
	}

	.footer-content-box .aligned-source-table .source-column {
		width: 42%;
	}

	.footer-content-box .aligned-source-table .conditions-column {
		width: 40%;
	}

	.footer-content-box .source-table th,
	.footer-content-box .source-table td {
		padding: 0.45rem 0.6rem;
		border: 1px solid rgba(0, 0, 0, 0.12);
		text-align: left;
		vertical-align: top;
	}

	.footer-content-box .source-table th {
		font-weight: 600;
	}

	.footer-content-box .source-table td:first-child {
		white-space: nowrap;
	}

	.footer-content-box .asset-list span {
		display: block;
		font-family: inherit;
	}

	.footer-content-box .aligned-source-table td:nth-child(2),
	.footer-content-box .aligned-source-table td:nth-child(3) {
		overflow-wrap: anywhere;
	}

	.footer-content-box .source-table td:last-child {
		word-break: break-word;
	}
</style>
