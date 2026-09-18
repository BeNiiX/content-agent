#!/usr/bin/env python3
"""Carrousel d'opinions 1080x1350 (DA app) : slide 1 = photo brute, puis carte opinion + carte score par opinion. Voir da_cards.py.
Usage : .venv/bin/python scripts/carousel.py spec.json [--preview out.jpg]"""
import json, os, argparse, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from da_cards import opinion_card, score_card, photo
from PIL import Image
ap = argparse.ArgumentParser(); ap.add_argument("spec"); ap.add_argument("--preview", default="")
a = ap.parse_args()
spec = json.load(open(a.spec, encoding="utf8")); base = os.path.dirname(os.path.abspath(a.spec))
outdir = os.path.join(base, spec["out"]); os.makedirs(outdir, exist_ok=True)
for f in os.listdir(outdir):
    if f.endswith(".jpg"): os.remove(os.path.join(outdir, f))
slides = [photo(os.path.join(base, spec["cover"]["photo"]))]
theme = spec.get("da", "default")
for s in spec["slides"]: slides += [opinion_card(s["text"], theme=theme), score_card(s["pct"], theme=theme)]
for i, im in enumerate(slides, 1): im.save(os.path.join(outdir, f"{i:02d}.jpg"), quality=94)
print(f"{outdir} : {len(slides)} slides")
if a.preview:
    th = [im.resize((216, 270)) for im in slides]; cols = min(7, len(th)); rows = (len(th) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 220, rows * 274), "black")
    for i, t in enumerate(th): sheet.paste(t, ((i % cols) * 220, (i // cols) * 274))
    sheet.save(a.preview)
