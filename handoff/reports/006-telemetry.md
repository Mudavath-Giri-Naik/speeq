# REPORT 006 — Server telemetry

**Status** BLOCKED on the turn-count contract.

**Branch** `task/006-telemetry`, implementation based on `a5d57f9`. The implementation is uncommitted.

**Verification** The unchanged privacy suite passed 12 of 14 cases. Server typecheck also found four errors in the draft collector tests. Full verification and bundle acceptance are pending.

**Working files** Five created, one modified, zero deleted.

- `packages/server/src/telemetry/{collector,http-transport,runtime-info,index}.ts`
- `packages/server/test/telemetry-collector.test.ts`
- `handoff/reports/006-telemetry.md`

**What I found** The architect's fixture issues five text turns and one approval. Both request paths call `streamTurn` in `packages/server/src/handler/turn.ts` (lines 71 and 134). Line 297 unconditionally calls the same telemetry turn hook, including for the approval. The fixture therefore produces six hook calls.

**Deviations** Two acceptance cases expect five turns and five total latency samples. Section 3 requires an increment and a latency sample on every hook call. The sink receives no request kind. Inferring a confirmation from the preceding event would miscount concurrent requests.

**Decision** Stopped under the brief's acceptance-test conflict rule.

**Risks** The draft implementation, unit tests and user documentation are incomplete.

**Open question** May the task include the turn handler so it can omit the telemetry turn hook on confirmation resumes, while preserving confirmation, tool and error counters?
