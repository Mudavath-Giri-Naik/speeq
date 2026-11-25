# REPORT 007 — Platform ingest

**Status** BLOCKED under the section 3.3 stop rule.

**Branch / base** `task/007-platform-ingest` / `7b9afa7`

**Verification** Reproduced the conflict with a real SDK confirmation flow and an in-memory capture transport. Repository verification and dev smoke checks are pending.

**Files** One created, zero modified, zero deleted.

- `handoff/reports/007-platform-ingest.md`

## Finding

Section 3.3 rule 7 requires `approved + rejected <= requested + turns` in each usage rollup. With `flushIntervalMs: 0`, a bookmark request and its subsequent approval produced these two schema-valid SDK batches:

| Batch                  | Turns | Requested | Approved | Rejected | Rule 7 |
| ---------------------- | ----: | --------: | -------: | -------: | ------ |
| User requests bookmark |     1 |         1 |        0 |        0 | Pass   |
| User approves bookmark |     0 |         0 |        1 |        0 | Fail   |

Task 006 Amendment A counts only user messages as turns. The collector resets its counters after each send. An approval can therefore fall in a later batch than its request, including with the default interval. Rule 7 would return 400 for that legitimate batch and the SDK would discard its counters.

## Decision needed

Please amend the per-batch confirmation check to account for requests in earlier batches, or explicitly accept the loss of those rollups. Implementation stopped before changing the ingest rules.
