#!/usr/bin/env python3
"""Rend une image 1080x1920 "opinion plein écran" avec Pillow (sans navigateur).
Usage : render-frame.py out.png --text "…" [--sub "…"] [--kicker "…"] [--verdict "…"] [--bg #222222] [--accent #FF6B6B]
Fonts : Helvetica / Arial système (macOS)."""
import argparse, os, sys
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from project_config import project

W, H = 1080, 1920
FONTS_BOLD = ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial Bold.ttf"]
FONTS_REG = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"]

def font(paths, size, index=0):
    for p in paths:
        try:
            return ImageFont.truetype(p, size, index=index)
        except OSError:
            continue
    return ImageFont.load_default()

def wrap(draw, text, f, max_w):
    lines = []
    for para in text.split("\n"):
        line = ""
        for w in para.split():
            t = (line + " " + w).strip()
            if draw.textlength(t, font=f) <= max_w: line = t
            else: lines.append(line); line = w
        lines.append(line)
    return lines

def center_block(draw, lines, f, y, fill, spacing=1.15):
    lh = int(f.size * spacing)
    for i, l in enumerate(lines):
        w = draw.textlength(l, font=f)
        draw.text(((W - w) / 2, y + i * lh), l, font=f, fill=fill)
    return y + len(lines) * lh

ap = argparse.ArgumentParser()
ap.add_argument("out"); ap.add_argument("--text", required=True); ap.add_argument("--sub", default="")
ap.add_argument("--kicker", default=""); ap.add_argument("--verdict", default=""); ap.add_argument("--bg", default="#222222")
ap.add_argument("--accent", default="#FF6B6B"); ap.add_argument("--brand", default=project()["name"])   # texte de marque en bas (config/project.json → name)
a = ap.parse_args()

img = Image.new("RGB", (W, H), a.bg); d = ImageDraw.Draw(img)
# taille de police adaptative : 104 → 72 selon la longueur
size = 104 if len(a.text) <= 40 else 88 if len(a.text) <= 70 else 72
f_main = font(FONTS_BOLD, size, index=1 if "Helvetica" in FONTS_BOLD[0] else 0)
lines = wrap(d, a.text, f_main, W - 180)
f_sub = font(FONTS_BOLD, 56); f_k = font(FONTS_REG, 38); f_v = font(FONTS_REG, 44); f_b = font(FONTS_REG, 40)
block_h = len(lines) * int(size * 1.15) + (110 if a.kicker else 0) + (150 if a.sub else 0) + (90 if a.verdict else 0)
y = (H - block_h) / 2
if a.kicker:
    y = center_block(d, [a.kicker.upper()], f_k, y, "#9a9a9a") + 60
y = center_block(d, lines, f_main, y, "#ffffff")
if a.sub:
    y = center_block(d, [a.sub], f_sub, y + 90, a.accent)
if a.verdict:
    y = center_block(d, [a.verdict], f_v, y + 40, "#bbbbbb")
center_block(d, [a.brand], f_b, H - 190, "#8a8a8a")
img.save(a.out); print("→", a.out)
