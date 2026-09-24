#!/usr/bin/env bash
# Vérifie que la session Claude Code du VPS (login claude.ai, ~/.claude/.credentials.json) est valide ; sinon notifie
# (NOTIFY_CHANNEL de infra/.env) pour refaire `claude auth login` avant l'envoi du soir. Lancé par content-auth-check.timer (09:00).
# Usage : deploy/auth-check.sh [--quiet]
set -u
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
INFRA="$APP_DIR/infra"
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"
STAMP="$INFRA/data/git-sync/auth-notified"; mkdir -p "$(dirname "$STAMP")"
if ! command -v claude >/dev/null; then echo "claude introuvable dans le PATH ($PATH)"; exit 2; fi
if out=$(claude auth status 2>&1); then
  [ "${1:-}" = "--quiet" ] || echo "session Claude valide : $(echo "$out" | tr -d '\n' | cut -c1-200)"
  rm -f "$STAMP"; exit 0
fi
echo "session Claude INVALIDE ou expirée : $out"
# une notification par jour au plus
if [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$(date +%F)" ]; then
  date +%F > "$STAMP"
  (cd "$INFRA" && node src/publish/daily-notify.js --alert "Session Claude expirée sur le VPS : l'envoi du soir échouera. ssh puis : sudo -iu content claude auth login") || true
fi
exit 1
