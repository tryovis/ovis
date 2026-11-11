<script lang="ts">
    const uploadIcon = iconPath('upload-icon.svg');
    const infoIcon = iconPath('info-outlined.svg');

    import { t } from "../../store/languageStore";
    import * as XLSX from "xlsx";
    import type { LensDataPasser } from "@samply/lens";
    import { onDestroy, onMount } from 'svelte';
    import { reloadOnly } from '../../store/reloadStore.js';
    import { showToast } from '../../store/toastStore';
    import { iconPath } from '$lib/path-utils';
    import { looksLikeHeader, normalizeIdToken, parseIdsFromPasteEvent, parseIdsFromText } from './patientImport';

    import { addPatIDs } from './../extendedAstFunctions';
    import { resolvePatientImportIds } from '../../graphQl/gql-patient-cohort';

    let dataPasser: LensDataPasser;
    let importing = false;
    let mounted = true;
    onDestroy(() => { mounted = false; });

    const parseIdsFromXlsx = (binary: string) => {
        const workbook = XLSX.read(binary, { type: "binary" });
        const firstSheetName = workbook.SheetNames[0];
        const firstSheet = workbook.Sheets[firstSheetName];
        const sheetData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        const idsRaw: string[] = [];

        for (const row of sheetData as Array<Array<unknown>>) {
            const token = row?.[0];
            const id = normalizeIdToken(token);
            if (!id || looksLikeHeader(id)) continue;
            idsRaw.push(id);
        }

        return idsRaw;
    };

    const applyPatIdsToAst = async (idsRaw: readonly string[]) => {
        if (!idsRaw.length || importing) return;
        importing = true;
        try {
            const ids = [...new Set(idsRaw)];
            const matches = await resolvePatientImportIds(ids);
            if (!mounted) return;
            const canonical = new Map(ids.map((id, index) => [id, matches[index]]));
            const validIds = [...new Set(matches.filter((id): id is string => id !== null))];
            const importedRows = idsRaw.filter((id) => canonical.get(id) != null).length;
            if (validIds.length) {
                const nextAst = addPatIDs(validIds, dataPasser.getAstAPI()) as Parameters<LensDataPasser['setQueryStoreFromAstAPI']>[0];
                dataPasser.setQueryStoreFromAstAPI(nextAst);
                reloadOnly();
            }
            showToast(`Patientenimport: ${idsRaw.length} IDs geprüft – ${importedRows} übernommen, ${idsRaw.length - importedRows} unbekannt oder mehrdeutig.`);
        } catch {
            if (mounted) showToast('Patientenimport fehlgeschlagen. Bitte erneut versuchen.');
        } finally {
            importing = false;
        }
    };

    const handlePaste = (event: ClipboardEvent) => {
        const parsed = parseIdsFromPasteEvent(event);
        if (!parsed) return;
        void applyPatIdsToAst(parsed.idsRaw);
    };

    function uploadCohort(event: Event) {
        const target = event.currentTarget as HTMLInputElement | null;
        const file = target?.files?.[0];
        if (!target || !file) return;
        target.value = '';

        const reader = new FileReader();
        reader.onload = function (e: ProgressEvent<FileReader>) {
            try {
                const fileContent = e.target?.result;
                const ext = (file.name.split('.').pop() || "").toLowerCase();

                if (ext === "csv" || ext === "txt") {
                    const parsed = parseIdsFromText(String(fileContent ?? ""));
                    void applyPatIdsToAst(parsed.idsRaw);
                    return;
                }

                if (ext === "xlsx") {
                    void applyPatIdsToAst(parseIdsFromXlsx(String(fileContent ?? "")));
                    return;
                }

                console.error("Unsupported file format.");
            } catch (error) {
                console.error("Error processing file:", error);
            }
        };

        if (file.name.toLowerCase().endsWith(".xlsx")) reader.readAsBinaryString(file);
        else reader.readAsText(file);
    }

    onMount(async () => {
        await import("@samply/lens");
    });
</script>

<lens-data-passer bind:this={dataPasser} />
<div class="quicktool-label-container">
    <b>{$t("patientSearch")} / Import:</b>
    <div>
        <label class="iconRoundButton tooltip">
            <span class="tooltiptext">{"Patientenkohorte als CSV, TXT oder Excel hochladen"}</span>
            <input type="file" accept=".csv,.txt,.xlsx" on:change={uploadCohort} disabled={importing} style="display: none;" />
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
    disabled={importing}
/>

<style>
    /* Komischerweise fehlt der Abstand zum Container rand wenn ich auf 100% belasse */
    .search-input {
        width: 95%;
    }

    .quicktool-label-container {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        flex-wrap: nowrap;
    }

    .quicktool-label-container > b {
        white-space: nowrap;
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
