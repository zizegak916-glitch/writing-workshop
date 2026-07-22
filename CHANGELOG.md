# Changelog

All notable Writing Workshop changes are recorded here. The project follows Semantic Versioning after the first public release.

## Unreleased

### 2026-07-22 product update

- Added persistent skill-pack and category APIs, three built-in multi-skill presets, and three new writing skills for continuity, character voice and scene pacing.
- Added visible multi-Skill selection, pack application, category filtering and a static catalog preview that does not pretend to execute without a backend.
- Added browser-local project search, rename, duplicate, category assignment, per-project export and confirmed cascade deletion.
- Added custom memory categories, a version-2 project export containing memories, and memory import compatibility.
- Added a hand-drawn repository-native SVG app icon across the workbench, product pages and console.
- Removed the nonfunctional URL-import control and replaced the obsolete contact link with Linux DO user `The_o0l`.
- Added a truthful GitHub Star support panel to the landing page.
- Updated current documentation, added a documentation status map, and labeled inherited engine documents as historical references.

### Security

- Replaced project-manager and admin character rendering paths that interpolated user-controlled text with escaped or DOM-safe rendering.
- Escaped memory content and custom category labels before rendering.

### Added

- Explicit context packets for current text, project settings, outlines, characters and memories, including token estimates.
- Composable capability manifests with visible instructions, steps and permissions.
- Streaming candidate generation, cancellation, confirmation-before-write and pre-apply snapshots.
- Keyless `serve --demo` mode, configurable bind host and `/api/health`.
- Project-owned Go module, binary, Docker image, installer and release configuration.
- Push/PR CI covering Go tests, vet, build, JavaScript syntax and an offline server smoke test.

### Security

- Replaced wildcard CORS with same-origin defaults and an explicit trusted-origin allowlist.
- Preserved local-only binding as the CLI default.

### Attribution

- Kept the Apache-2.0 upstream engine attribution and historical design documentation visible.
