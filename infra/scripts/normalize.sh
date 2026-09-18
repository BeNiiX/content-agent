#!/usr/bin/env bash
# Normalise une vidéo pour TikTok / Reels : 1080x1920 (letterbox si besoin), H.264, AAC, 30 fps, faststart.
# Usage : scripts/normalize.sh in.mov out.mp4
set -euo pipefail
in="$1"; out="$2"
ffmpeg -y -i "$in" \
  -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=#222222,fps=30,format=yuv420p" \
  -c:v libx264 -preset medium -crf 20 -profile:v high -level 4.1 \
  -c:a aac -b:a 160k -ar 44100 -movflags +faststart "$out"
echo "→ $out"; ffprobe -v error -show_entries stream=width,height,r_frame_rate,duration -of default=nw=1 "$out"
