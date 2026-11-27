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

Tasks 020 to 022 (forms and filters; page context and universal agent; workflows and the Phase 2 gate) are planned in `docs/maintainers/phase-2-plan.md` and are briefed one at a time after the previous task is accepted.
