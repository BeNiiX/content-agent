#!/usr/bin/env bash
# Synchro git du VPS (content-git-sync.timer toutes les 10 min, et avant/après chaque job) :
#   1. commit des fichiers d'état que les jobs modifient (fiches EXP, QUEUE, STATS, digests, JPEG rendus, accounts.json, 02_VEILLE)
#   2. git pull --rebase --autostash  (les routines cloud et le Mac poussent sur la même branche)
#   3. git push (sauf --no-push)
# Deux familles d'échec, traitées différemment (22/09 : une clé refusée par GitHub était annoncée comme un conflit) :
#   - GitHub injoignable (clé refusée, DNS, coupure, 5xx) : on retente au passage suivant et on n'alerte qu'après
#     TRANSIENT_MAX ratés d'affilée (compteur remis à zéro dès qu'un pull passe) ;
#   - vrai conflit de rebase : rebase annulé (git rebase --abort) et alerte immédiate, à résoudre à la main.
# Les alertes partent via daily-notify.js --alert (titre d'alerte, priorité haute) ; le script sort en erreur dans les deux cas.
# Jamais de push --force. Rien n'est ajouté hors de la liste PATHS ci-dessous (les MP4/MOV sont de toute façon ignorés par .gitignore).
#
# Usage : deploy/git-sync.sh [--no-push] [--quiet]
# Variables (optionnelles, sinon déduites) : APP_DIR (racine du dépôt), GIT_BRANCH (défaut : branche courante), GIT_REMOTE (origin)
set -u
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
INFRA="$APP_DIR/infra"
REMOTE="${GIT_REMOTE:-origin}"
LOCK="$INFRA/data/content.lock"
STAMP_DIR="$INFRA/data/git-sync"
FAILS="$STAMP_DIR/remote-fails"          # ratés réseau / auth consécutifs
TRANSIENT_MAX="${GIT_SYNC_TRANSIENT_MAX:-3}"   # 3 passages du timer ≈ 30 min avant d'alerter
NO_PUSH=0; QUIET=0
for arg in "$@"; do case "$arg" in --no-push) NO_PUSH=1 ;; --quiet) QUIET=1 ;; *) echo "option inconnue : $arg" >&2; exit 2 ;; esac; done
say() { [ "$QUIET" = 1 ] || echo "[git-sync $(date '+%F %T')] $*"; }

# Fichiers que les jobs du VPS écrivent (pathspecs git : `*` traverse aussi les `/`).
PATHS=(
  "04_EXPERIMENTS/*.md"
  "06_CALENDAR"
  "08_ACCOUNTS/*/STATS.md"
  "08_ACCOUNTS/*/POSTS.md"
  "08_ACCOUNTS/*/TEXTES.md"
  "08_ACCOUNTS/*/specs/*.json"
  "08_ACCOUNTS/*/LEARNINGS.md"
  "08_ACCOUNTS/*/posts/*.jpg"
  "08_ACCOUNTS/*/posts/*.jpeg"
  "infra/config/accounts.json"
  "infra/config/project.json"
  "02_VEILLE"
  "01_BRAND/ACCOUNTS.md"
)

mkdir -p "$INFRA/data" "$STAMP_DIR"
cd "$APP_DIR" || { echo "APP_DIR introuvable : $APP_DIR" >&2; exit 2; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "$APP_DIR n'est pas un dépôt git" >&2; exit 2; }

# Verrou partagé avec render-pending / daily-drafts / daily-stats (flock dans les unités systemd)
exec 9>"$LOCK"
if ! flock -w 120 9; then say "verrou occupé (un job tourne), on réessaie au prochain passage"; exit 0; fi

notify() {
  # au plus une notification toutes les 6 h pour ne pas spammer le téléphone
  local stamp="$STAMP_DIR/last-notify" now; now=$(date +%s)
  if [ -f "$stamp" ] && [ $((now - $(cat "$stamp" 2>/dev/null || echo 0))) -lt 21600 ]; then say "(notification déjà envoyée il y a moins de 6 h)"; return; fi
  echo "$now" > "$stamp"
  (cd "$INFRA" && node src/publish/daily-notify.js --alert "git-sync VPS : $1" >/dev/null 2>&1) || say "notification impossible (NOTIFY_CHANNEL ?)"
}

# GitHub injoignable : pas un conflit, ça se règle tout seul la plupart du temps.
TRANSIENT_RE='Permission denied|Could not read from remote repository|Could not resolve host|Connection (timed out|refused|reset|closed)|Operation timed out|ssh_exchange_identification|kex_exchange_identification|early EOF|RPC failed|remote end hung up|unable to access|Temporary failure in name resolution|HTTP (429|5[0-9][0-9])|Service Unavailable|Bad gateway'

GIT_OUT=""
git_try() { GIT_OUT=$("$@" 2>&1); local rc=$?; [ "$QUIET" = 1 ] || { [ -n "$GIT_OUT" ] && printf '%s\n' "$GIT_OUT"; }; return $rc; }
fails() { cat "$FAILS" 2>/dev/null || echo 0; }

# Échec d'une opération distante. $1 = étape, $2 = ligne de journal, $3 = message d'alerte si ce n'est PAS un raté réseau.
remote_fail() {
  if printf '%s' "$GIT_OUT" | grep -qE "$TRANSIENT_RE"; then
    local n; n=$(( $(fails) + 1 )); echo "$n" > "$FAILS"
    say "$1 : GitHub injoignable ($n/$TRANSIENT_MAX), nouvel essai au prochain passage"
    if [ "$n" -ge "$TRANSIENT_MAX" ]; then
      notify "GitHub injoignable depuis $n passages ($1) : vérifier le réseau et la clé de déploiement (ssh content@<vps>, puis ssh -T git@github.com)"
    fi
  else
    say "$2"
    notify "$3"
  fi
  exit 1
}

BRANCH="${GIT_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null)}"
if [ -z "$BRANCH" ] || [ "$BRANCH" = "HEAD" ]; then say "HEAD détachée ou branche inconnue : rien à faire"; exit 2; fi

# Un rebase laissé en plan par un passage précédent ? On repart propre.
if [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]; then
  say "rebase inachevé détecté → git rebase --abort"; git rebase --abort || true
fi

# 1. Commit local des fichiers d'état
for p in "${PATHS[@]}"; do git add -A -- "$p" 2>/dev/null || true; done
if ! git diff --cached --quiet; then
  n=$(git diff --cached --name-only | wc -l | tr -d ' ')
  git commit -q -m "chore(vps): état du $(date '+%F %H:%M') ($n fichier(s))" || { say "commit impossible (identité git ? voir deploy/README.md § git)"; exit 1; }
  say "commit : $n fichier(s)"
else
  say "rien à committer"
fi

# 2. Pull --rebase (autostash pour les modifications hors PATHS, ex. un .md en cours d'édition)
if ! git_try git fetch -q "$REMOTE" "$BRANCH"; then
  remote_fail "fetch" "fetch impossible" "fetch impossible ($REMOTE/$BRANCH) : dépôt ou branche introuvable ?"
fi
if ! git_try git pull -q --rebase --autostash "$REMOTE" "$BRANCH"; then
  git rebase --abort 2>/dev/null || true   # l'autostash est réappliqué par l'abort
  remote_fail "rebase" "CONFLIT au rebase → abandon" "conflit git au rebase sur $BRANCH : à résoudre à la main (ssh, cd $APP_DIR, git status)"
fi
rm -f "$FAILS"   # GitHub répond : compteur de ratés remis à zéro

# 3. Push (jamais --force). Si quelqu'un a poussé entre-temps : un seul nouvel essai après rebase.
[ "$NO_PUSH" = 1 ] && { say "synchro faite (sans push)"; exit 0; }
if [ "$(git rev-list --count "$REMOTE/$BRANCH..HEAD" 2>/dev/null || echo 0)" = "0" ]; then say "rien à pousser"; exit 0; fi
if git_try git push -q "$REMOTE" "HEAD:$BRANCH"; then say "push ok"; exit 0; fi
say "push refusé, nouvel essai après rebase"
if git_try git pull -q --rebase --autostash "$REMOTE" "$BRANCH" && git_try git push -q "$REMOTE" "HEAD:$BRANCH"; then say "push ok (2e essai)"; exit 0; fi
git rebase --abort 2>/dev/null || true
remote_fail "push" "push impossible" "push impossible sur $BRANCH après 2 essais (clé en lecture seule ? branche protégée ?)"
