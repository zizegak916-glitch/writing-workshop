# Codex for Open Source — application working draft

Updated: 2026-08-22 (UTC). This remains an evidence draft, not a submission receipt or a claim of acceptance. Verify that the program and form are still open immediately before submission.

Official form: <https://openai.com/form/codex-for-oss/>

This file is an evidence-based draft, not a claim that the project already meets the program's popularity or ecosystem-impact bar.

## Repository

- Maintainer: `zizegak916-glitch`
- Repository: <https://github.com/zizegak916-glitch/writing-workshop>
- Public demo: <https://zizegak916-glitch.github.io/writing-workshop/>
- License: Apache-2.0
- Maintainer role: repository owner and primary maintainer of the current Writing Workshop Web product and native Go runtime
- Provenance disclosure: the repository began as a fork of `voocel/ainovel-cli` and preserves Apache-2.0 attribution and history. The current runtime in `internal/engine` is maintained in this repository and the current Go module/import graph no longer depends on the former `agentcore` or `litellm` modules.

## “Why does this repository qualify?” draft

Writing Workshop is an Apache-2.0, local-first long-form writing workbench with a repository-owned Go agent runtime. It makes model context and write permissions explicit: authors choose the manuscript, outline, character and memory context; Skills expose steps and permissions; generated text remains a candidate until the author confirms a write. Its authorized-corpus workflow derives aggregate, inspectable prompt rules without persisting source text or asking a model to imitate a named author. The repository provides a keyless demo, same-origin API, browser BYOK, streaming Web cancellation, snapshots, Docker packaging and CI while preserving fork provenance.

Before submission, append only verified evidence: current stars, release downloads, independent users, downstream integrations, accepted outside contributions, or concrete ecosystem use. Do not replace evidence with feature count.

## API credit usage draft

API credits would fund open-source maintenance rather than hidden product usage: generating synthetic regression fixtures for long-context workflows; triaging and reproducing public issues; testing provider compatibility; auditing capability manifests and permission declarations; producing release migration notes; and evaluating whether changes preserve character facts, causal order and confirmation-before-write guarantees. Tests and fixtures would remain public and must not contain private manuscripts.

## Evidence available now

| Evidence | Public location |
|---|---|
| Push/PR test pipeline | `.github/workflows/ci.yml` |
| Latest verified release / CI / Pages deployment | [v0.2.5](https://github.com/zizegak916-glitch/writing-workshop/releases/tag/v0.2.5), [Release 30447412739](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30447412739), [CI 30447761904](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30447761904), [Pages 30447761763](https://github.com/zizegak916-glitch/writing-workshop/actions/runs/30447761763) |
| Go tests, vet, build, JS checks, browser product tests and service smoke test | GitHub Actions CI |
| Keyless runnable mode | `writing-workshop serve --demo` |
| Docker health check | `/api/health` |
| Capability contract | `docs/CAPABILITY_PROTOCOL.md` |
| Multi-Skill packs and custom categories | `internal/web/catalog.go`, `internal/web/server_test.go` |
| Browser-local project management and safe export/delete | `web/static/js/product-extensions.js` |
| Native Go agent, context, provider and safe-edit runtime | `internal/engine/`, `go.mod` |
| Authorized corpus statistics, candidate-only refinements and no-source retention | `internal/corpus/`, `internal/web/corpus.go`, `web/static/js/corpus-lab.js` |
| 32 editable browser Prompt Skills and v6 project backup | `web/static/js/prompt-skills.js`, `web/static/css/prompt-skills.css`, `web/static/js/workbench.js` |
| Four-protocol browser/self-host adapter and real upstream streaming | `web/static/js/api-adapter.js`, `internal/web/provider_http.go`, `internal/web/server_test.go`, `tests/api-adapter.test.mjs` |
| Transactional editor switching/import/delete and project-scoped recovery history | `web/static/js/workbench.js`, `web/static/js/product-extensions.js`, `tests/browser-smoke.mjs` |
| Desktop/mobile notes and Playwright product smoke suite | `web/static/js/workbench.js`, `tests/browser-smoke.mjs` |
| Persistent request controls and audited context-budget display | `web/static/app.html`, `web/static/css/product-extensions.css`, `scripts/check-static.mjs` |
| Documentation status and historical boundaries | `docs/README.md` |
| Commit / CI / Pages / public-check timeline | `docs/UPDATE_TIMELINE.md`, `docs/RELEASE_EVIDENCE.json` |
| Contribution and security process | `CONTRIBUTING.md`, `SECURITY.md`, issue templates |
| Fork provenance and current-runtime boundary | `NOTICE`, `docs/UPSTREAM_ENGINE.md`, `docs/NATIVE_ENGINE.md`, git history |

## Evidence still required before a strong application

The last recorded repository metrics were captured at `2026-07-28T16:13:35Z`: **1 star, 0 forks, 0 open issues and 0 subscribers**. They are stale historical numbers, not current adoption evidence, and must be refreshed from GitHub immediately before submission.

- Keep producing checksummed releases and record real downloads; the existence of a release alone is not adoption evidence.
- Obtain real external usage evidence; the current repository does not yet have meaningful star, download or dependent-project numbers.
- Collect reproducible user reports or outside contributions that show the project solves a shared open-source need.
- Record at least one downstream Skill or integration maintained outside this repository.
- Keep CI and security response active over time; one green run is necessary but not ecosystem impact.

Submit only if the official program is still available and the evidence above is real. Never invent metrics, call repository self-tests an independent audit, erase fork provenance, or claim production-provider compatibility from local mocks.
