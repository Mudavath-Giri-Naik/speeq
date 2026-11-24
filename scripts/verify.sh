#!/usr/bin/env bash
# Runs lint, typecheck, test and build. Writes the full output to .verify.log and prints only a
# short summary: one line per step, test totals, and the first 20 relevant lines of the first
# failure. Exits non-zero if any step fails.
set -u
cd "$(dirname "$0")/.."

LOG=.verify.log
: > "$LOG"
FAILED=""
FIRST_FAIL_OUT=""
TMP=$(mktemp)

strip() { sed -E 's/\x1b\[[0-9;]*[A-Za-z]//g'; }

run_step() {
  local name="$1"; shift
  local start=$SECONDS
  "$@" > "$TMP" 2>&1
  local code=$?
  { echo "===== $name ($*) exit=$code ====="; strip < "$TMP"; echo; } >> "$LOG"
  if [ $code -eq 0 ]; then
    printf '✅ %-10s %ss\n' "$name" "$((SECONDS - start))"
  else
    printf '❌ %-10s %ss (exit %s)\n' "$name" "$((SECONDS - start))" "$code"
    if [ -z "$FAILED" ]; then
      FAILED="$name"
      FIRST_FAIL_OUT=$(strip < "$TMP" | grep -E "error|Error|×|FAIL|✖|failed|AssertionError|Expected|Received" | grep -v "^\s*$" | head -20)
      [ -z "$FIRST_FAIL_OUT" ] && FIRST_FAIL_OUT=$(strip < "$TMP" | tail -20)
    fi
  fi
  if [ "$name" = "test" ]; then
    # Sum every Vitest "Tests  N passed | M failed (T)" line.
    strip < "$TMP" | grep -E "^\s*([a-z@/._-]+:test:\s*)?Tests\s+" | awk '
      { for (i = 1; i <= NF; i++) { if ($(i+1) ~ /^passed/) p += $i; if ($(i+1) ~ /^failed/) f += $i } }
      END { printf "   tests: %d passed, %d failed\n", p, f }'
  fi
}

run_step lint pnpm lint
run_step typecheck pnpm typecheck
run_step test pnpm test
run_step build pnpm build
rm -f "$TMP"

if [ -n "$FAILED" ]; then
  echo "--- first failure: $FAILED (full log: $LOG) ---"
  echo "$FIRST_FAIL_OUT"
  exit 1
fi
echo "All checks passed (full log: $LOG)"
