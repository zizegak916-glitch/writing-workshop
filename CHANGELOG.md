# Changelog

All notable Writing Workshop changes are recorded here. The project follows Semantic Versioning after the first public release.

## Unreleased

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
