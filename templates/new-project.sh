#!/usr/bin/env bash
# Crée un projet « agent de contenu » vierge pour une nouvelle app, à partir de ce dépôt (framework + gabarits).
#
#   templates/new-project.sh <dossier-cible> "<Nom de l'app>" <slug> [<unité> [<unités>]]
#   templates/new-project.sh --here        "<Nom de l'app>" <slug> [<unité> [<unités>]]   # dans un clone du dépôt-modèle
#
#   <dossier-cible>  inexistant ou vide (le script refuse d'écraser) ; --here = instancier CE dépôt en place
#                    (uniquement s'il est encore vierge : produit par make-template.sh, avec ou sans --lean, ou « Use this template »)
#   <slug>           court, [a-z0-9-] : préfixe des comptes (<slug>-main), labels launchd, nom du projet
#   <unité>          unité de contenu au singulier (ex. « opinion », « question », « dilemme ») — défaut : carte
#   <unités>         pluriel — défaut : <unité>s
#
# Framework copié (liste explicite) : CLAUDE.md, README.md, .claude/, 00_AGENT/SOP/, 00_AGENT/SCORING.md,
# 00_AGENT/CREATIVE_FRAMEWORK.md, infra/ (sans data/, .env, .venv/, bin/, models/, node_modules/, config/*.json réels),
# deploy/ (si présent), templates/, .gitignore, .gitattributes (si présent).
# Puis templates/workspace/ (docs d'instance vierges) avec substitution des placeholders :
#   {{APP_NAME}} {{APP_SLUG}} {{ITEM}} {{ITEM_PLURAL}} {{ACCOUNT_SLUG}} (= <slug>-main) {{HANDLE}} (= @<slug>) {{DATE}} (= aujourd'hui)
# Les *.example de infra/config/ deviennent les fichiers réels ; infra/data/** est créé vide (.gitkeep) ; git init + premier
# commit dans le dossier CIBLE uniquement. Idempotent : relancer sur un dossier vide donne le même résultat ; refuse un dossier plein.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-}"; APP_NAME="${2:-}"; APP_SLUG="${3:-}"; ITEM="${4:-carte}"; ITEM_PLURAL="${5:-${ITEM}s}"
usage() { sed -n '2,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2; }
[ -n "$TARGET" ] && [ -n "$APP_NAME" ] && [ -n "$APP_SLUG" ] || usage
[[ "$APP_SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "slug invalide « $APP_SLUG » : [a-z0-9-] seulement" >&2; exit 2; }
[ -d "$SRC/templates/workspace" ] || { echo "templates/workspace/ introuvable dans $SRC" >&2; exit 1; }
WS="$SRC/templates/workspace"

HERE=0
if [ "$TARGET" = "--here" ]; then
  HERE=1; TARGET="$SRC"
  # Dépôt-modèle vierge = MISSION.md absent (modèle --lean) ou encore porteur de placeholders ; sinon c'est une instance déjà remplie.
  if [ -e "$SRC/00_AGENT/MISSION.md" ] && ! grep -q '{{APP_NAME}}' "$SRC/00_AGENT/MISSION.md"; then
    echo "ce dépôt est déjà une instance (00_AGENT/MISSION.md sans placeholder) : utiliser <dossier-cible>" >&2; exit 1; fi
else
  if [ -e "$TARGET" ]; then
    [ -d "$TARGET" ] || { echo "$TARGET existe et n'est pas un dossier" >&2; exit 1; }
    [ -z "$(ls -A "$TARGET")" ] || { echo "$TARGET n'est pas vide : refus d'écraser" >&2; exit 1; }
  fi
  mkdir -p "$TARGET"; TARGET="$(cd "$TARGET" && pwd)"
  case "$TARGET" in "$SRC"|"$SRC"/*) echo "le dossier cible ne peut pas être dans le dépôt source" >&2; exit 1;; esac
fi

ACCOUNT_SLUG="${APP_SLUG}-main"; HANDLE="@${APP_SLUG}"; DATE="$(date +%F)"
echo "→ Projet « $APP_NAME » ($APP_SLUG) · unité : $ITEM / $ITEM_PLURAL · compte initial : $ACCOUNT_SLUG ($HANDLE)"
echo "→ Source : $SRC"; echo "→ Cible  : $TARGET$([ $HERE = 1 ] && echo ' (en place)')"

if [ $HERE = 0 ]; then
  # ---- 1. Framework (liste explicite) ----
  copy() { local rel="$1"; [ -e "$SRC/$rel" ] || { echo "   (absent : $rel)"; return 0; }
    mkdir -p "$TARGET/$(dirname "$rel")"
    if [ -d "$SRC/$rel" ]; then cp -R "$SRC/$rel" "$TARGET/$(dirname "$rel")/"; else cp "$SRC/$rel" "$TARGET/$rel"; fi
    echo "   + $rel"; }
  echo "1. Framework"
  for rel in CLAUDE.md README.md .claude 00_AGENT/SOP 00_AGENT/SCORING.md 00_AGENT/CREATIVE_FRAMEWORK.md deploy .gitignore .gitattributes; do copy "$rel"; done
  mkdir -p "$TARGET/infra"
  ( cd "$SRC/infra" && find . -mindepth 1 \
      \( -path ./data -o -path ./.venv -o -path ./bin -o -path ./models -o -path ./node_modules -o -name .DS_Store -o -name __pycache__ \) -prune -o \
      \( -path ./.env -o -path ./config/project.json -o -path ./config/accounts.json -o -path ./config/competitors.json \) -prune -o \
      -print ) | while IFS= read -r p; do
    if [ -d "$SRC/infra/$p" ]; then mkdir -p "$TARGET/infra/$p"; else mkdir -p "$TARGET/infra/$(dirname "$p")"; cp "$SRC/infra/$p" "$TARGET/infra/$p"; fi
  done
  echo "   + infra/ (sans data/, .env, .venv/, bin/, models/, node_modules/, config/*.json)"
  mkdir -p "$TARGET/templates"; cp -R "$WS" "$TARGET/templates/"
  for f in README.md new-project.sh make-template.sh; do [ -e "$SRC/templates/$f" ] && cp "$SRC/templates/$f" "$TARGET/templates/$f"; done
  echo "   + templates/ (sans _GENERICISATION_A_FAIRE.md)"
  # ---- 2a. Workspace vierge ----
  echo "2. Workspace (gabarits)"
  cp -R "$WS/." "$TARGET/"
else
  echo "1-2. Framework déjà en place (dépôt-modèle) ; fichiers du workspace absents (modèle --lean, ou ignorés par git comme ACCOUNTS_CREDENTIALS.md) recopiés depuis templates/workspace/"
  ( cd "$WS" && find . -type f ! -name .DS_Store ) | while IFS= read -r f; do
    t="$TARGET/${f#./}"; [ -e "$t" ] || { mkdir -p "$(dirname "$t")"; cp "$WS/${f#./}" "$t"; echo "   + ${f#./}"; }
  done
fi

# ---- 2b. Substitution des placeholders (fichiers du workspace uniquement, jamais le framework) ----
esc() { printf '%s' "$1" | sed -e 's/[\\|&]/\\&/g'; }   # échappe \ | & pour sed avec le délimiteur |
N="$(esc "$APP_NAME")"; S="$(esc "$APP_SLUG")"; I="$(esc "$ITEM")"; IP="$(esc "$ITEM_PLURAL")"; A="$(esc "$ACCOUNT_SLUG")"; H="$(esc "$HANDLE")"
( cd "$WS" && find . -type f ! -name .gitkeep ! -name .DS_Store ) | while IFS= read -r f; do
  t="$TARGET/${f#./}"; [ -f "$t" ] || continue
  sed -e "s|{{APP_NAME}}|$N|g" -e "s|{{APP_SLUG}}|$S|g" -e "s|{{ITEM_PLURAL}}|$IP|g" -e "s|{{ITEM}}|$I|g" \
      -e "s|{{ACCOUNT_SLUG}}|$A|g" -e "s|{{HANDLE}}|$H|g" -e "s|{{DATE}}|$DATE|g" "$t" > "$t.tmp" && mv "$t.tmp" "$t"
done
for ex in "$TARGET"/infra/config/*.example; do [ -e "$ex" ] || continue; [ -e "${ex%.example}" ] || mv "$ex" "${ex%.example}"; done
echo "   + placeholders substitués · infra/config/{project,accounts,competitors}.json"

# ---- 3. Dossiers vides ----
echo "3. infra/data/** et dossiers de travail vides (.gitkeep)"
for d in accounts ads dashboard/runs instagram media publish/daily publish/jobs raw/tiktok raw/instagram render tiktok/authors videos; do
  mkdir -p "$TARGET/infra/data/$d"; : > "$TARGET/infra/data/$d/.gitkeep"
done
mkdir -p "$TARGET/07_ASSETS/photos/_backup-fichiers-origine" "$TARGET/07_ASSETS/legacy" "$TARGET/08_ACCOUNTS/$ACCOUNT_SLUG/posts" "$TARGET/08_ACCOUNTS/$ACCOUNT_SLUG/specs" "$TARGET/08_ACCOUNTS/$ACCOUNT_SLUG/work"
: > "$TARGET/08_ACCOUNTS/$ACCOUNT_SLUG/posts/.gitkeep"; : > "$TARGET/08_ACCOUNTS/$ACCOUNT_SLUG/specs/.gitkeep"
[ -e "$TARGET/infra/.env" ] || { [ -e "$TARGET/infra/.env.example" ] && cp "$TARGET/infra/.env.example" "$TARGET/infra/.env"; }

# ---- 4. Vérification : aucun placeholder oublié hors templates/ ----
left="$(grep -rIl --exclude-dir=.git --exclude-dir=templates --exclude-dir=node_modules '{{[A-Z_]*}}' "$TARGET" || true)"
[ -z "$left" ] || { echo "placeholders non substitués :"; echo "$left"; exit 1; }

# ---- 5. git (dossier cible seulement) ----
echo "4. git"
( cd "$TARGET"
  [ -d .git ] || git init -q
  git add -A; find infra/data -name .gitkeep -print0 | xargs -0 git add -f
  git -c user.name="content-agent" -c user.email="content-agent@localhost" commit -q -m "Projet vierge « $APP_NAME » (framework + gabarits)" )
echo
echo "✓ Projet « $APP_NAME » prêt dans $TARGET"
echo "  Prochaines étapes :"
echo "   1. cd \"$TARGET/infra\" && npm run doctor        # outils, .env, données (vides : attendu)"
echo "   2. Remplir 01_BRAND/APP_CONTEXT.md, AUDIENCE.md, VOICE.md, ANGLES.md, ACCOUNTS.md ; vérifier infra/config/project.json (vocabulaire, CTA, hashtags)"
echo "   3. Adapter infra/config/accounts.json (handles, appareils) et 01_BRAND/DA/themes.json (couleurs, libellés) ; déposer 2 références dans 01_BRAND/DA/"
echo "   4. git remote add template <url-du-dépôt-modèle>   # mises à jour du framework : templates/README.md"
