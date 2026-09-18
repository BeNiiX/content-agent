#!/bin/bash
# Veille hebdomadaire (VPS, timer systemd content-weekly-veille ; ou à la main : bash scripts/weekly-veille.sh [--limit N]) :
#   1. import des exports bruts déposés dans data/raw/ (TikTok : data/raw/tiktok/, Instagram : data/raw/instagram/, URLs : data/raw/urls.txt)
#      — ils arrivent du Mac par deploy/sync-media.sh --data ; sans export, l'import est sauté (les items déjà importés restent)
#   2. enrich.js (yt-dlp par vidéo non enrichie) → 3. enrich-authors.js (médiane par compte) → 4. score.js → 5. build-docs.js (02_VEILLE/)
# Journal : data/veille/<date>.log (stdout + stderr). Code de sortie ≠ 0 si une étape échoue (l'unité systemd le remonte dans journalctl).
# Les options (--limit N, --since AAAA-MM-JJ…) sont passées à enrich.js et enrich-authors.js, comme scripts/sync.sh.
# Un blocage de l'IP par TikTok se voit dans le journal (« profil illisible », erreurs yt-dlp) : relancer plus tard ou faire la veille depuis le Mac.
set -u
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
DATE=$(date +%F); LOG="data/veille/$DATE.log"; mkdir -p data/veille data/raw/tiktok data/raw/instagram
RC=0
step() { local name="$1"; shift; echo "== $name : $*"; if "$@"; then echo "   ok"; else RC=1; echo "   ÉCHEC ($name, code $?)"; fi; }
has_files() { [ -d "$1" ] && [ -n "$(find "$1" -mindepth 1 -maxdepth 2 \( -name '*.json' -o -name '*.txt' -o -name '*.zip' \) -print -quit 2>/dev/null)" ]; }
{
  echo "=== $(date '+%F %T') veille hebdo (${*:-sans option})"
  if has_files data/raw/tiktok; then step "1a import TikTok" node src/tiktok/import-export.js data/raw/tiktok; else echo "== 1a import TikTok : aucun export dans data/raw/tiktok/ (deploy/sync-media.sh --data depuis le Mac), import sauté"; fi
  if has_files data/raw/instagram; then step "1b import Instagram" node src/instagram/import-export.js data/raw/instagram; else echo "== 1b import Instagram : rien dans data/raw/instagram/, sauté"; fi
  if [ -s data/raw/urls.txt ]; then step "1c import URLs" node src/tiktok/import-export.js data/raw/urls.txt --source manual; fi
  step "2 enrich"  node src/enrich.js "$@"
  step "3 authors" node src/enrich-authors.js "$@"
  step "4 score"   node src/score.js
  step "5 docs"    node src/build-docs.js
  echo "=== fin $(date '+%F %T') (code $RC) — 02_VEILLE/ mis à jour, poussé par deploy/git-sync.sh"
} >> "$LOG" 2>&1
tail -4 "$LOG"
exit $RC
