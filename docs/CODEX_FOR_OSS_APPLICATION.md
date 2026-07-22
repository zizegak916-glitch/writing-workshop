# Codex for Open Source — application working draft

Updated: 2026-07-23 (UTC+8). This remains an evidence draft, not a submission receipt or a claim of acceptance.

Official form: <https://openai.com/form/codex-for-oss/>

This file is an evidence-based draft, not a claim that the project already meets the program's popularity or ecosystem-impact bar.

## Repository

- Maintainer: `zizegak916-glitch`
- Repository: <https://github.com/zizegak916-glitch/writing-workshop>
- Public demo: <https://zizegak916-glitch.github.io/writing-workshop/>
- License: Apache-2.0
- Maintainer role: repository owner and primary maintainer of the Writing Workshop product layer
- Upstream disclosure: the Go writing engine is derived from `voocel/ainovel-cli`; Writing Workshop's independent contribution is the local-first Web product, explicit context workflow, capability protocol, safety boundary, packaging and maintenance infrastructure.

## “Why does this repository qualify?” draft

Writing Workshop is an Apache-2.0, local-first long-form writing workbench. It makes model context and write permissions explicit: authors choose the exact manuscript, outline, character and memory context; Skills expose steps and permissions; generated text remains a candidate until the author confirms a write. The repository provides a keyless demo, same-origin API, streaming cancellation, snapshots, Docker packaging and CI. It is maintained as an independent Go module while preserving upstream attribution.

Before submission, append only verified evidence: current stars, release downloads, independent users, downstream integrations, accepted outside contributions, or concrete ecosystem use. Do not replace evidence with feature count.

## API credit usage draft

API credits would fund open-source maintenance rather than hidden product usage: generating synthetic regression fixtures for long-context workflows; triaging and reproducing public issues; testing provider compatibility; auditing capability manifests and permission declarations; producing release migration notes; and evaluating whether changes preserve character facts, causal order and confirmation-before-write guarantees. Tests and fixtures would remain public and must not contain private manuscripts.

## Evidence available now

| Evidence | Public location |
|---|---|
| Push/PR test pipeline | `.github/workflows/ci.yml` |
| Latest verified CI and Pages deployment | [CI 29941672602](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29941672602), [Pages 29941672654](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/29941672654) |
| Go tests, vet, build, JS checks and service smoke test | GitHub Actions CI |
| Keyless runnable mode | `writing-workshop serve --demo` |
| Docker health check | `/api/health` |
| Capability contract | `docs/CAPABILITY_PROTOCOL.md` |
| Multi-Skill packs and custom categories | `internal/web/catalog.go`, `internal/web/server_test.go` |
| Browser-local project management and safe export/delete | `web/static/js/product-extensions.js` |
| 32 editable browser Prompt Skills and v3 backup | `web/static/js/prompt-skills.js`, `web/static/css/prompt-skills.css` |
| Documentation status and historical boundaries | `docs/README.md` |
| Commit / CI / Pages / public-check timeline | `docs/UPDATE_TIMELINE.md`, `docs/RELEASE_EVIDENCE.json` |
| Contribution and security process | `CONTRIBUTING.md`, `SECURITY.md`, issue templates |
| Upstream attribution | `NOTICE`, `docs/UPSTREAM_ENGINE.md`, git history |

## Evidence still required before a strong application

Point-in-time repository metrics captured from the GitHub API at `2026-07-22T17:04:25Z`: **1 star, 0 forks, 0 open issues and 0 subscribers**. This is a truthful snapshot, not evidence of broad adoption, and it must be refreshed immediately before submission.

- Publish the first signed or checksummed release and verify installer assets.
- Obtain real external usage evidence; the current repository does not yet have meaningful star, download or dependent-project numbers.
- Collect reproducible user reports or outside contributions that show the project solves a shared open-source need.
- Record at least one downstream Skill or integration maintained outside this repository.
- Keep CI and security response active over time; one green run is necessary but not ecosystem impact.

The official program reviews applications on a rolling basis. Submit when the evidence above is real; never invent metrics or imply ownership of the upstream engine.
