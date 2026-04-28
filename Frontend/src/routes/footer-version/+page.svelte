<script lang="ts">
  import { t, locale } from "../../store/languageStore";
  import { slide } from "svelte/transition";
  import { onMount } from "svelte";

  type Entry = {
    version: string;
    date: string;
    title?: string;
    changes: string[];
    id?: string;       // optional stabil
    expanded?: boolean;
  };


  let entries: Entry[] = [
            {
           id: "v1.0.0",
          version: "1.0.0",
          date: "21.04.2026",
          title: "Release Patch",
          changes: [
            "Disclaimer updated",
            "Wrong augmentation of mixed tumor histologies fixed",
            "Some internal changes preparing for publicaiton"
          ],
          expanded: true
        },
        {
           id: "v0.9.8",
          version: "0.9.8",
          date: "15.04.2026",
          title: "Beta round up patch",
          changes: [
            "SVG-Maps: There were still race conditions - meaning, sometimes data loaded faster than the graphics => some elements stayed 'white'. This should be fixed now.",
            "SVG-Maps: When filters were deactivated - SVG maps threw a warning for hidden tables and the table crashed. This should be fixed now.",
            "Feedback page has been added.",
            "Known Issues page has been updated.",
            "New filter category for 'received radiological diagnostics' has been added in diagnosis bar plot.",
            "Small bug fixes for 'TNM Picker' and some of the ICD10 group descriptions.",
            "Fixed some table layouting issues for diagnosis histology",
            "Fixed text overflow issue in diagnosis body map table",
            "Fixed 2 firefox display bugs in quicktools area",
            "Added translations for data tables: molecular marker, progress, supplementary, tumorboard, consultation, status",
            "ONKOSTAR connector:Added database extraction for following values as status values: 'kastrationsresistenz,hepatomegalie,blastenkrise,splenomegalie,mrecist,klassifikationleber,hautentitaet,sarkomentitaet,biochemischesrezidiv",
            "Added column for projects in molecular marker table with examples in omock.json",
            "ONKOSTAR connector: Add information like dnpm, zpm etc. to previous column"
          ],
          expanded: false
        },
                {
           id: "v0.9.7",
          version: "0.9.7",
          date: "04.03.2026",
          title: "Study + Patient Import fixes, TNM click improvements",
          changes: [
            "Major Bugfix: When selecting a filter, study modules always filtered on studies with at least one patient in the filtering. This has been fixed and only patients in the filtered cohort will be displayed as part of the current cohort (as for the rest of the system).", 
            "KM-Variant-Overhaul: KM DFS variant has been overhauled. All texts in tooltips and definition page fixed accordingly.",
            "Minor Improvement: When importing patients - leading zeroes in patIDs can be ignored. Before - import often failed as patIDs in DB might have leading zeroes but excel lists usually remove those.",
            "Major Improvement: When clicking on TNM values, for values 1-4 you get a special UI letting you choose between exact and grouped application.",
            "Performance Fix: When loading large patient cohorts, and after that entering the filter edit mode - performance issues occured leading to page freeze. This was due to checking every individual value vor validity. Now those validty checks are only performed for the values currently rendered (max. 20 values per attribute)"
            
          ],
          expanded: false
        },
            {
           id: "v0.9.6",
          version: "0.9.6",
          date: "18.02.2026",
          title: "KM variant - Beta release",
          changes: [
            "Added stratifications for KM curves (UICC and T stage)",
            "Added the following variants (in Beta/Testing): MFS, PFS, PPS, DFS, RFS",
            "Updated the survial definition page",
            "Localized survival and survival defintion page (english / german",
            "Updated KM Tooltip to include DFS",
            "Changed KM Preprocessing time from quadratic to linear (huge preprocessing time improvement for large datasets)",
            "Improved readability and hence customization in the environment file for parameters defining values for the KM variants (e.g. which events are considered for each variant)",
           ],
          expanded: false
        },
        {
          
          id: "v0.9.5",
          version: "0.9.5",
          date: "16.12.2025",
          title: "Performance, negation and patient import fixes",
          changes: [
            "Improved performance for large patient imports: instead of building long OR chains (OR, OR, OR, ...), patient IDs are now merged into a single OR block and matched via a compact list of patIDs.",
            "Added an import summary message showing how many patients were successfully imported.",
            "Fixed an issue where very large filters could be blocked by GraphQL.",
            "Fixed a UI crash in filter edit mode for very large filter trees by paginating inner OR blocks (showing 10 conditions at a time).",
            "Fixed negation handling for empty array cases (current interpretation: an empty value means all values for a given tumorID in the array must be empty — may be revised later).",
            "Adjusted Progesterone and Estrogen handling in the supplementary section of the ONKOSTAR import."
          ],
          expanded: false
        },
        {
        id: "v0.9.4",
        version: "0.9.4",
        date: "30.10.2025",
        title: "Several fixes for array fields",
        changes: [
          "Progress with language-localization of multiple items",
          "Following Array fields are now clickable (crashed site before)",
          "OPS => fixed and clickable",
          "Substances => fixed and clickable",
          "Complications => fixed and clickable",
          "Metastasis Resections => currently not clickable but not crashing any more",
          "Surgeons => currently not clickable but not crashing any more"
        ],
        expanded: false
      }, 
    {
        id: "v0.9.3",
        version: "0.9.3",
        date: "24.10.2025",
        title: "Bug Fixes",
        changes: [
          "(Major) Bugfix: Fixed negation of date,number and empty fields.",
          "(Major) Feature: Empty values can now be applied via advanced filter editor UI.",
          "Bugfix: District now clickable via Geographic Map Table",
          "Bugfix: Bool-Filter-Editor sometimes showed an empty row without any textfields => fixed",
          "Therapy Radiation Map: Some progress with graphics => Still bad ... Much TODO",
          "Added localization for TherapyRadiationMap",
          "Fixed issue where percentage display in molecularMarkerTable was showing wrong numbers",
          "FollowUp Assessment completly reworked => Filters didn't work + wrong numbers returned.",
          "Missing OPS three digit descriptions added",
          "Bugfix: Null values were not clickable in death chart",
          "Bugfix: Null values were not clickable in date fields",
          "Fixed pediatric category in DKH catalogue"
        ],
        expanded: false
      }, 
      {
      id: "v0.9.2",
      version: "0.9.2",
      date: "13.10.2025",
      title: "Multiple fixes for SVG graphics",
      changes: [
        "Race conditions for SVG graphics mostly fixed.",
        "Opening a table belonging to a SVG graphic in combination with switching page was broken => fixed.",
        "Table descriptions in SVG graphic related tables now clickable",
        "When filters inactive, SVG button was misaligned => fixed.",
        "TherapRadiationMap now working (WIP status removed)",
        "Pressing F5 ony some ovis subdomains crashed the site => fixed"
      ],
      expanded: false
    },  
  {
      id: "v0.9.1",
      version: "0.9.1",
      date: "07.10.2025",
      title: "Pre-Release",
      changes: [
        "Pre-Release Version. Up for testing"
      ],
      expanded: false
    }

  ];

  const STORAGE_KEY = "changelog-open-v1";

  // Hilfsfunktion: ID generieren, falls fehlt
  const ensureIds = (list: Entry[]) =>
    list.map((e, i) => ({ ...e, id: e.id ?? `${e.version}-${e.date}-${i}` }));

  // gespeicherten Zustand laden und auf entries anwenden
  onMount(() => {
    entries = ensureIds(entries);
    try {
      const saved: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(saved) && saved.length) {
        const openSet = new Set(saved);
        entries = entries.map(e => ({ ...e, expanded: openSet.has(e.id as string) }));
      }
    } catch {
      // ignore
    }
  });

  function toggle(id: string) {
    // ⬅️ Immutabel neu zuweisen => Svelte rendert sicher neu
    entries = entries.map(e =>
      (e.id === id) ? { ...e, expanded: !e.expanded } : e
    );

    // offenen Zustand speichern
    try {
      const openIds = entries.filter(e => e.expanded).map(e => e.id) as string[];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(openIds));
    } catch {
      // ignore
    }
  }
</script>

<div class="box_style box_level2 footer-content-box">
  <h1>Changelog</h1>

  <div class="changelog">
    {#each entries as e (e.id)}
      <section class="entry">
        <button
          type="button"
          class="entry__header"
          aria-expanded={e.expanded}
          aria-controls={`panel-${e.id}`}
          on:click={() => toggle(e.id || '')}
        >
          <div class="entry__left">
            <span class="entry__version">v{e.version}</span>
            <span class="entry__date">{e.date}</span>
          </div>
          <div class="entry__title">{e.title || 'Änderungen'}</div>
          <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"
               style={`transform: rotate(${e.expanded ? 180 : 0}deg);`}>
            <path d="M7 10l5 5 5-5z"></path>
          </svg>
        </button>

        {#if e.expanded}
          <div id={`panel-${e.id}`} class="entry__panel" transition:slide>
            {#if e.changes?.length}
              <ul class="changes">
                {#each e.changes as c}
                  <li>{c}</li>
                {/each}
              </ul>
            {:else}
              <p class="empty">Keine Einträge.</p>
            {/if}
          </div>
        {/if}
      </section>
    {/each}
  </div>
</div>

<style>
  .changelog {
    display: grid;
    gap: 12px;
    margin-top: 8px;
  }

  .entry {
    background: #fff;
    border: 1px solid rgba(0,0,0,.08);
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,.04);
    overflow: hidden;
  }

  .entry__header {
    width: 100%;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: #fafafa;
    cursor: pointer;
    border: 0;
    text-align: left;
  }

  .entry__left {
    display: grid;
    grid-auto-flow: column;
    gap: 8px;
    align-items: baseline;
    white-space: nowrap;
  }

  .entry__version { font-weight: 700; }
  .entry__date { font-size: .9rem; opacity: .7; }
  .entry__title { font-weight: 600; color: #111; }

  .chevron {
    width: 20px; height: 20px;
    transition: transform .18s ease;
    fill: currentColor; opacity: .7;
  }

  .entry__panel {
    padding: 12px 16px 16px;
    background: #fff;
    border-top: 1px solid rgba(0,0,0,.06);
  }

  .changes {
    margin: 0;
    padding-left: 1.25rem;
    display: grid;
    gap: 6px;
  }

  .empty { margin: 0; opacity: .7; }
</style>
