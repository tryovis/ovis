<script lang="ts">
    const uploadIcon = iconPath('upload-icon.svg');
    const infoIcon = iconPath('info-outlined.svg');

    import { t } from "../../store/languageStore";
    import * as XLSX from "xlsx";
    import type { LensDataPasser } from "@samply/lens";
    import { onMount } from 'svelte';
    import { reloadOnly } from '../../store/reloadStore.js';
    import { showToast } from '../../store/toastStore';
    import { iconPath } from '$lib/path-utils';

    // AST helper (Pfad ggf. anpassen – du hattest ihn ja schon mal relativ geändert)
    import { addPatIDs } from './../extendedAstFunctions';

    // DB-Check (Pfad ggf. anpassen wie bei deinen anderen gql-Imports)
    import { getPatientCohortOverviewTable } from '../../graphQl/gql-patient-cohort';

    let dataPasser: LensDataPasser;

    // --- OVis patient index (patID -> exists) ---
    let patientIdIndex: Set<string> | null = null;
    // Special case mapping: allow matching imports without leading zeros to DB patIDs with leading zeros.
    // Example: import "123" -> DB "000123".
    // If multiple DB IDs collapse to the same stripped value, we mark it ambiguous and won't map.
    let patientIdCanonicalByStripped: Map<string, string | null> | null = null;
    let patientIdIndexPromise: Promise<Set<string> | null> | null = null;

    const PAGE_SIZE = 2000;

    const uniq = (values: string[]) => {
        const out: string[] = [];
        const seen = new Set<string>();
        for (const v of values) {
            const s = String(v ?? "").trim();
            if (!s) continue;
            if (seen.has(s)) continue;
            seen.add(s);
            out.push(s);
        }
        return out;
    };

    const normalizeIdToken = (token: unknown) => {
        if (token == null) return "";
        if (typeof token === 'number' && Number.isFinite(token)) {
            // Excel liefert oft number -> "123.0" verhindern
            if (Number.isInteger(token)) return String(Math.trunc(token));
            return String(token);
        }
        return String(token).trim().replace(/^['"]|['"]$/g, "");
    };

    const stripLeadingZeros = (id: string) => {
        const s = String(id ?? "").trim();
        // Keep at least one character if the id is all zeros (e.g. "000" -> "0")
        const stripped = s.replace(/^0+/, "");
        return stripped.length ? stripped : (s ? "0" : "");
    };

    const looksLikeHeader = (id: string) => {
        const s = String(id ?? "").trim().toLowerCase();
        return s === 'patid' || s === 'pat_id' || s === 'patientid' || s === 'patient_id';
    };

    const ensurePatientIdIndex = async () => {
        if (patientIdIndex) return patientIdIndex;
        if (!patientIdIndexPromise) {
            patientIdIndexPromise = (async () => {
                try {
                    const set = new Set<string>();
                    const canonicalMap = new Map<string, string | null>();
                    let continueFromID: string | undefined | null = null;
                    let hasMoreRows = true;

                    while (hasMoreRows) {
                        const rows = await getPatientCohortOverviewTable(continueFromID, PAGE_SIZE, null);
                        if (!Array.isArray(rows) || rows.length === 0) {
                            hasMoreRows = false;
                            continue;
                        }

                        for (const r of rows) {
                            const id = String(r?.patID ?? "").trim();
                            if (id) {
                                set.add(id);

                                // Build "stripped" -> canonical (DB) mapping for the special case.
                                const stripped = stripLeadingZeros(id);
                                if (stripped) {
                                    const existing = canonicalMap.get(stripped);
                                    if (existing === undefined) canonicalMap.set(stripped, id);
                                    else if (existing !== id) canonicalMap.set(stripped, null); // ambiguous
                                }
                            }
                        }

                        if (rows.length < PAGE_SIZE) {
                            hasMoreRows = false;
                            continue;
                        }

                        continueFromID = rows[rows.length - 1]?._id;
                        if (!continueFromID) hasMoreRows = false;
                    }

                    patientIdIndex = set;
                    patientIdCanonicalByStripped = canonicalMap;
                    return set;
                } catch (e) {
                    console.warn('Could not preload patientIdIndex – importing without DB check.', e);
                    patientIdIndex = null;
                    patientIdCanonicalByStripped = null;
                    return null;
                }
            })();
        }
        return await patientIdIndexPromise;
    };

    const parseIdsFromText = (text: string) => {
        // 1 Zeile pro ID, 1. Spalte wins (Komma/Semikolon/Tab)
        const lines = String(text ?? "").split(/\r?\n/);
        const idsRaw: string[] = [];
        let attemptedRows = 0;

        for (const line of lines) {
            const l = line.trim();
            if (!l) continue;
            attemptedRows += 1;
            const firstCell = l.split(/[\t,;]+/)[0];
            const id = normalizeIdToken(firstCell);
            if (!id || looksLikeHeader(id)) continue;
            idsRaw.push(id);
        }

        return { idsRaw, attemptedRows };
    };

    const parseIdsFromXlsx = (binary: string) => {
        const workbook = XLSX.read(binary, { type: "binary" });
        const firstSheetName = workbook.SheetNames[0];
        const firstSheet = workbook.Sheets[firstSheetName];
        const sheetData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        const idsRaw: string[] = [];
        let attemptedRows = 0;

        for (const row of sheetData as Array<Array<unknown>>) {
            const token = row?.[0];
            const id = normalizeIdToken(token);
            if (!id || looksLikeHeader(id)) continue;
            attemptedRows += 1;
            idsRaw.push(id);
        }

        return { idsRaw, attemptedRows };
    };

    const applyPatIdsToAst = async (idsRaw: string[], attemptedRows: number) => {
        if (!attemptedRows) return;

        // DB-Check (falls Index verfügbar): pro Zeile zählen
        const index = await ensurePatientIdIndex();

        let validIdsRaw = idsRaw;
        let ignoredRows = 0;
        let importedRows = attemptedRows;

        if (index) {
            validIdsRaw = [];
            for (const id of idsRaw) {
                const idTrimmed = String(id ?? '').trim();
                if (!idTrimmed) continue;

                // Standard case (unchanged): exact match.
                if (index.has(idTrimmed)) {
                    validIdsRaw.push(idTrimmed);
                    continue;
                }

                // Special case: match import IDs that are missing leading zeros to a DB ID with leading zeros.
                // Only if the mapping is unambiguous.
                const stripped = stripLeadingZeros(idTrimmed);
                const canonical = patientIdCanonicalByStripped?.get(stripped);
                if (canonical && index.has(canonical)) {
                    validIdsRaw.push(canonical);
                    continue;
                }

                ignoredRows += 1;
            }
            importedRows = Math.max(0, attemptedRows - ignoredRows);
        } else {
            // Wenn Index nicht geladen werden konnte: wir zählen alles als "übernommen"
            ignoredRows = 0;
            importedRows = attemptedRows;
        }

        const patIdsUnique = uniq(validIdsRaw);

        if (patIdsUnique.length && dataPasser?.getAstAPI && dataPasser?.setQueryStoreFromAstAPI) {
            const currentAst = dataPasser.getAstAPI();
            const nextAst = addPatIDs(
                patIdsUnique,
                currentAst,
                'patient',
                'patID'
            ) as Parameters<LensDataPasser['setQueryStoreFromAstAPI']>[0];
            dataPasser.setQueryStoreFromAstAPI(nextAst);
            reloadOnly();
        }

        // Kurze, saubere Meldung
        showToast(`Patientenimport: ${attemptedRows} Zeilen geprüft – ${importedRows} übernommen, ${ignoredRows} ignoriert (nicht in OVis).`);
    };

    const handlePaste = (event: ClipboardEvent) => {
        const pastedText = event.clipboardData?.getData("text") || "";
        if (!pastedText) return;
        const parsed = parseIdsFromText(pastedText);
        void applyPatIdsToAst(parsed.idsRaw, parsed.attemptedRows);
    };

    function uploadCohort(event: Event) {
        const target = event.currentTarget as HTMLInputElement | null;
        const file = target?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e: ProgressEvent<FileReader>) {
            try {
                const fileContent = e.target?.result;
                const ext = (file.name.split('.').pop() || "").toLowerCase();

                if (ext === "csv" || ext === "txt") {
                    const parsed = parseIdsFromText(String(fileContent ?? ""));
                    void applyPatIdsToAst(parsed.idsRaw, parsed.attemptedRows);
                    return;
                }

                if (ext === "xlsx") {
                    const parsed = parseIdsFromXlsx(String(fileContent ?? ""));
                    void applyPatIdsToAst(parsed.idsRaw, parsed.attemptedRows);
                    return;
                }

                console.error("Unsupported file format.");
            } catch (error) {
                console.error("Error processing file:", error);
            }
        };

        if (file.name.endsWith(".xlsx")) reader.readAsBinaryString(file);
        else reader.readAsText(file);
    }

    onMount(async () => {
        await import("@samply/lens");
        // optionaler Warmup (damit der erste Import schneller ist)
        void ensurePatientIdIndex();
    });
</script>

<lens-data-passer bind:this={dataPasser} />
<div class="quicktool-label-container">
    <b>{$t("patientSearch")} / Import:</b>
    <div>
        <label class="iconRoundButton tooltip">
            <span class="tooltiptext">{"Patientenkohorte als CSV, TXT oder Excel hochladen"}</span>
            <input type="file" accept=".csv,.txt,.xlsx" on:change={uploadCohort} style="display: none;" />
            <img src={uploadIcon} alt="upload" class="iconRound" />
        </label>
        <button class="iconRoundButton tooltip" type="button">
            <span class="tooltiptext">{@html $t("tooltip_cohortUpload")}</span>
            <img src={infoIcon} alt="info" class="iconRound" />
        </button>
    </div>
</div>

<input
    class="search-input input-field"
    type="text"
    id="searchInput"
    placeholder={$t("searchForPatients")}
    on:paste={handlePaste}
/>

<style>
    /* Komischerweise fehlt der Abstand zum Container rand wenn ich auf 100% belasse */
    .search-input {
        width: 95%;
    }

    .quicktool-label-container {
        align-items: center;
    }

    .quicktool-label-container > div {
        display: flex;
        align-items: center;
        gap: 0.375rem;
    }

    .quicktool-label-container .iconRound {
        display: block;
    }
</style>
