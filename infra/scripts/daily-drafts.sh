#!/bin/bash
# Envoi du soir : 1 brouillon TikTok par compte connecté (prochain contenu de 06_CALENDAR/QUEUE.md) + message de consignes.
# Planifié sur le VPS par systemd (deploy/systemd/content-daily-drafts.timer, heure = daily_hour de config/project.json) — ou launchd sur un Mac
# (scripts/launchd/make-plists.js) — ou à la main : bash scripts/daily-drafts.sh [--dry-run]
# Étapes : daily-plan.js (déterministe) → claude -p (appels du connecteur Higgsfield, outils restreints) → daily-notify.js (ntfy / Telegram / iMessage).
set -u
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT
DATE=$(date +%F); LOG="data/publish/daily/$DATE.log"; mkdir -p data/publish/daily
[ "${1:-}" = "--dry-run" ] && export DAILY_DRY_RUN=1
{
  echo "=== $(date '+%F %T') envoi du soir ${DAILY_DRY_RUN:+(dry-run)}"
  node src/publish/daily-plan.js
  PLANNED=$(node -e 'const p=require("./data/publish/daily/'"$DATE"'.json");console.log(p.items.filter(x=>x.status==="planned").length)')
  if [ "$PLANNED" -gt 0 ] && [ "${DAILY_DRY_RUN:-0}" != "1" ]; then
    APP_NAME=$(node --input-type=module -e 'import { project } from "./src/lib/project.js"; console.log(project().name)')
    PROMPT=$(sed -e "s/__DATE__/$DATE/g" -e "s|__APP_NAME__|$APP_NAME|g" scripts/daily-drafts.prompt.md)
    MODEL=$(grep -E "^DAILY_MODEL=" .env 2>/dev/null | cut -d= -f2); MODEL=${MODEL:-claude-sonnet-5}
    claude -p "$PROMPT" --model "$MODEL" \
      --allowedTools "Read,Bash(node:*),mcp__claude_ai_Higgsfield__media_upload,mcp__claude_ai_Higgsfield__media_confirm,mcp__claude_ai_Higgsfield__tiktok_prepare_publish,mcp__claude_ai_Higgsfield__tiktok_publish,mcp__claude_ai_Higgsfield__tiktok_publish_status,mcp__claude_ai_Higgsfield__tiktok_accounts" \
      --max-turns 120 --output-format json > "data/publish/daily/$DATE.claude.json" 2>> "$LOG"
    node -e 'const r=require("./data/publish/daily/'"$DATE"'.claude.json");console.log("claude :",r.subtype,"|",r.result?.slice(0,300)||"", "| tours", r.num_turns, "| coût", r.total_cost_usd)'
  else
    echo "rien à envoyer (planned=$PLANNED, dry-run=${DAILY_DRY_RUN:-0})"
  fi
  node src/publish/daily-notify.js
  echo "=== fin $(date '+%F %T')"
} >> "$LOG" 2>&1
tail -3 "$LOG"
