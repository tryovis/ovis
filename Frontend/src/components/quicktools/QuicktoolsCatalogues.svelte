<script lang="ts">
	/* eslint-disable @typescript-eslint/no-explicit-any */
	import { t } from '../../store/languageStore';
	import { onMount, tick } from 'svelte';
	import type { LensDataPasser } from '@samply/lens';
	import { reloadOnly } from '../../store/reloadStore';
	import { addNumberInterval } from '../extendedAstFunctions';
	import { iconPath } from '$lib/path-utils';

	const infoIcon = iconPath('info-outlined.svg');

	let selectedCatalog = { value: 'none', label: '' };
	let lensReady = false;

	// reaktiv – aktualisiert bei Sprachwechsel automatisch
	$: selectedCatalog.label = $t('select') + ' ONKOZERT, DKH etc.';
	let dataPasser: LensDataPasser;

	onMount(async () => {
		await import('@samply/lens');
		await tick();
		lensReady = !!dataPasser;
	});

	function selectCatalog(value: string, label: string) {
		if (!lensReady || !dataPasser) return;
		selectedCatalog = { value, label };
		let queryItem: any;

		if (value === 'euracan') {
			queryItem = {
				id: 'Random generierte UUID',
				key: 'rareCancer',
				name: 'childCategorie.name',
				type: 'EQUALS',
				system: 'diagnosis',
				values: [{ name: 'rareCancer', value: 'true', queryBindId: 'Auch eine random UUID' }]
			};
		}
		if (value === 'sclc') {
			queryItem = {
				id: 'Random generierte UUID',
				key: 'sclc',
				name: 'childCategorie.name',
				type: 'EQUALS',
				system: 'diagnosis',
				values: [{ name: 'sclc', value: 'sclc', queryBindId: 'Auch eine random UUID' }]
			};
		}
		if (value === 'nsclc') {
			queryItem = {
				id: 'Random generierte UUID',
				key: 'nsclc',
				name: 'childCategorie.name',
				type: 'EQUALS',
				system: 'diagnosis',
				values: [{ name: 'nsclc', value: 'nsclc', queryBindId: 'Auch eine random UUID' }]
			};
		}

		// generisch: alle oz_* Keys
		if (value && value.startsWith('oz_')) {
			queryItem = {
				id: 'Random generierte UUID',
				key: value,
				name: label,
				type: 'EQUALS',
				system: 'diagnosis',
				values: [{ name: value, value: 'true', queryBindId: 'Auch eine random UUID' }]
			};
		}

		console.log('QUERY ITEM TO ADD', queryItem);
		if (!queryItem) return;
		addItem(queryItem);
		reloadOnly();
	}

	const addItem = (queryObject: any): void => {
		if (!lensReady || !dataPasser) return;
		console.log('QUERY OBJECT TO ADD', queryObject);
		dataPasser.addStratifierToQueryAPI({
			label: queryObject.values[0].value,
			catalogueGroupCode: queryObject.key,
			parentGroupCode: queryObject.system
		});
		console.log(dataPasser.getQueryAPI());
	};

	// ----------------------- NEU: DKH Kategorien -----------------------
	type DkhCategory = {
		id: string;
		label: string; // sichtbarer Text im Menü
		icd: string[]; // ein oder mehrere ICD-10 Codes
		age?: { min: number; max: number }; // optional
	};

	const DKH_CATEGORIES: Record<string, DkhCategory> = {
		hn_stomapharynx: {
			id: 'hn_stomapharynx',
			label: 'Kopf-Hals · Stoma/Pharynx (C00-C14)',
			icd: [
				'C00',
				'C01',
				'C02',
				'C03',
				'C04',
				'C05',
				'C06',
				'C07',
				'C08',
				'C09',
				'C10',
				'C11',
				'C12',
				'C13',
				'C14'
			]
		},
		hn_larynx: { id: 'hn_larynx', label: 'Kopf-Hals · Larynx (C32)', icd: ['C32'] },
		ugi_esophagus: {
			id: 'ugi_esophagus',
			label: 'Oberer GI-Trakt · Ösophagus (C15)',
			icd: ['C15']
		},
		ugi_stomach: { id: 'ugi_stomach', label: 'Oberer GI-Trakt · Magen (C16)', icd: ['C16'] },
		intestine: { id: 'intestine', label: 'Darm (C18-C21)', icd: ['C18', 'C19', 'C20', 'C21'] },
		liver: { id: 'liver', label: 'Leber (C22)', icd: ['C22'] },
		gallbladder: {
			id: 'gallbladder',
			label: 'Gallenblase/Gallenwege (C23-C24)',
			icd: ['C23', 'C24']
		},
		pancreas: { id: 'pancreas', label: 'Pankreas (C25)', icd: ['C25'] },
		lung: { id: 'lung', label: 'Lunge (C33-C34)', icd: ['C33', 'C34'] },
		melanoma: { id: 'melanoma', label: 'Malignes Melanom der Haut (C43)', icd: ['C43'] },
		bone_soft_tissue: {
			id: 'bone_soft_tissue',
			label: 'Knochen/Knorpel/Binde- & Weichgewebe (C40-C41, C45-C49)',
			icd: ['C40', 'C41', 'C45', 'C46', 'C47', 'C48', 'C49']
		},
		dcis: { id: 'dcis', label: 'DCIS (D05)', icd: ['D05'] },
		breast: { id: 'breast', label: 'Brust (C50)', icd: ['C50'] },
		vulva: { id: 'vulva', label: 'Vulva (C51)', icd: ['C51'] },
		cervix: { id: 'cervix', label: 'Cervix (C53)', icd: ['C53'] },
		uterus: { id: 'uterus', label: 'Uterus (C54-C55)', icd: ['C54', 'C55'] },
		ovary: { id: 'ovary', label: 'Ovar (C56)', icd: ['C56'] },
		prostate: { id: 'prostate', label: 'Prostata (C61)', icd: ['C61'] },
		testis: { id: 'testis', label: 'Hoden (C62)', icd: ['C62'] },
		kidney: { id: 'kidney', label: 'Niere (C64)', icd: ['C64'] },
		urinary_bladder: { id: 'urinary_bladder', label: 'Harnblase (C67)', icd: ['C67'] },
		cns: { id: 'cns', label: 'Zentrales Nervensystem (C70-C72)', icd: ['C70', 'C71', 'C72'] },
		thyroid: { id: 'thyroid', label: 'Schilddrüse (C73)', icd: ['C73'] },
		hodgkin: { id: 'hodgkin', label: 'Morbus Hodgkin (C81)', icd: ['C81'] },
		nhl: { id: 'nhl', label: 'Non-Hodgkin Lymphome (C82-C85)', icd: ['C82', 'C83', 'C84', 'C85'] },
		plasmocytoma: { id: 'plasmocytoma', label: 'Plasmozytom (C90)', icd: ['C90'] },
		leukemias: {
			id: 'leukemias',
			label: 'Leukämien (C91-C95)',
			icd: ['C91', 'C92', 'C93', 'C94', 'C95']
		},
		other_hematologic: {
			id: 'other_hematologic',
			label: 'Sonstige hämatologische Neoplasien (C86-C88, C96)',
			icd: ['C86', 'C87', 'C88', 'C96']
		},
		skin_other_malignant: {
			id: 'skin_other_malignant',
			label: 'Andere bösartige Neubildungen der Haut (C44)',
			icd: ['C44']
		},
		pediatric_all: {
			id: 'pediatric_all',
			label: 'Pädiatrische Tumoren (<18)',
			icd: [],
			age: { min: 0, max: 17 }
		}
	};

	// Helper: ICD-Stratifizierer anlegen
	function addICD(icdCode: string) {
		const queryItem = {
			id: '-',
			key: 'ICD_ICD10_3',
			name: 'ICD-10',
			type: 'EQUALS',
			system: 'diagnosis',
			values: [{ name: 'icd10', value: icdCode, queryBindId: '-' }]
		};
		addItem(queryItem);
	}

	// Helper: Altersrange-Stratifizierer (inklusive)

	// Klick-Handler für DKH
	function selectDKH(id: string) {
		if (!lensReady || !dataPasser) return;
		const cat = DKH_CATEGORIES[id as string];
		selectedCatalog = { value: id as string, label: cat.label };

		// ICDs hinzufügen (bei Uterus z.B. C54 ODER C55 => zwei Items)
		cat.icd.forEach(addICD);

		// Altersgruppe hinzufügen
		if (cat.age) {
			dataPasser.setQueryStoreFromAstAPI(
				addNumberInterval(
					Number(cat.age.min),
					Number(cat.age.max),
					dataPasser.getAstAPI(),
					'diagnosis', // z. B. "diagnosis" / "tnm"
					'ageAtDiagnosis' // z. B. "ageAtDiagnosis" / "tumorID"
				) as Parameters<LensDataPasser['setQueryStoreFromAstAPI']>[0]
			);
			reloadOnly();
		}
	}
	// --------------------- ENDE: DKH Kategorien -----------------------
</script>

<lens-data-passer bind:this={dataPasser} />

<div class="quicktool-label-container">
    <b>{$t("QuicktoolsCatalogues.predefinedCatalogues")}:</b>
    <button class="iconRoundButton tooltip">
        <span class="tooltiptext" style="transform: translateY(-200px);">{@html $t("tooltip_QuicktoolsCatalogues")}</span>
        <img src={infoIcon} alt="info" class="iconRound" />
    </button>
</div>

<div class="dropdown-container">
    <div class="hdropdown">
        <div class="menu catalogue">
            <ul>
                <li >
                    <font class ="placeholder">{selectedCatalog.label}</font>
                    <select class="carret-decoration"></select>
                    <ul>
                        <li>
                            {$t("onkozertOrganClassification")}
                            <ul>
                                <li>
                                    Kopf-Hals
                                    <ul>
                                        <li class="link"><button on:click={() => selectCatalog("oz_khtGesamt", "Kopf-Hals gesamt")}>Gesamt</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_khtMundhoehle", "Kopf-Hals · Mundhöhle")}>Mundhöhle</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_khtNasenhauptUndNebenhoehlen", "Kopf-Hals · Nasenhaupt & Nebenhöhlen")}>Nasenhaupt & Nebenhöhlen</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_khtRachen", "Kopf-Hals · Rachen")}>Rachen</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_khtLarynx", "Kopf-Hals · Larynx")}>Larynx</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_khtSpeicheldruesen", "Kopf-Hals · Speicheldrüsen")}>Speicheldrüsen</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_khtSonstige", "Kopf-Hals · sonstige")}>Sonstige</button></li>
                                    </ul>
                                </li>
                                <li>
                                    Viszeral
                                    <ul>
                                        <li class="link"><button on:click={() => selectCatalog("oz_viszeralzentrum", "Viszeralzentrum")}>Gesamt</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_viszeralMagen", "Viszeral · Magen")}>Magen</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_viszeralSpeiseroehre", "Viszeral · Speiseröhre")}>Speiseröhre</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_viszeralDarm", "Viszeral · Darm")}>Darm</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_viszeralPankreas", "Viszeral · Pankreas")}>Pankreas</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_viszeralHcc", "Viszeral · HCC")}>HCC</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_viszeralBiliaer", "Viszeral · biliär")}>Biliär</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_viszeralAnal", "Viszeral · Anal")}>Anal</button></li>
                                    </ul>
                                </li>
                                <li>
                                    Gynäkologie
                                    <ul>
                                        <li class="link"><button on:click={() => selectCatalog("oz_gynGesamt", "Gyn · gesamt")}>Gesamt</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_gynCervix", "Gyn · Cervix")}>Cervix</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_gynOvarium", "Gyn · Ovarium")}>Ovarium</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_gynTube", "Gyn · Tube")}>Tube</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_gynPeritoneal", "Gyn · Peritoneal")}>Peritoneal</button></li>
                                    </ul>
                                </li>
                                <li>
                                    Uroonkologie
                                    <ul>
                                        <li class="link"><button on:click={() => selectCatalog("oz_uroGesamt", "Uro · gesamt")}>Gesamt</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_uroProstata", "Uro · Prostata")}>Prostata</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_uroNiere", "Uro · Niere")}>Niere</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_uroHarnblase", "Uro · Harnblase")}>Harnblase</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_uroHoden", "Uro · Hoden")}>Hoden</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_uroPenis", "Uro · Penis")}>Penis</button></li>
                                    </ul>
                                </li>
                                <li>
                                    Hämatologie
                                    <ul>
                                        <li class="link"><button on:click={() => selectCatalog("oz_haemGesamt", "Hämatologie · gesamt")}>Gesamt</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_haemAkut", "Akute Leukämien & Burkitt")}>Akute Leukämien & Burkitt</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_haemLymphPlasma", "Lymphome & Plasmazellneoplasien")}>Lymphome & Plasmazellneoplasien</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_haemMdsMpn", "MDS/MPN")}>MDS/MPN</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_haemSonstige", "Sonstige")}>Sonstige</button></li>
                                    </ul>
                                </li>
                                <li>
                                    Sarkome
                                    <ul>
                                        <li class="link"><button on:click={() => selectCatalog("oz_sarcomaGesamt", "Sarkome · gesamt")}>Gesamt</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_sarcomaWeichgewebe", "Sarkome · Weichgewebe")}>Weichgewebe</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_sarcomaKnochen", "Sarkome · Knochen")}>Knochen</button></li>
                                        <li class="link"><button on:click={() => selectCatalog("oz_sarcomaGist", "Sarkome · GIST")}>GIST</button></li>
                                    </ul>
                                </li>
                                <li class="link"><button on:click={() => selectCatalog("oz_hautGesamt", "Haut")}>Haut</button></li>
                                <li class="link"><button on:click={() => selectCatalog("oz_breast", "Brust")}>Brust</button></li>
                                <li class="link"><button on:click={() => selectCatalog("oz_lung", "Lunge")}>Lunge</button></li>
                                <li class="link"><button on:click={() => selectCatalog("oz_mesotheliom", "Mesotheliom")}>Mesotheliom</button></li>
                            </ul>
                        </li>



                        <!-- NEU: DKH Kategorien -->
                        <li>
                            DKH (Appendix 4 - 9th Call)
                            <ul class="dkh-list">
        {#each Object.values(DKH_CATEGORIES) as cat}
          <li class="link"><button on:click={() => selectDKH(cat.id)}>{cat.label}</button></li>
        {/each}
      </ul>
                        </li>
                                               <li>
                            SCLC/NSCLC
                            <ul>
                                <li class="link"><button on:click={() => selectCatalog("sclc", "SCLC")}>SCLC</button></li>
                                <li class="link"><button on:click={() => selectCatalog("nsclc", "NSCLC")}>NSCLC</button></li>
                            </ul>
                        </li>
                                    <li class="link">
                              <button on:click={() => selectCatalog("euracan", $t("rareCancers"))}>
                                {$t("rareCancers")} (SEER, 2020)
                            </button>
                        </li>
                        <li class="link">
                            <button on:click={() => selectCatalog("enets", "ENETS GEPNET")}>
                                <font color="gray">ENETS GEPNET (TODO)</font>
                            </button>
                        </li>

                        <li>
                            <font color="gray">Lokale Organisationseinheit (TODO)</font>
                            <ul>
                                <li class="link disabled"><button on:click={() => selectCatalog("organisationBrust", "Brustzentrum")}>Brustzentrum</button></li>
                                <li class="link disabled"><button on:click={() => selectCatalog("organisationDarm", "Darmzentrum")}>Darmzentrum</button></li>
                            </ul>
                        </li>
                        <li>
                            <font color="gray">Altersgruppen (TODO)</font>
                            <ul>
                                <li class="link disabled"><button on:click={() => selectCatalog("agegroupsYoung", "0-18")}>0-18</button></li>
                                <li class="link disabled"><button on:click={() => selectCatalog("agegroupsRest", "Rest")}>Rest</button></li>
                            </ul>
                        </li>

                    </ul>
                </li>
            </ul>
        </div>
    </div>
</div>

<style>
    .link.disabled button {
        opacity: 0.5;
        pointer-events: none;
        cursor: not-allowed;
    }
    .placeholder {
        font-style: italic;
        color: gray;
    }
    .dkh-list {
        max-height: 250px;   /* maximale Höhe */
        overflow-y: auto;    /* Scrollbar bei Bedarf */
        padding: 0;
        margin: 0;
        list-style: none;    /* optional, je nach gewünschtem Look */
    }

</style>
