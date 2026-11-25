#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm --filter './packages/**' run build
mkdir -p .packs
dest=$(cd .packs && pwd)
for manifest in packages/*/package.json packages/adapters/*/package.json; do
  if node -e 'process.exit(require("./"+process.argv[1]).private ? 1 : 0)' "$manifest"; then
    (cd "$(dirname "$manifest")" && pnpm pack --pack-destination "$dest")
  fi
done
wc -c "$dest"/*.tgz
