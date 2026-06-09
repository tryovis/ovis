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
- Public GitHub history is represented through this changelog and future GitHub releases rather than raw internal GitLab commits.

### Notes for users

- Use the GitHub repository as the public source for cloning, issues, and releases.
- Accepted code changes are integrated through the internal development workflow and then mirrored back to GitHub.
- User-facing changes should be added to this changelog before they are published.
