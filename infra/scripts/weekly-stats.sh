#!/bin/bash
# Relevé hebdo des comptes TikTok : pull (yt-dlp + pages publiques) → report (STATS.md par compte, digest, fiches EXP).
# Planifié sur le VPS par systemd (deploy/systemd/content-weekly-stats.timer, jour / heure = weekly_stats de config/project.json ; la veille
# content-weekly-veille tourne une heure avant) — ou launchd sur un Mac (scripts/launchd/make-plists.js) — ou à la main : bash scripts/weekly-stats.sh
# Option : WEEKLY_CLAUDE=1 → enchaîne une revue Claude Code headless (annotation du digest), voir README.
set -u
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
LOG="data/accounts/weekly.log"; mkdir -p data/accounts
{
  echo "=== $(date '+%F %T') relevé hebdo"
  node src/accounts/pull.js --n 60 --media
  node src/accounts/report.js
  if [ "${WEEKLY_CLAUDE:-0}" = "1" ] && command -v claude >/dev/null; then
    cd .. && claude -p "Lis 06_CALENDAR/stats/$(date +%F).md et applique la section « À faire (agent, SOP_06) » : annote le digest sous le marqueur notes-agent, mets à jour les fiches EXP concernées et 01_BRAND/ACCOUNTS.md (abonnés). Ne publie rien, ne dépense rien." --allowedTools "Read,Edit,Write,Bash(node:*),Glob,Grep" >> "infra/$LOG" 2>&1
  fi
  echo "=== fin $(date '+%F %T')"
} >> "$LOG" 2>&1
