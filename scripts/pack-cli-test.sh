#!/usr/bin/env bash
# Packed-tarball test for the `speeq` executable (task 018, Phase 1 gate).
# Needs `bash scripts/pack-all.sh` first. Installs the tarballs in a clean Next.js app (never published
# packages), then runs the real CLI: scan, enable, init, repeated init, verify, type check, rollback.
set -euo pipefail
cd "$(dirname "$0")/.."
root=$(pwd)
temp_root=$(cd "${TMPDIR:-/tmp}" && pwd -P)
scratch=$(mktemp -d "$temp_root/speeq-cli-pack.XXXXXXXX")
echo "Scratch app: $scratch"
if [[ ${KEEP_PACK_TEST:-0} != 1 ]]; then
  trap 'cd "$root" && rm -rf -- "$scratch"' EXIT
fi
cp -r "$root/scripts/pack-cli-app" "$scratch/app"
mkdir "$scratch/app/packs"
cp "$root"/.packs/*.tgz "$scratch/app/packs/"
mkdir "$scratch/out"
cd "$scratch/app"
version=$(node -p 'require(process.argv[1]).version' "$root/packages/speeq/package.json")
node "$root/scripts/pack-cli-prepare.mjs" "$root" "$version"
start=$(date +%s)
npm install --no-audit --no-fund --loglevel=error
echo "npm install: $(( $(date +%s) - start ))s"
snap() { find . \( -path ./node_modules -o -path ./packs -o -path ./.speeq/backups \) -prune -o -type f -print | sort | xargs sha256sum; }
outw=$(cd "$scratch/out" && (pwd -W 2>/dev/null || pwd))
field() { node -p "const j=require('$outw/$1'); $2"; }

[[ "$(npx speeq --version)" == "$version" ]] || { echo "FAIL: version"; exit 1; }

npx speeq scan --json > "$scratch/out/scan.json" || true
echo "scan counts: $(field scan.json 'JSON.stringify(j.counts)')"
npx speeq capabilities enable "route:/subjects" --auth public --json > /dev/null
npx speeq capabilities enable "function:app/actions.ts#addToCart" --auth authenticated --json > /dev/null
npx speeq capabilities enable "function:app/actions.ts#countItems" --access read --auth public --json > /dev/null
snap > "$scratch/out/before.txt"

start=$(date +%s%N)
code=0; npx speeq init --ci --json > "$scratch/out/init.json" || code=$?
echo "init: exit $code in $(( ($(date +%s%N) - start) / 1000000 )) ms, applied=$(field init.json j.applied)"
[[ $code == 0 || $code == 3 ]] || { echo "FAIL: init exit $code"; exit 1; }
[[ "$(field init.json j.applied)" == "applied" ]] || { echo "FAIL: init did not apply"; exit 1; }
[[ -f components/speeq/assistant.tsx ]] || { echo "FAIL: chat box was not generated"; exit 1; }
grep -q "SpeeqAssistant" app/layout.tsx || { echo "FAIL: layout was not wired"; exit 1; }
grep -q "^SPEEQ_SECRET=" .env.local || { echo "FAIL: env names were not written"; exit 1; }
echo "onboarding: chat box generated, layout wired, .env.local written"
snap > "$scratch/out/after-init.txt"

code=0; npx speeq init --ci --json > "$scratch/out/init2.json" || code=$?
snap > "$scratch/out/after-init2.txt"
cmp -s "$scratch/out/after-init.txt" "$scratch/out/after-init2.txt" || { echo "FAIL: second init changed files"; diff "$scratch/out/after-init.txt" "$scratch/out/after-init2.txt"; exit 1; }
[[ "$(field init2.json j.applied)" != "applied" ]] || { echo "FAIL: second init applied something"; exit 1; }
echo "repeated init: no-op (exit $code, applied=$(field init2.json j.applied))"

code=0; npx speeq verify --json > "$scratch/out/verify.json" || code=$?
echo "verify: exit $code, readiness $(field verify.json 'JSON.stringify(j.readiness)')"
[[ "$(field verify.json 'j.readiness.static')" == "pass" ]] || { echo "FAIL: static"; exit 1; }
[[ "$(field verify.json 'j.readiness.runtime')" == "pass" ]] || { echo "FAIL: runtime"; exit 1; }

npx tsc --noEmit
echo "tsc --noEmit: generated code compiles against the packed packages"

code=0; npx speeq verify --json --run-host > "$scratch/out/host.json" || code=$?
[[ "$(field host.json 'j.readiness.host')" == "pass" ]] || { echo "FAIL: host"; exit 1; }
echo "verify --run-host: host level pass"

npx speeq rollback --json > "$scratch/out/rollback.json"
snap > "$scratch/out/after-rollback.txt"
cmp -s "$scratch/out/before.txt" "$scratch/out/after-rollback.txt" || { echo "FAIL: rollback did not restore the tree"; diff "$scratch/out/before.txt" "$scratch/out/after-rollback.txt"; exit 1; }
echo "rollback: tree identical to before init"
echo "PASS"
