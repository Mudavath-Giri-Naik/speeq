# Handoff index

Status: `briefed | in-progress | reviewed-accepted | redo`

| #   | Title                                                                                        | Status            | Branch                        |
| --- | -------------------------------------------------------------------------------------------- | ----------------- | ----------------------------- |
| 001 | Client core: state machine, transport, TTS orchestration                                     | reviewed-accepted | task/001-client-core          |
| 002 | Client Web Speech adapters, default wiring, README                                           | reviewed-accepted | task/002-web-speech           |
| 003 | React provider/hooks + audit client                                                          | reviewed-accepted | task/003-react                |
| 004 | Demo site: data, pages, demo auth, speeq wiring, mock LLM                                    | reviewed-accepted | task/004-demo-wiring          |
| 005 | Demo UI: assistant widget, audit page, e2e                                                   | reviewed-accepted | task/005-demo-ui              |
| 006 | Server telemetry collector + HTTP transport                                                  | reviewed-accepted | task/006-telemetry            |
| 007 | Platform: DB schema, ingest endpoint, cleanup cron                                           | reviewed-accepted | task/007-platform-ingest      |
| 008 | Platform: admin login, dashboard pages, stats, seed                                          | reviewed-accepted | task/008-platform-dashboard   |
| 009 | Docs pass + release verification (combined 11+12)                                            | reviewed-accepted | task/009-docs-release         |
| 010 | Umbrella speeq package, release workflow, dev update notice                                  | reviewed-accepted | task/010-umbrella-release     |
| 011 | Public docs website (apps/docs, Vercel)                                                      | reviewed-accepted | task/011-docs-website         |
| 012 | Voice foundation: pluggable speech providers, server audio, benchmark harness                | accepted          | task/012-voice-foundation     |
| 013 | Indian-language accuracy: vocabulary, language detection, Telugu/Hindi providers, evaluation | accepted          | task/013-indic-accuracy       |
| 014 | Natural conversation: endpointing, voices, reliability, analytics, latency, docs             | briefed           | task/014-natural-voice        |
| 015 | Compiler foundation: manifest contracts, jailed fs, research evidence, eval harness          | reviewed-accepted | task/015-compiler-contracts   |
| 016 | The whole compiler: discovery, schemas, forms, filters, manifest, reconcile, incremental     | reviewed-accepted | task/016-compiler-discovery   |
| 017 | CLI and integration engine: @speeq/integrate, @speeq/cli, bindEndpoint, registries, rollback | reviewed-accepted | task/017-cli-integration      |
| 018 | Verification, doctor, real-app validation, umbrella executable, packed tarball               | reviewed-accepted | task/018-verification-release |
| 019 | UI bridge: contract, server runtime, client registry, React hook, feature entry              | reviewed-accepted | task/019-ui-bridge            |
| 020 | Forms and filters: draft-only form fill, generated UI descriptors, filter application        | reviewed-accepted | task/020-forms-filters        |
| 021 | Zero-code onboarding: provider choice, env names, generated chat UI with voice               | reviewed-accepted | task/021-zero-code-onboarding |
| 022 | Identity lifecycle and account isolation (release 0.12)                                      | reviewed-accepted | task/022-identity-lifecycle   |
| 023 | Context providers, get_context, page context allow-list                                      | reviewed-accepted | task/023-context-providers    |
| 024 | Business profile, style, greetings, starters, error reasons, presets                         | reviewed-accepted | task/024-greetings-and-style  |
| 025 | Memory modes: persistent conversations, preferences, clearing                                | reviewed-accepted | task/025-memory-modes         |
| 026 | Discovery: auth bindings, customer data sources, business facts                              | reviewed-accepted | task/026-discovery            |
| 027 | Terminal control center                                                                      | reviewed-accepted | task/027-control-center       |
| 028 | Verification, doctor, scenarios A to D, benchmarks, docs, release prep                       | reviewed-accepted | task/028-verification-release |

Release 0.12 (tasks 022 to 028) is complete: plan `docs/maintainers/release-0.12-plan.md`, report `docs/maintainers/release-0.12-report.md`. Publishing to `next` happens through the Version Packages PR; `latest` only on the owner's word.
