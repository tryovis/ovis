# Changelog

All notable public changes to OVIS are documented here.

This GitHub repository is the public open-source distribution of OVIS. Development happens in an internal GitLab repository, and public updates are published here after the source tree is sanitized for open-source release.

## Unreleased

### Added

- Added the public GitHub mirror publication workflow.
- Added sanitized public mirror validation before publishing to GitHub.
- Added support for publishing the GitHub mirror with a dedicated repository secret.

### Changed

- GitHub `main` is now published from sanitized GitLab `main` snapshots.
- Public mirror commit titles now include the UTC snapshot date and sanitized top-level paths touched by each update, and commit bodies list created, modified, and deleted public files.
- Public GitHub history is represented through this changelog and future GitHub releases rather than raw internal GitLab commits.
- Simplified Docker configuration by fixing bundled service topology identifiers and internal Basic Auth credentials while retaining deployer-controlled secrets and external ports.

### Notes for users

- Use the GitHub repository as the public source for cloning, issues, and releases.
- Accepted code changes are integrated through the internal development workflow and then mirrored back to GitHub.
- User-facing changes should be added to this changelog before they are published.

## 1.2.0 - 2026-08-05

### Added

- Added adaptive height handling for browser configurations with reduced viewport height, including visible toolbars and bookmarks bars.
- Added a mobile landscape layout with mobile-specific navigation, quicktools, chart, table, SVG-map, and maximized-view behavior.
- Expanded responsive layout support beyond the original 1903 px maximum width and fixed 820 px content-height target to additional widescreen and laptop-sized viewports.

### Changed

- Improved responsive sizing and density for Chart.js charts, legends, data tables, and SVG maps while preserving the established primary desktop layout.
- Adjusted compact quicktools and footer sizing so available viewport space is used more consistently.

### Fixed

- Fixed duplicate page scrollbars, unnecessary horizontal and vertical scrollbars, and content extending beyond the footer.
- Fixed maximized charts and tables overlapping the footer or leaving excessive unused space.
- Fixed clipped quicktools tooltips and predefined catalogue submenus.
