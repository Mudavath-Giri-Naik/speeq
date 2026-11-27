# Compiler benchmark

Measured on 2026-11-27 with `pnpm --filter @speeq/compiler bench`
(`packages/compiler/scripts/gen-large-fixture.ts`). Machine: Windows 11, 11th Gen Intel Core
i5-11320H at 3.20 GHz, 8 GiB RAM, Node v24.15.0, local SSD, antivirus on. One run each, no warm-up,
so treat the numbers as an order of magnitude and not as a guarantee.

The script writes a synthetic Next.js app to a temporary directory and deletes it afterwards:
1 000 pages with a form, 300 route handlers that parse a body with a Zod schema imported through an
alias and a 200-file barrel, 100 server actions, 200 schemas. That is 1 603 files and 2 400
capabilities. Nothing is committed.

| Scenario                              | Time     | Files parsed | Files from cache |
| ------------------------------------- | -------- | ------------ | ---------------- |
| Full scan                             | 4 336 ms | 1 601        | 0                |
| Rescan, nothing changed               | 3 610 ms | 0            | 1 601            |
| After touching one page               | 3 455 ms | 1            | 1 600            |
| After touching one widely used schema | 3 687 ms | 601          | 1 200            |

Filesystem only (same app): listing 1 603 files took 1 159 ms and reading all of them through
`RepoFs` took 2 096 ms. Peak RSS of the benchmark process was about 375 MiB, and that includes
generating the app.

## What this says

- **Parsing is no longer the cost.** The cache removes parsing exactly as intended: 0 parses when
  nothing changed, 1 for one page, 601 for a schema that 600 files import. The cache test asserts
  these counts, not the times.
- **About 75% of the time is the hardened filesystem layer.** Every read re-checks the path
  component by component, rejects symlinks, compares the opened file with the path (inode and
  device) and applies ignore rules. That is deliberate, see ADR-0013 and the threat model. It means
  an incremental rescan still reads and hashes every file, so it saves parsing but not I/O. A cheaper
  change check (size and modification time before hashing) and a cached directory-chain check are
  possible later optimisations and were not done here.
- **Realistic apps are far smaller.** `apps/demo` (43 files, 17 capabilities) scans in about 0.2 s.

## Findings made while benchmarking

1. A `.gitignore` was re-read for every ancestor directory on every file read. It is now read once
   per opened inventory (full scan 5.5 s to 4.3 s).
2. Module resolution is memoised per scan. It did not change the total, so the earlier suspicion that
   resolution was the cost was wrong; the filesystem measurement above is what found the real one.

Repeat: `pnpm --filter @speeq/compiler bench`.
