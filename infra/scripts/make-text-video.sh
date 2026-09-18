#!/usr/bin/env bash
# Vidéo "opinion plein écran" (CONCEPT-003) : PNG via Pillow (infra/.venv) → MP4 1080x1920 muet, 30 fps.
# Usage : scripts/make-text-video.sh "Le thé surpasse le café." out.mp4 [durée_s=7] [sous-titre] [kicker] [verdict]
# Ex.   : scripts/make-text-video.sh "Le thé surpasse le café." out.mp4 7 "D'accord ou pas d'accord ?" "Opinion du jour" "31 % des joueurs sont d'accord"
# Défauts du sous-titre et du kicker : vocabulaire `question` / `kicker` de config/project.json (langue par défaut).
# Setup : python3 -m venv .venv && .venv/bin/pip install pillow
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; py="$here/../.venv/bin/python"; [ -x "$py" ] || py=python3
text="$1"; out="$2"; dur="${3:-7}"
def_sub="$("$py" -c 'import sys; sys.path.insert(0, sys.argv[1]); from project_config import t; print(t("question"))' "$here")"
def_kicker="$("$py" -c 'import sys; sys.path.insert(0, sys.argv[1]); from project_config import t; print(t("kicker"))' "$here")"
sub="${4:-$def_sub}"; kicker="${5:-$def_kicker}"; verdict="${6:-}"
png="$(mktemp -t text_frame).png"
"$py" "$here/render-frame.py" "$png" --text "$text" --sub "$sub" --kicker "$kicker" --verdict "$verdict" >/dev/null
ffmpeg -y -loglevel error -loop 1 -i "$png" -t "$dur" -r 30 -vf "format=yuv420p" -c:v libx264 -crf 18 -movflags +faststart "$out"
rm -f "$png"; echo "→ $out ($dur s)"
