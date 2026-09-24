#!/usr/bin/env python3
"""Rend une bulle de texte TikTok (bandeau noir arrondi, texte blanc gras, centré) en PNG transparent 1080 px de large.
Usage : render-bubble.py out.png --text "…" [--size 58] [--maxw 900] [--style bandeau|plain] [--weight Bold]"""
import argparse
from PIL import Image, ImageDraw, ImageFont
ap = argparse.ArgumentParser(); ap.add_argument("out"); ap.add_argument("--text", required=True)
ap.add_argument("--size", type=int, default=58); ap.add_argument("--maxw", type=int, default=900)
ap.add_argument("--style", default="bandeau"); ap.add_argument("--weight", default="Bold"); ap.add_argument("--font", default="")
a = ap.parse_args()
W = 1080
def load(size):
    for p in [a.font, __file__.rsplit("/", 2)[0] + "/fonts/Montserrat.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"]:
        if not p: continue
        try:
            f = ImageFont.truetype(p, size)
            try: f.set_variation_by_name(a.weight)
            except Exception: pass
            return f
        except OSError: continue
    return ImageFont.load_default()
f = load(a.size)
tmp = ImageDraw.Draw(Image.new("RGBA", (W, 10)))
lines, line = [], ""
for w in a.text.split(" "):   # espaces simples seulement : une espace insécable (U+00A0) garde « combien ? » ensemble
    if not w: continue
    t = (line + " " + w).strip()
    if tmp.textlength(t, font=f) <= a.maxw: line = t
    else: lines.append(line); line = w
lines.append(line)
lh = int(a.size * 1.28); pad_x, pad_y = 26, 14
widths = [tmp.textlength(l, font=f) for l in lines]
H = len(lines) * lh + 2 * pad_y + 10
img = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
y = pad_y
for l, lw in zip(lines, widths):
    x = (W - lw) / 2
    if a.style == "bandeau":
        d.rounded_rectangle((x - pad_x, y - 6, x + lw + pad_x, y + lh + 2), radius=14, fill=(0, 0, 0, 235))
    y += lh
y = pad_y
for l, lw in zip(lines, widths):
    x = (W - lw) / 2
    if a.style == "plain":
        for dx, dy in ((-3, 0), (3, 0), (0, -3), (0, 3)): d.text((x + dx, y + dy), l, font=f, fill=(0, 0, 0, 255))
    d.text((x, y), l, font=f, fill=(255, 255, 255, 255))
    y += lh
img.save(a.out)
print(a.out, H)
