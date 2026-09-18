#!/usr/bin/env bash
# Extrait le DÉPÔT-MODÈLE depuis une instance : framework + templates/ + workspace vierge (placeholders intacts),
# sans aucune donnée de l'instance. Prêt à être poussé sur GitHub comme « template repository ».
#
#   templates/make-template.sh <dossier-cible>     # inexistant ou vide (refus d'écraser)
#
# Contenu produit : CLAUDE.md, README.md, .claude/, 00_AGENT/SOP/, 00_AGENT/SCORING.md, 00_AGENT/CREATIVE_FRAMEWORK.md,
# infra/ (code, fonts, scripts ; sans data/, .env, .venv/, bin/, models/, node_modules/, config/*.json réels), deploy/ (si présent),
# templates/ (README, new-project.sh, make-template.sh, workspace/), .gitignore, .gitattributes (si présent), puis les fichiers de
# templates/workspace/ copiés à la racine tels quels ({{APP_NAME}}…), infra/config/*.json.example, infra/data/** vides.
# La note de travail templates/_GENERICISATION_A_FAIRE.md n'est PAS copiée (elle concerne l'instance d'origine).
#
# À la fin : grep des chaînes propres à l'instance d'origine (noms d'app, handles, prénom) dans le dossier cible ;
# les fichiers du framework qui en contiennent encore sont listés (à nettoyer à la main) et le script sort avec le code 1.
#   --lean                  ne PAS copier le workspace à la racine (framework + templates/ seulement) : recommandé si les instances
#                           doivent suivre le framework par `git merge` (aucun fichier d'instance dans le modèle = aucun conflit hors framework)
#   --strings "mot1,mot2"   remplace la liste déduite de l'instance (insensible à la casse). Par défaut : nom de l'app et ses mots
#                           de ≥ 5 lettres (hors mot de l'unité de contenu), slug (≥ 3 caractères), handles de infra/config/accounts.json,
#                           prénom de l'humain (00_AGENT/MISSION.md → owner:)
#   --no-git                ne pas faire git init + commit dans le dossier cible
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Chaînes propres à l'instance d'origine, déduites de sa configuration (aucune valeur d'instance écrite ici)
default_strings() {
  local pj="$SRC/infra/config/project.json" aj="$SRC/infra/config/accounts.json" out="" owner=""
  if command -v node >/dev/null && [ -f "$pj" ]; then
    out="$(node -e '
      const fs = require("fs"); const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); const set = new Set();
      const item = []; for (const k of ["item", "item_plural"]) { const v = p.vocabulary?.[k]; if (!v) continue; for (const x of (typeof v === "string" ? [v] : Object.values(v))) item.push(String(x).toLowerCase()); }
      if (p.name) { set.add(String(p.name).toLowerCase()); for (const w of String(p.name).toLowerCase().split(/[^\p{L}\p{N}]+/u)) if (w.length >= 5 && !item.includes(w)) set.add(w); }
      if (p.slug && String(p.slug).length >= 3) set.add(String(p.slug).toLowerCase());
      try { const a = JSON.parse(fs.readFileSync(process.argv[2], "utf8")); for (const acc of Object.values(a.accounts || {})) if (acc.handle) set.add(String(acc.handle).toLowerCase()); } catch {}
      console.log([...set].join(","));
    ' "$pj" "$aj" 2>/dev/null || true)"
  fi
  owner="$(sed -n 's/^owner:[[:space:]]*"\{0,1\}\([^"#]*\)"\{0,1\}.*$/\1/p' "$SRC/00_AGENT/MISSION.md" 2>/dev/null | head -1 | sed 's/[[:space:]]*$//')"
  if [ -n "$owner" ] && [ "$owner" != "null" ]; then out="${out:+$out,}$(printf '%s' "$owner" | tr '[:upper:]' '[:lower:]')"; fi
  printf '%s' "$out"
}
TARGET=""; STRINGS=""; DO_GIT=1; LEAN=0
while [ $# -gt 0 ]; do case "$1" in
  --strings) STRINGS="$2"; shift 2;;
  --no-git) DO_GIT=0; shift;;
  --lean) LEAN=1; shift;;
  -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0;;
  *) [ -z "$TARGET" ] && TARGET="$1" || { echo "argument inattendu : $1" >&2; exit 2; }; shift;;
esac; done
[ -n "$TARGET" ] || { sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2; }
[ -n "$STRINGS" ] || STRINGS="$(default_strings)"
WS="$SRC/templates/workspace"; [ -d "$WS" ] || { echo "templates/workspace/ introuvable dans $SRC" >&2; exit 1; }
if [ -e "$TARGET" ]; then
  [ -d "$TARGET" ] || { echo "$TARGET existe et n'est pas un dossier" >&2; exit 1; }
  [ -z "$(ls -A "$TARGET")" ] || { echo "$TARGET n'est pas vide : refus d'écraser" >&2; exit 1; }
fi
mkdir -p "$TARGET"; TARGET="$(cd "$TARGET" && pwd)"
case "$TARGET" in "$SRC"|"$SRC"/*) echo "le dossier cible ne peut pas être dans le dépôt source" >&2; exit 1;; esac
echo "→ Source : $SRC"; echo "→ Dépôt-modèle : $TARGET"

# ---- 1. Framework ----
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

# ---- 2. Workspace vierge à la racine, placeholders intacts ----
if [ $LEAN = 1 ]; then echo "2. Workspace : non copié à la racine (--lean) ; les gabarits restent dans templates/workspace/"
else echo "2. Workspace vierge à la racine (placeholders conservés)"; cp -R "$WS/." "$TARGET/"; fi
for d in accounts ads dashboard/runs instagram media publish/daily publish/jobs raw/tiktok raw/instagram render tiktok/authors videos; do
  mkdir -p "$TARGET/infra/data/$d"; : > "$TARGET/infra/data/$d/.gitkeep"
done
find "$TARGET" -name .DS_Store -delete 2>/dev/null || true

# ---- 3. Vérification : plus aucune donnée de l'instance d'origine ----
hits=""
if [ -z "$STRINGS" ]; then echo "3. Vérification : aucune chaîne d'instance déduite (pas de infra/config/project.json ?) — passer --strings \"mot1,mot2\""; else
echo "3. Vérification (chaînes : $STRINGS)"
pattern="$(printf '%s' "$STRINGS" | sed 's/,/|/g')"
hits="$(cd "$TARGET" && grep -rIliE --exclude-dir=.git --exclude-dir=node_modules -- "$pattern" . | sed 's|^\./||' | sort || true)"
fi
if [ -n "$hits" ]; then
  echo "   ✗ fichiers contenant encore une chaîne de l'instance d'origine (à nettoyer à la main, ce script ne les modifie pas) :"
  while IFS= read -r f; do
    n="$(grep -ciE -- "$pattern" "$TARGET/$f" || true)"; echo "     - $f ($n ligne(s))"
  done <<< "$hits"
else
  echo "   ✓ aucune chaîne de l'instance d'origine"
fi

# ---- 4. git ----
if [ $DO_GIT = 1 ]; then
  ( cd "$TARGET" && git init -q && git add -A && find infra/data -name .gitkeep -print0 | xargs -0 git add -f \
    && git -c user.name="content-agent" -c user.email="content-agent@localhost" commit -q -m "Dépôt-modèle : framework + gabarits d'instance" )
  echo "4. git init + premier commit"
fi
echo
echo "✓ Dépôt-modèle dans $TARGET"
echo "  Publier : cd \"$TARGET\" && git remote add origin <url> && git push -u origin main   (puis GitHub → Settings → Template repository)"
echo "  Instancier : templates/new-project.sh <dossier> \"<Nom>\" <slug>   ou, dans un clone du modèle : templates/new-project.sh --here \"<Nom>\" <slug>"
[ -z "$hits" ] || exit 1
