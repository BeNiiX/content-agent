#!/usr/bin/env bash
# À lancer DEPUIS LE MAC : rsync des médias hors git entre le Mac et le VPS.
#
#   deploy/sync-media.sh                 Mac → VPS : screen-records, rushs, MP4/MOV des posts (après un tournage ou un rendu local)
#   deploy/sync-media.sh --from-vps      VPS → Mac : rapatrier les rendus faits sur le VPS (MP4 des posts)
#   deploy/sync-media.sh --data          Mac → VPS, en plus : infra/data/{raw,tiktok,videos,instagram} (veille : exports + JSON yt-dlp)
#   deploy/sync-media.sh --dry-run       montre ce qui partirait, ne copie rien
#   deploy/sync-media.sh --delete        supprime à destination ce qui n'existe plus à la source (JAMAIS par défaut : le VPS rend
#                                        aussi des médias, un --delete Mac → VPS effacerait ses rendus non rapatriés)
#
# Périmètre (jamais 07_ASSETS/legacy — 8 Go hors périmètre — ni 08_ACCOUNTS/*/work, ni specs, ni ce qui est déjà dans git) :
#   07_ASSETS/screen-records/**   07_ASSETS/rushes/**   08_ACCOUNTS/*/posts/**/*.mp4|*.mov
#
# Connexion : variables VPS_HOST (obligatoire), VPS_USER (content), VPS_PATH (/home/content/app), VPS_SSH_PORT (22) —
# dans l'environnement, ou dans infra/.env (lignes VPS_HOST=… etc., fichier hors git). Exemple : VPS_HOST=203.0.113.10 ou VPS_HOST=vps.mondomaine.fr
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/infra/.env"
readenv() { [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//' || true; }
VPS_HOST="${VPS_HOST:-$(readenv VPS_HOST)}"
VPS_USER="${VPS_USER:-$(readenv VPS_USER)}"; VPS_USER="${VPS_USER:-content}"
VPS_PATH="${VPS_PATH:-$(readenv VPS_PATH)}"; VPS_PATH="${VPS_PATH:-/home/content/app}"
VPS_SSH_PORT="${VPS_SSH_PORT:-$(readenv VPS_SSH_PORT)}"; VPS_SSH_PORT="${VPS_SSH_PORT:-22}"
[ -n "$VPS_HOST" ] || { echo "VPS_HOST manquant (export VPS_HOST=… ou ligne VPS_HOST=… dans infra/.env)" >&2; exit 2; }
command -v rsync >/dev/null || { echo "rsync introuvable" >&2; exit 2; }

DIRECTION=to; DRY=""; DELETE=""; WITH_DATA=0
for arg in "$@"; do case "$arg" in
  --from-vps) DIRECTION=from ;; --to-vps) DIRECTION=to ;; --dry-run|-n) DRY="--dry-run" ;; --delete) DELETE="--delete" ;; --data) WITH_DATA=1 ;;
  -h|--help) sed -n '2,20p' "$0"; exit 0 ;; *) echo "option inconnue : $arg" >&2; exit 2 ;;
esac; done

REMOTE="$VPS_USER@$VPS_HOST:$VPS_PATH"
# options communes à rsync 3 (Linux, Homebrew) et à openrsync (macOS 15+, compatible 2.6.9 : pas de --info=progress2)
RSYNC=(rsync -a -z --partial --progress --stats --human-readable --exclude='.DS_Store' --exclude='._*' -e "ssh -p $VPS_SSH_PORT" $DRY $DELETE)
# Filtres pour 08_ACCOUNTS : seulement les vidéos des posts (les JPEG et specs sont dans git ; work/ reste local)
ACC_FILTERS=(--exclude='work/' --exclude='specs/' --include='*/' --include='*.mp4' --include='*.MP4' --include='*.mov' --include='*.MOV' --exclude='*' --prune-empty-dirs)

echo "== sync-media : $([ "$DIRECTION" = to ] && echo "Mac → $REMOTE" || echo "$REMOTE → Mac") ${DRY:+(à blanc) }${DELETE:+(avec suppression) }"
if [ "$DIRECTION" = to ]; then
  echo "-- 07_ASSETS/screen-records";  "${RSYNC[@]}" "$ROOT/07_ASSETS/screen-records/" "$REMOTE/07_ASSETS/screen-records/"
  echo "-- 07_ASSETS/rushes";          "${RSYNC[@]}" "$ROOT/07_ASSETS/rushes/"         "$REMOTE/07_ASSETS/rushes/"
  echo "-- 08_ACCOUNTS/*/posts (vidéos)"; "${RSYNC[@]}" "${ACC_FILTERS[@]}" "$ROOT/08_ACCOUNTS/" "$REMOTE/08_ACCOUNTS/"
  if [ "$WITH_DATA" = 1 ]; then
    for d in raw tiktok videos instagram; do
      [ -d "$ROOT/infra/data/$d" ] || continue
      echo "-- infra/data/$d"; "${RSYNC[@]}" --exclude='*.mp4' --exclude='*.work/' "$ROOT/infra/data/$d/" "$REMOTE/infra/data/$d/"
    done
  fi
  echo "→ sur le VPS, le rendu des specs en attente reprend au prochain passage du timer (ou : sudo systemctl start content-render-pending)"
else
  echo "-- 08_ACCOUNTS/*/posts (vidéos rendues sur le VPS)"; "${RSYNC[@]}" "${ACC_FILTERS[@]}" "$REMOTE/08_ACCOUNTS/" "$ROOT/08_ACCOUNTS/"
  echo "-- 07_ASSETS/rushes (au cas où)"; "${RSYNC[@]}" "$REMOTE/07_ASSETS/rushes/" "$ROOT/07_ASSETS/rushes/"
  echo "→ les JPEG des carrousels et les fiches EXP arrivent, eux, par git pull"
fi
echo "== fin"
