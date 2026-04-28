export const ozRules = [
  // -------------------------
  // Brust
  // -------------------------
  { entity: "breast", ICD_ICD10_3: "C50" },

  // -------------------------
  // Viszeralonkologisch
  // -------------------------
  // HCC
  { entity: "viszeralHcc", ICD_ICD10: "C22.0" },
  // Biliäre (intrahepatisch + Gallenblase)
  { entity: "viszeralBiliaer", ICD_ICD10: "C22.1" },
  { entity: "viszeralBiliaer", ICD_ICD10_3: "C23" },
  // Darm (Colon + Rectum)
  { entity: "viszeralDarm", ICD_ICD10_3: "C18" },
  { entity: "viszeralDarm", ICD_ICD10_3: "C20" },
  // Magen
  { entity: "viszeralMagen", ICD_ICD10_3: "C16" },
  // Speiseröhre
  { entity: "viszeralSpeiseroehre", ICD_ICD10: "C16.0", supplementary: "siewert", suppStatus: "I" },
  { entity: "viszeralSpeiseroehre", ICD_ICD10: "C16.0", supplementary: "siewert", suppStatus: "II" },
  { entity: "viszeralSpeiseroehre", ICD_ICD10_3: "C15" },
  // Anal (konkret genannt: C21.1 und C44.50)
  { entity: "viszeralAnal", ICD_ICD10: "C21.1" },
  { entity: "viszeralAnal", ICD_ICD10: "C44.50" },
  // Pankreas
  { entity: "viszeralPankreas", ICD_ICD10_3: "C25" },

  // Viszeralzentrum (Aggregation)
  { entity: "viszeralzentrum", ICD_ICD10: "C22.0" },
  { entity: "viszeralzentrum", ICD_ICD10: "C22.1" },
  { entity: "viszeralzentrum", ICD_ICD10_3: "C23" },
  { entity: "viszeralzentrum", ICD_ICD10_3: "C18" },
  { entity: "viszeralzentrum", ICD_ICD10_3: "C20" },
  { entity: "viszeralzentrum", ICD_ICD10_3: "C16" },
  { entity: "viszeralzentrum", ICD_ICD10_3: "C15" },
  { entity: "viszeralzentrum", ICD_ICD10: "C21.1" },
  { entity: "viszeralzentrum", ICD_ICD10: "C44.50" },
  { entity: "viszeralzentrum", ICD_ICD10_3: "C25" },

  // -------------------------
  // Gynäkologie
  // -------------------------
  { entity: "gynCervix", ICD_ICD10_3: "C53" },
  { entity: "gynOvarium", ICD_ICD10_3: "C56" },
  { entity: "gynTube", ICD_ICD10: "C57.0" },
  { entity: "gynPeritoneal", ICD_ICD10: "C48.1" },
  { entity: "gynPeritoneal", ICD_ICD10: "C48.2" },
  // Gesamt
  { entity: "gynGesamt", ICD_ICD10_3: "C53" },
  { entity: "gynGesamt", ICD_ICD10_3: "C56" },
  { entity: "gynGesamt", ICD_ICD10: "C57.0" },
  { entity: "gynGesamt", ICD_ICD10: "C48.1" },
  { entity: "gynGesamt", ICD_ICD10: "C48.2" },

  // -------------------------
  // Uroonkologische Zentren
  // -------------------------
  { entity: "uroProstata", ICD_ICD10_3: "C61" },
  { entity: "uroNiere", ICD_ICD10_3: "C64" },
  { entity: "uroHarnblase", ICD_ICD10_3: "C67" },
  { entity: "uroHoden", ICD_ICD10_3: "C62" },
  { entity: "uroPenis", ICD_ICD10_3: "C60" },
  // Gesamt (+ Nierenbecken/Ureter/Urethra)
  { entity: "uroGesamt", ICD_ICD10_3: "C60" },
  { entity: "uroGesamt", ICD_ICD10_3: "C61" },
  { entity: "uroGesamt", ICD_ICD10_3: "C62" },
  { entity: "uroGesamt", ICD_ICD10_3: "C64" },
  { entity: "uroGesamt", ICD_ICD10_3: "C65" },
  { entity: "uroGesamt", ICD_ICD10_3: "C66" },
  { entity: "uroGesamt", ICD_ICD10_3: "C67" },
  { entity: "uroGesamt", ICD_ICD10: "C68.0" },

  // -------------------------
  // Haut gesamt
  // -------------------------
  { entity: "hautGesamt", ICD_ICD10_3: "C43" },
  { entity: "hautGesamt", ICD_ICD10_3: "C44" },

  // -------------------------
  // KHT (Kopf-Hals-Tumoren) – Splits
  // -------------------------
  // Mundhöhle
  { entity: "khtMundhoehle", ICD_ICD10_3: "C00" },
  { entity: "khtMundhoehle", ICD_ICD10_3: "C01" },
  { entity: "khtMundhoehle", ICD_ICD10_3: "C02" },
  { entity: "khtMundhoehle", ICD_ICD10_3: "C03" },
  { entity: "khtMundhoehle", ICD_ICD10_3: "C04" },
  { entity: "khtMundhoehle", ICD_ICD10_3: "C05" },
  { entity: "khtMundhoehle", ICD_ICD10_3: "C06" },
  // Nasenhaupt- und Nasennebenhöhle
  { entity: "khtNasenhauptUndNebenhoehlen", ICD_ICD10_3: "C30" },
  { entity: "khtNasenhauptUndNebenhoehlen", ICD_ICD10_3: "C31" },
  // Rachen
  { entity: "khtRachen", ICD_ICD10_3: "C09" },
  { entity: "khtRachen", ICD_ICD10_3: "C10" },
  { entity: "khtRachen", ICD_ICD10_3: "C11" },
  { entity: "khtRachen", ICD_ICD10_3: "C12" },
  { entity: "khtRachen", ICD_ICD10_3: "C13" },
  { entity: "khtRachen", ICD_ICD10_3: "C14" },
  // Larynx
  { entity: "khtLarynx", ICD_ICD10_3: "C32" },
  // Speicheldrüsen
  { entity: "khtSpeicheldruesen", ICD_ICD10_3: "C07" },
  { entity: "khtSpeicheldruesen", ICD_ICD10_3: "C08" },
  // Sonstige
  { entity: "khtSonstige", ICD_ICD10: "C30.1" },
  { entity: "khtSonstige", ICD_ICD10: "C14.0" },
  { entity: "khtSonstige", ICD_ICD10: "C14.2" },
  { entity: "khtSonstige", ICD_ICD10: "C14.8" },
  // KHT gesamt
  { entity: "khtGesamt", ICD_ICD10_3: "C00" }, { entity: "khtGesamt", ICD_ICD10_3: "C01" },
  { entity: "khtGesamt", ICD_ICD10_3: "C02" }, { entity: "khtGesamt", ICD_ICD10_3: "C03" },
  { entity: "khtGesamt", ICD_ICD10_3: "C04" }, { entity: "khtGesamt", ICD_ICD10_3: "C05" },
  { entity: "khtGesamt", ICD_ICD10_3: "C06" }, { entity: "khtGesamt", ICD_ICD10_3: "C07" },
  { entity: "khtGesamt", ICD_ICD10_3: "C08" }, { entity: "khtGesamt", ICD_ICD10_3: "C09" },
  { entity: "khtGesamt", ICD_ICD10_3: "C10" }, { entity: "khtGesamt", ICD_ICD10_3: "C11" },
  { entity: "khtGesamt", ICD_ICD10_3: "C12" }, { entity: "khtGesamt", ICD_ICD10_3: "C13" },
  { entity: "khtGesamt", ICD_ICD10_3: "C14" }, { entity: "khtGesamt", ICD_ICD10_3: "C30" },
  { entity: "khtGesamt", ICD_ICD10_3: "C31" }, { entity: "khtGesamt", ICD_ICD10_3: "C32" },
  { entity: "khtGesamt", ICD_ICD10: "C30.1" }, { entity: "khtGesamt", ICD_ICD10: "C14.0" },
  { entity: "khtGesamt", ICD_ICD10: "C14.2" }, { entity: "khtGesamt", ICD_ICD10: "C14.8" },

  // -------------------------
  // Lunge, Mesotheliom, Schilddrüse
  // -------------------------
  { entity: "lung", ICD_ICD10_3: "C34" },
  { entity: "mesotheliom", ICD_ICD10_3: "C45" },
  { entity: "thyroid", ICD_ICD10_3: "C73" },

  // -------------------------
  // Hämatologie – Splits
  // -------------------------
  // A) Akute Leukämien & Burkitt
  { entity: "haemAkut", ICD_ICD10: "C91.0" }, // ALL
  { entity: "haemAkut", ICD_ICD10: "C83.5" }, // lymphoblastisches Lymphom
  { entity: "haemAkut", ICD_ICD10: "C91.8" }, // Burkitt-ALL
  { entity: "haemAkut", ICD_ICD10: "C83.7" }, // Burkitt-Lymphom
  { entity: "haemAkut", ICD_ICD10: "C92.0" }, // AML
  { entity: "haemAkut", ICD_ICD10: "C92.3" }, // Myelosarkom
  { entity: "haemAkut", ICD_ICD10: "C92.4" }, // APL
  { entity: "haemAkut", ICD_ICD10: "C92.5" }, // AMML
  { entity: "haemAkut", ICD_ICD10: "C92.6" }, // AML mit 11q23
  { entity: "haemAkut", ICD_ICD10: "C92.8" }, // AML multilineär dysplastisch
  { entity: "haemAkut", ICD_ICD10: "C93.0" }, // akute Monozytenleuk.
  { entity: "haemAkut", ICD_ICD10: "C94.0" }, // akute Erythro.
  { entity: "haemAkut", ICD_ICD10: "C94.2" }, // akute Megakaryoblastenleuk.
  { entity: "haemAkut", ICD_ICD10: "C94.3" }, // Mastzellenleuk.
  { entity: "haemAkut", ICD_ICD10: "C94.4" }, // akute Panmyelose
  { entity: "haemAkut", ICD_ICD10: "C94.7" }, // sonst. näher bez. Leuk.
  { entity: "haemAkut", ICD_ICD10: "C94.8" }, // Blastenkrise bei CML
  { entity: "haemAkut", ICD_ICD10: "C95.0" }, // akute Leuk. o.n.A.

  // B) Lymphome & Plasmazellneoplasien
  { entity: "haemLymphPlasma", ICD_ICD10_3: "C81" },
  { entity: "haemLymphPlasma", ICD_ICD10_3: "C82" },
  { entity: "haemLymphPlasma", ICD_ICD10_3: "C83" },
  { entity: "haemLymphPlasma", ICD_ICD10_3: "C84" },
  { entity: "haemLymphPlasma", ICD_ICD10_3: "C85" },
  { entity: "haemLymphPlasma", ICD_ICD10_3: "C86" },
  { entity: "haemLymphPlasma", ICD_ICD10_3: "C88" },
  { entity: "haemLymphPlasma", ICD_ICD10_3: "C90" },
  { entity: "haemLymphPlasma", ICD_ICD10: "C91.1" },
  { entity: "haemLymphPlasma", ICD_ICD10: "C91.3" },
  { entity: "haemLymphPlasma", ICD_ICD10: "C91.4" },
  { entity: "haemLymphPlasma", ICD_ICD10: "C91.5" },
  { entity: "haemLymphPlasma", ICD_ICD10: "C91.6" },
  { entity: "haemLymphPlasma", ICD_ICD10: "C91.7" },
  { entity: "haemLymphPlasma", ICD_ICD10: "C91.9" },

  // C) MDS / MPN
  { entity: "haemMdsMpn", ICD_ICD10: "C92.1" }, // CML BCR/ABL+
  { entity: "haemMdsMpn", ICD_ICD10: "D45" },
  { entity: "haemMdsMpn", ICD_ICD10: "D47.1" },
  { entity: "haemMdsMpn", ICD_ICD10: "D47.3" },
  { entity: "haemMdsMpn", ICD_ICD10: "D47.4" },
  { entity: "haemMdsMpn", ICD_ICD10: "D47.5" },
  { entity: "haemMdsMpn", ICD_ICD10_3: "D46" },
  { entity: "haemMdsMpn", ICD_ICD10: "C92.2" },
  { entity: "haemMdsMpn", ICD_ICD10: "C93.1" },
  { entity: "haemMdsMpn", ICD_ICD10: "C93.3" },
  { entity: "haemMdsMpn", ICD_ICD10: "C93.7" },
  { entity: "haemMdsMpn", ICD_ICD10: "C93.9" },
  { entity: "haemMdsMpn", ICD_ICD10: "C94.6" },

  // D) Sonstige
  { entity: "haemSonstige", ICD_ICD10: "C92.7" },
  { entity: "haemSonstige", ICD_ICD10: "C92.9" },
  { entity: "haemSonstige", ICD_ICD10: "C95.1" },
  { entity: "haemSonstige", ICD_ICD10: "C95.7" },
  { entity: "haemSonstige", ICD_ICD10: "C95.9" },
  { entity: "haemSonstige", ICD_ICD10_3: "C96" },
  { entity: "haemSonstige", ICD_ICD10: "D47.7" },
  { entity: "haemSonstige", ICD_ICD10: "D47.9" },

  // Hämatologie gesamt (Aggregation)
  { entity: "haemGesamt", ICD_ICD10_3: "C81" }, { entity: "haemGesamt", ICD_ICD10_3: "C82" },
  { entity: "haemGesamt", ICD_ICD10_3: "C83" }, { entity: "haemGesamt", ICD_ICD10_3: "C84" },
  { entity: "haemGesamt", ICD_ICD10_3: "C85" }, { entity: "haemGesamt", ICD_ICD10_3: "C86" },
  { entity: "haemGesamt", ICD_ICD10_3: "C88" }, { entity: "haemGesamt", ICD_ICD10_3: "C90" },
  { entity: "haemGesamt", ICD_ICD10_3: "C91" }, { entity: "haemGesamt", ICD_ICD10_3: "C92" },
  { entity: "haemGesamt", ICD_ICD10_3: "C93" }, { entity: "haemGesamt", ICD_ICD10_3: "C94" },
  { entity: "haemGesamt", ICD_ICD10_3: "C95" }, { entity: "haemGesamt", ICD_ICD10_3: "C96" },
  { entity: "haemGesamt", ICD_ICD10_3: "D46" },
  { entity: "haemGesamt", ICD_ICD10: "C92.1" },
  { entity: "haemGesamt", ICD_ICD10: "D45" },
  { entity: "haemGesamt", ICD_ICD10: "D47.1" },
  { entity: "haemGesamt", ICD_ICD10: "D47.3" },
  { entity: "haemGesamt", ICD_ICD10: "D47.4" },
  { entity: "haemGesamt", ICD_ICD10: "D47.5" },
  { entity: "haemGesamt", ICD_ICD10: "D47.7" },
  { entity: "haemGesamt", ICD_ICD10: "D47.9" },
  // -------------------------
  // Sarkome – Splits & gesamt (ICDO WITH '/3')
  // -------------------------
  // Weichgewebe (maligne /3)
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8800/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8801/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8802/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8803/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8804/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8805/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8806/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8810/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8811/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8814/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8815/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8830/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8831/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8832/3" }, // DFSP fibrosarkomatös
  // { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8833/3" }, // meist /1; nur aufnehmen wenn sicher /3 kodiert
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8850/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8852/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8853/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8854/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8858/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8859/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8890/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8891/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8896/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8900/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8901/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8910/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8912/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8920/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "9040/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "9041/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "9043/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "9044/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "9120/3" },
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "9130/3" }, // malignes Hämangioendotheliom
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "9133/3" }, // EHE
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "9140/3" }, // Kaposi
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "8990/3" }, // malignes Mesenchymom
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "9580/3" }, // maligner Granularzelltumor
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "9581/3" }, // ASPS
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "9540/3" }, // MPNST
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "9542/3" }, // epithelioider MPNST
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "9561/3" }, // maligner Triton-Tumor
  { entity: "sarcomaWeichgewebe", ICDO_histologyCode: "9137/3" }, // Intimasarkom (WHO neu)

  // Knochen (maligne /3)
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9180/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9181/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9182/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9183/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9184/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9185/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9187/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9192/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9193/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9194/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9220/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9221/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9222/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9231/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9240/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9242/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9243/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9250/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9261/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9370/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9371/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9372/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9364/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9366/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9367/3" },
  { entity: "sarcomaKnochen", ICDO_histologyCode: "9368/3" },

  // GIST (maligne /3)
  { entity: "sarcomaGist", ICDO_histologyCode: "8936/3" },
  { entity: "sarcomaGist", ICDO_histologyCode: "8935/3" },

  // Sarcoma gesamt (Aggregation; alle maligne /3)
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8800/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8801/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8802/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8803/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8804/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8805/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8806/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8810/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8811/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8814/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8815/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8830/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8831/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8832/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8850/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8852/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8853/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8854/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8858/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8859/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8890/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8891/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8896/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8900/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8901/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8910/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8912/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8920/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9040/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9041/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9043/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9044/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9120/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9130/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9133/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9140/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8990/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9580/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9581/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9540/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9542/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9561/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9137/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9180/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9181/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9182/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9183/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9184/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9185/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9187/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9192/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9193/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9194/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9220/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9221/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9222/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9231/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9240/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9242/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9243/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9250/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9261/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9370/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9371/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9372/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9364/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9366/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9367/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "9368/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8936/3" },
  { entity: "sarcomaGesamt", ICDO_histologyCode: "8935/3" },
];
