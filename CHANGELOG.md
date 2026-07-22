# Changelog

All notable Writing Workshop changes are recorded here. The project follows Semantic Versioning after the first public release.

## Unreleased

### 2026-07-23 documentation and quality pass

- Added a repository-wide update timeline and machine-readable release-evidence ledger linking product events to commits, CI, Pages deployments and public checks.
- Synchronized the current README, user guide, API, configuration, development, contribution, security, capability, UI, review and application documents; historical engine documents now point back to the current timeline.
- Tightened the built-in “查AI” Prompt Skill to the six fields the parser actually consumes, and stopped rendering a radar chart when any required score is missing instead of inventing a neutral score.
- Replaced AI-returned sentence fragments built through `innerHTML` and inline handlers with DOM-safe buttons, and corrected the AI-fragment flag check so only text actually present in the editor is marked.
- Added distinct repository-native icons for “实时灵感” and “资料搜索” rather than reusing generic Prompt Skill glyphs.
- Added a dependency-free static product contract to CI for Prompt Skill coverage, icon/SVG integrity, inline-script parsing, local links and release-evidence JSON.

### 2026-07-22 product update

- Added persistent skill-pack and category APIs, three built-in multi-skill presets, and three new writing skills for continuity, character voice and scene pacing.
- Added visible multi-Skill selection, pack application, category filtering and a static catalog preview that does not pretend to execute without a backend.
- Added 32 practical browser-local Prompt Skills for every AI mode and quick tool, with hidden request injection, searchable editing, per-skill reset, standalone import/export and project-backup restore.
- Added browser-local project search, rename, duplicate, category assignment, per-project export and confirmed cascade deletion.
- Added custom memory categories, a version-3 project export containing memories and Prompt Skill overrides, plus backward-compatible import.
- Added a hand-drawn repository-native SVG app icon across the workbench, product pages and console.
- Replaced the generic brain AI entry and all 30 text/Emoji capability glyphs with a repository-native SVG icon family for desktop and mobile.
- Removed the nonfunctional URL-import control and replaced the obsolete contact link with verified Linux DO user `The_Fo0l`.
- Corrected product terminology across the UI and documentation: GitHub Pages is the formal public online deployment, not a preview or a Sites layer; the optional backend is described separately as a server-side capability extension.
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
