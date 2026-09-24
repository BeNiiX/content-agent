#!/usr/bin/env bash
# Installation / mise à jour du runtime VPS (Ubuntu 24.04). Idempotent : relançable après un git pull ou une modification des unités.
#
#   sudo bash /home/content/app/deploy/install.sh
#
# Pré-requis : le dépôt est déjà cloné dans APP_DIR par l'utilisateur APP_USER (voir deploy/README.md, étapes 1 à 3).
# Variables (facultatives) :
#   APP_USER=content                 utilisateur d'exécution (créé s'il n'existe pas)
#   APP_DIR=/home/content/app        racine du dépôt cloné
#   TIMEZONE=Europe/Paris            fuseau du système (vide = ne pas toucher) ; les timers portent de toute façon leur propre fuseau
#   INSTALL_WHISPER=0                1 = pip install openai-whisper dans le venv (~2 Go avec torch ; transcription seulement, voir README)
#   GIT_USER_NAME / GIT_USER_EMAIL   identité git de l'utilisateur d'exécution (commits « chore(vps) »)
#   SKIP_CADDY=0                     1 = ne pas installer / configurer Caddy
#   SKIP_CLAUDE=0                    1 = ne pas installer Claude Code CLI
set -euo pipefail

APP_USER="${APP_USER:-content}"
APP_DIR="${APP_DIR:-/home/$APP_USER/app}"
TIMEZONE="${TIMEZONE-Europe/Paris}"
INSTALL_WHISPER="${INSTALL_WHISPER:-0}"
SKIP_CADDY="${SKIP_CADDY:-0}"
SKIP_CLAUDE="${SKIP_CLAUDE:-0}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA="$APP_DIR/infra"
export DEBIAN_FRONTEND=noninteractive

say()  { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
ok()   { printf '   \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '   \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
as_user() { sudo -u "$APP_USER" -H env PATH="/home/$APP_USER/.local/bin:$INFRA/.venv/bin:/usr/local/bin:/usr/bin:/bin" "$@"; }

[ "$(id -u)" = 0 ] || die "à lancer en root : sudo bash $0"
grep -qi ubuntu /etc/os-release || warn "testé sur Ubuntu 24.04 ; autre distribution détectée, on continue"
[ -f "$APP_DIR/CLAUDE.md" ] && [ -d "$INFRA" ] || die "dépôt introuvable dans $APP_DIR (cloner d'abord, voir deploy/README.md)"

# ---------------------------------------------------------------------------------------------------------------------
say "1/9 Utilisateur $APP_USER"
if id "$APP_USER" >/dev/null 2>&1; then ok "existe"; else
  adduser --disabled-password --gecos "content runtime" "$APP_USER"; ok "créé (sans mot de passe : accès par clé SSH ou sudo -u)"
fi
chmod 750 "/home/$APP_USER"          # Caddy (groupe) doit pouvoir traverser le home pour servir les médias
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ---------------------------------------------------------------------------------------------------------------------
say "2/9 Paquets système"
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
  ca-certificates curl gnupg git rsync ffmpeg python3 python3-venv python3-pip util-linux \
  fonts-dejavu-core fontconfig locales tzdata jq openssl >/dev/null
ok "git, rsync, ffmpeg ($(ffmpeg -version | head -1 | cut -d' ' -f3)), python3 ($(python3 --version | cut -d' ' -f2)), flock"
if [ -n "$TIMEZONE" ]; then timedatectl set-timezone "$TIMEZONE" 2>/dev/null && ok "fuseau système : $TIMEZONE" || warn "timedatectl indisponible, fuseau inchangé"; fi
locale-gen C.UTF-8 >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------------------------------------------------
say "3/9 Node 22 (NodeSource)"
if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ]; then ok "node $(node -v) déjà présent"; else
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null; ok "node $(node -v) installé (/usr/bin/node)"
fi
# aucune dépendance npm : pas de npm install

# ---------------------------------------------------------------------------------------------------------------------
say "4/9 yt-dlp (binaire autonome, se met à jour avec : sudo yt-dlp -U)"
if command -v yt-dlp >/dev/null; then yt-dlp -U >/dev/null 2>&1 || true; ok "yt-dlp $(yt-dlp --version)"; else
  curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
  chmod a+rx /usr/local/bin/yt-dlp; ok "yt-dlp $(yt-dlp --version) installé dans /usr/local/bin"
fi

# ---------------------------------------------------------------------------------------------------------------------
say "5/9 Python venv + Pillow ($INFRA/.venv)"
[ -x "$INFRA/.venv/bin/python" ] || as_user python3 -m venv "$INFRA/.venv"
as_user "$INFRA/.venv/bin/pip" install -q --upgrade pip pillow edge-tts >/dev/null   # edge-tts : version « avec voix » des créas (src/lib/variants.js)
ok "Pillow $(as_user "$INFRA/.venv/bin/python" -c 'import PIL; print(PIL.__version__)')"
if [ "$INSTALL_WHISPER" = 1 ]; then as_user "$INFRA/.venv/bin/pip" install -q openai-whisper >/dev/null && ok "openai-whisper installé (transcribe.js utilisera \`whisper\` via le PATH du venv)"; fi
# Polices : le dépôt embarque infra/fonts/ (DM Sans, Montserrat) lues directement par Pillow → rien à installer.
# Non disponibles sous Linux : whisper-cpp + models/ggml-small.bin et bin/ocr (Vision macOS) → src/extract.js reste une étape Mac (voir README).

# ---------------------------------------------------------------------------------------------------------------------
say "6/9 Dossiers de données, .env, identité git"
as_user mkdir -p "$INFRA"/data/{raw/tiktok,raw/instagram,videos,media,tiktok/authors,instagram,ads,accounts,publish/jobs,publish/daily,dashboard/runs,render,git-sync,veille}
if [ -f "$INFRA/.env" ]; then ok ".env présent (non modifié)"; else as_user cp "$INFRA/.env.example" "$INFRA/.env"; warn ".env créé depuis .env.example → à compléter (NTFY_TOPIC, PUBLISH_BACKEND, POSTFORME_API_KEY…)"; fi
chmod 600 "$INFRA/.env"
if [ -n "${GIT_USER_NAME:-}" ] && [ -n "${GIT_USER_EMAIL:-}" ]; then
  as_user git config --global user.name "$GIT_USER_NAME"; as_user git config --global user.email "$GIT_USER_EMAIL"; ok "identité git : $GIT_USER_NAME <$GIT_USER_EMAIL>"
elif as_user git config --global user.email >/dev/null 2>&1; then ok "identité git : $(as_user git config --global user.name) <$(as_user git config --global user.email)>"
else warn "identité git absente : sudo -u $APP_USER git config --global user.name '…' ; user.email '…' (même e-mail que le compte GitHub, voir README § git)"; fi
as_user git config --global pull.rebase true
as_user git config --global rebase.autoStash true
as_user git -C "$APP_DIR" config core.fileMode false   # rsync depuis le Mac ne doit pas créer de diffs de permissions

# ---------------------------------------------------------------------------------------------------------------------
say "7/9 Claude Code CLI (installateur natif, ~/.local/bin/claude, mises à jour automatiques)"
if [ "$SKIP_CLAUDE" = 1 ]; then warn "ignoré (SKIP_CLAUDE=1)"; else
  if as_user test -x "/home/$APP_USER/.local/bin/claude"; then as_user claude update >/dev/null 2>&1 || true; ok "claude $(as_user claude --version 2>/dev/null | head -1)"; else
    as_user bash -c 'curl -fsSL https://claude.ai/install.sh | bash' >/dev/null
    ok "claude $(as_user claude --version 2>/dev/null | head -1) installé"
  fi
  if as_user claude auth status >/dev/null 2>&1; then ok "session Claude valide"; else warn "pas de session : sudo -iu $APP_USER claude auth login  (voir README § login)"; fi
fi

# ---------------------------------------------------------------------------------------------------------------------
say "8/9 Unités systemd (content-*)"
# Heures et fuseau : infra/config/project.json (timezone, daily_hour = envoi du soir, stats_hour = relevé quotidien, weekly_veille.{weekday,hour}) s'il existe, sinon les valeurs des fichiers .timer
PJ="$INFRA/config/project.json"; TZ_UNITS="Europe/Paris"; DAILY_H=18; DAILY_M=0; STATS_H=7; WEEK_D=1; VEILLE_H=6
if [ -f "$PJ" ] && command -v node >/dev/null; then
  read -r TZ_UNITS DAILY_H DAILY_M STATS_H WEEK_D VEILLE_H < <(node -e 'const p=require(process.argv[1]);const v=p.weekly_veille||p.weekly_stats||{};console.log(p.timezone||"Europe/Paris",p.daily_hour??18,p.daily_minute??0,p.stats_hour??7,v.weekday??1,v.hour??6)' "$PJ" 2>/dev/null) || true
  : "${TZ_UNITS:=Europe/Paris}" "${DAILY_H:=18}" "${DAILY_M:=0}" "${STATS_H:=7}" "${WEEK_D:=1}" "${VEILLE_H:=6}"
fi
case "$WEEK_D" in 0|7) WEEK_DAY=Sun ;; 2) WEEK_DAY=Tue ;; 3) WEEK_DAY=Wed ;; 4) WEEK_DAY=Thu ;; 5) WEEK_DAY=Fri ;; 6) WEEK_DAY=Sat ;; *) WEEK_DAY=Mon ;; esac   # 1 = lundi (convention launchd / project.json)
for f in "$HERE"/systemd/content-*.service "$HERE"/systemd/content-*.timer; do
  # adaptation si APP_USER / APP_DIR ne sont pas ceux par défaut, puis heures / fuseau du projet (une règle d'heure par timer, pour ne pas
  # réécrire deux fois la même ligne quand deux timers se retrouvent à la même heure)
  case "$(basename "$f")" in
    content-daily-drafts.timer)  HOUR_RULE="s#^\$##" ;;   # toutes les 5 min : l'heure est lue par src/publish/due.js dans project.json
    content-daily-stats.timer)   HOUR_RULE="s#^OnCalendar=\*-\*-\* 07:00:00 Europe/Paris#OnCalendar=*-*-* $(printf '%02d' "$STATS_H"):00:00 $TZ_UNITS#" ;;
    content-weekly-veille.timer) HOUR_RULE="s#^OnCalendar=Mon \*-\*-\* 06:00:00 Europe/Paris#OnCalendar=$WEEK_DAY *-*-* $(printf '%02d' "$VEILLE_H"):00:00 $TZ_UNITS#" ;;
    content-auth-check.timer)    HOUR_RULE="s#^OnCalendar=\*-\*-\* 09:00:00 Europe/Paris#OnCalendar=*-*-* 09:00:00 $TZ_UNITS#" ;;
    *)                           HOUR_RULE="s#^OnCalendar=\(.*\) Europe/Paris\$#OnCalendar=\1 $TZ_UNITS#" ;;
  esac
  sed -e "s#/home/content/app#$APP_DIR#g" -e "s#^User=content#User=$APP_USER#" -e "s#^Group=content#Group=$APP_USER#" -e "s#/home/content/#/home/$APP_USER/#g" \
      -e "$HOUR_RULE" \
      -e "s#^Environment=TZ=Europe/Paris#Environment=TZ=$TZ_UNITS#" "$f" > "/etc/systemd/system/$(basename "$f")"
done
ok "envoi du soir $(printf '%02d' "$DAILY_H"):$(printf '%02d' "$DAILY_M") (garde due.js, modifiable depuis le tableau de bord) · relevé quotidien $(printf '%02d' "$STATS_H"):00 · veille $WEEK_DAY $(printf '%02d' "$VEILLE_H"):00 · fuseau $TZ_UNITS (source : ${PJ#$APP_DIR/}, ou défauts)"
chmod +x "$HERE"/*.sh "$INFRA"/scripts/*.sh 2>/dev/null || true
systemctl daemon-reload
systemctl enable --now content-dashboard.service >/dev/null 2>&1 && ok "content-dashboard (127.0.0.1:4747) : $(systemctl is-active content-dashboard)" || warn "content-dashboard : journalctl -u content-dashboard"
for t in content-daily-drafts content-weekly-veille content-daily-stats content-render-pending content-git-sync content-auth-check; do
  systemctl enable --now "$t.timer" >/dev/null 2>&1 && ok "$t.timer activé" || warn "$t.timer : systemctl status $t.timer"
done

# ---------------------------------------------------------------------------------------------------------------------
say "9/9 Caddy (HTTPS automatique, auth basique, médias)"
if [ "$SKIP_CADDY" = 1 ]; then warn "ignoré (SKIP_CADDY=1)"; else
  if ! command -v caddy >/dev/null; then
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq; apt-get install -y -qq caddy >/dev/null
  fi
  ok "caddy $(caddy version | cut -d' ' -f1)"
  usermod -aG "$APP_USER" caddy                       # lecture des médias (home en 750, fichiers en 644)
  mkdir -p /etc/systemd/system/caddy.service.d /var/log/caddy; chown caddy:caddy /var/log/caddy
  printf '[Service]\nEnvironmentFile=-/etc/caddy/env\n' > /etc/systemd/system/caddy.service.d/env.conf
  if [ ! -f /etc/caddy/env ]; then
    PW="$(openssl rand -base64 18 2>/dev/null || head -c 24 /dev/urandom | base64)"
    HASH="$(caddy hash-password --plaintext "$PW")"
    sed -e "s#^DASH_HASH=.*#DASH_HASH=$HASH#" -e "s#^MEDIA_TOKEN=.*#MEDIA_TOKEN=$(openssl rand -hex 24)#" "$HERE/caddy.env.example" > /etc/caddy/env
    chmod 640 /etc/caddy/env; chown root:caddy /etc/caddy/env
    DASH_USER_VAL="$(grep -E '^DASH_USER=' /etc/caddy/env | cut -d= -f2)"; DASH_USER_VAL="${DASH_USER_VAL:-admin}"
    printf '\n   \033[1;33mMot de passe du tableau de bord (utilisateur %s) : %s\033[0m\n   (à noter maintenant ; pour en changer : caddy hash-password --plaintext … → DASH_HASH dans /etc/caddy/env ; utilisateur : DASH_USER)\n\n' "$DASH_USER_VAL" "$PW"
    warn "DOMAIN=localhost dans /etc/caddy/env : mettre le vrai domaine puis sudo systemctl restart caddy"
  else ok "/etc/caddy/env présent (non modifié)"; fi
  if [ -f /etc/caddy/Caddyfile ] && ! grep -q "tableau de bord + serveur de médias du VPS content" /etc/caddy/Caddyfile; then
    cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak-$(date +%F)"; warn "ancien /etc/caddy/Caddyfile sauvegardé"
  fi
  sed -e "s#/home/content/app#$APP_DIR#g" "$HERE/Caddyfile" > /etc/caddy/Caddyfile
  if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile --envfile /etc/caddy/env >/dev/null 2>&1; then
    systemctl daemon-reload; systemctl enable caddy >/dev/null 2>&1; systemctl restart caddy; ok "caddy : $(systemctl is-active caddy) (DOMAIN=$(grep -E '^DOMAIN=' /etc/caddy/env | cut -d= -f2))"
  else warn "Caddyfile invalide avec /etc/caddy/env : caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile --envfile /etc/caddy/env"; fi
fi

# ---------------------------------------------------------------------------------------------------------------------
say "Terminé"
cat <<EOF
   Prochaines étapes (détail dans deploy/README.md) :
   1. Session Claude (une fois, puis à chaque expiration) : sudo -iu $APP_USER claude auth login   (revues headless ; l'envoi du soir n'en a pas besoin)
   2. Compléter $INFRA/.env (NOTIFY_CHANNEL / NTFY_TOPIC, PUBLISH_BACKEND, POSTFORME_API_KEY…)
   3. Depuis le Mac : deploy/sync-media.sh  (screen-records, rushs, MP4 des posts)
   4. Vérifier : sudo -iu $APP_USER bash -c 'cd $INFRA && node src/doctor.js && node src/produce/render-pending.js --dry-run && bash scripts/daily-drafts.sh --dry-run'
   5. systemctl list-timers 'content-*'   ·   journalctl -u content-daily-drafts -n 50
EOF
