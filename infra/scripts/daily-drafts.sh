#!/bin/bash
# Envoi du soir : 1 brouillon TikTok par compte connecté (prochain contenu de 06_CALENDAR/QUEUE.md) + message de consignes.
# Planifié sur le VPS par systemd (deploy/systemd/content-daily-drafts.timer, heure = daily_hour de config/project.json) — ou launchd sur un Mac
# (scripts/launchd/make-plists.js) — ou à la main : bash scripts/daily-drafts.sh [--dry-run]
# Étapes, Node pur (aucun modèle dans la boucle ; fournisseur défini par PUBLISH_BACKEND dans .env) :
#   daily-plan.js (déterministe) → daily-send.js (s'il y a des items `planned`) → daily-notify.js (ntfy / Telegram / iMessage).
set -u
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
DATE=$(date +%F); LOG="data/publish/daily/$DATE.log"; mkdir -p data/publish/daily
[ "${1:-}" = "--dry-run" ] && export DAILY_DRY_RUN=1
{
  echo "=== $(date '+%F %T') envoi du soir ${DAILY_DRY_RUN:+(dry-run)}"
  node src/publish/daily-plan.js
  PLANNED=$(node -e 'const p=require("./data/publish/daily/'"$DATE"'.json");console.log(p.items.filter(x=>x.status==="planned").length)')
  if [ "$PLANNED" -gt 0 ] && [ "${DAILY_DRY_RUN:-0}" != "1" ]; then
    node src/publish/daily-send.js
  else
    echo "rien à envoyer (planned=$PLANNED, dry-run=${DAILY_DRY_RUN:-0})"
  fi
  node src/publish/daily-notify.js
  echo "=== fin $(date '+%F %T')"
} >> "$LOG" 2>&1
tail -3 "$LOG"
