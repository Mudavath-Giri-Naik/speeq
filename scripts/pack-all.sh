#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm --filter './packages/**' run build
mkdir -p .packs
dest=$(cd .packs && pwd)
archives=()
for manifest in packages/*/package.json packages/adapters/*/package.json; do
  if node -e 'process.exit(require("./"+process.argv[1]).private ? 1 : 0)' "$manifest"; then
    filename=$(node -p 'const p=require("./"+process.argv[1]); p.name.replace(/^@/, "").replace("/", "-")+"-"+p.version+".tgz"' "$manifest")
    archives+=("$dest/$filename")
    (cd "$(dirname "$manifest")" && pnpm pack --pack-destination "$dest")
  fi
done
wc -c "${archives[@]}"
