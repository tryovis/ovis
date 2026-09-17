# Changelog

All notable public changes to OVIS are documented here.

This GitHub repository is the public open-source distribution of OVIS. Development happens in an internal GitLab repository, and public updates are published here after the source tree is sanitized for open-source release.

## 1.4.0 - 2026-09-16

### Filtering, studies and usability

- **Filter selection:** charts, body maps, tables and quick selections respond reliably, including more specific selections within assigned patient groups.
- **Combined filters:** corrected patient, tumour and treatment results for combined conditions and exclusions, including multiple values, date and number ranges, and missing values. Selected calendar dates are preserved and invalid dates no longer produce misleading ages.
- **Filter editing:** reduced loading work for large selections, improved input validation and preserved conditions when editing, importing, removing values or using undo/redo.
- **Studies:** restored charts, improved loading and German/English labels, and corrected participant lists and counts for the selected patient group and recruitment period.
- **Charts and tables:** category charts now show clearer loading, empty-result and error messages with retry. Maximized tables keep their rows and use the available space.
- **Cox documentation:** improved the methodology page layout and scrolling within its panel.

### For administrators

- **User management:** all accounts are visible on one page. Assigned-filter edits wait for a confirmed save, retain entries on failure and record the acting user.
- **Access:** assigned patient groups are respected in patient details, timelines and studies without appearing as removable personal filters. Anonymous demo visitors no longer receive administrator privileges.

Date and age corrections for existing records take effect after a normal source data reimport.

## 1.3.0 - 2026-09-04

### Added

- Added an exploratory Cox proportional-hazards model for overall survival to the Survival page, clearly marked as Testing.
- Added automatic single-variable selection for age, gender, UICC stage, T stage, N stage, M stage, grading, ECOG, year of diagnosis, and metastasis at diagnosis.
- Added a forest plot with hazard ratios, 95% confidence intervals, reference categories, and logarithmic or linear display.
- Added a switch to the standard OVIS result table with hazard ratios, confidence intervals, and p-values.
- Added visible summaries for complete cases, events, censored and omitted patients, and the concordance index, including exclusion details and proportional-hazards diagnostics.
- Added a localized methodology page in German and English explaining the cohort, endpoint, grouping rules, result interpretation, and the R `survival` package used for calculation.

### Changed

- Grouped age into readable ten-year categories, aligned UICC and TNM categories with the Kaplan-Meier view, and displayed diagnosis years as individual values.
- Cox results now recalculate automatically when the selected grouping variable or active cohort filter changes.
- Cox regression now supports complete cohorts above 50,000 patients and processes large cohorts more efficiently.
- Cox calculations that exceed 60 seconds show a translated timeout message with guidance to narrow the cohort or retry later.
- Improved information tooltips so they stay within the viewport and their documentation links remain clickable.

### Fixed

- Fixed missing tumour, histology, TNM, status and survival data after a fresh import. Reprocessing now fills empty collections while retaining existing records without duplication.

### Notes for users and administrators

- The Cox analysis currently examines one grouping variable at a time and is intended for exploratory use; estimates are not adjusted for the other selectable variables.
- Tumour entities can be restricted through the existing cohort filters.
- Insufficient or unstable cohorts are reported instead of presenting a misleading model result.

## 1.2.0 - 2026-08-05

### Added

- Added adaptive height handling for browser configurations with reduced viewport height, including visible toolbars and bookmarks bars.
- Added a mobile landscape layout with mobile-specific navigation, quicktools, chart, table, SVG-map, and maximized-view behavior.
- Added a localized portrait-orientation guard with an animated rotate-device cue for smartphone users.
- Expanded responsive layout support beyond the original 1903 px maximum width and fixed 820 px content-height target to additional widescreen and laptop-sized viewports.

### Changed

- Improved responsive sizing and density for Chart.js charts, legends, data tables, and SVG maps while preserving the established primary desktop layout.
- Made navigation, patient-cohort controls, and quicktools adapt their density to the available viewport height.
- Made the quicktools filter area flexible and moved patient import actions inline so available vertical space is used more consistently.

### Fixed

- Fixed duplicate page scrollbars, unnecessary horizontal and vertical scrollbars, and content extending beyond the footer.
- Fixed maximized charts and tables overlapping the footer or leaving excessive unused space.
- Fixed clipped quicktools tooltips and predefined catalogue submenus.
- Fixed missing, clipped, or overly bold Chart.js legends, including wrapped vital-status labels and consistent Generic and Time Chart legend styling.
