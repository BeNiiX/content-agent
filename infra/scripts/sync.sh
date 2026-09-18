#!/usr/bin/env bash
# Pipeline complet de veille. Usage : npm run sync  (ou bash scripts/sync.sh [--limit 50])
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== 1/5 import"
[ -d data/raw/tiktok ] && node src/tiktok/import-export.js data/raw/tiktok || echo "   (pas de data/raw/tiktok)"
[ -d data/raw/instagram ] && node src/instagram/import-export.js data/raw/instagram || echo "   (pas de data/raw/instagram)"
[ -f data/raw/urls.txt ] && node src/tiktok/import-export.js data/raw/urls.txt --source manual || true
echo "== 2/5 enrich"; node src/enrich.js "$@"
echo "== 3/5 authors"; node src/enrich-authors.js "$@"
echo "== 4/5 score";  node src/score.js
echo "== 5/5 docs";   node src/build-docs.js
