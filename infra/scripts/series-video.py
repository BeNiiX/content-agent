#!/usr/bin/env python3
"""Vidéo « série d'opinions » 1080x1920, 30 i/s, DA app (CONCEPT-012) : photo brute (hook, texte natif) → pour chaque opinion :
carte opinion (durée fixe) → carte score avec vague qui monte → carte d'engagement au milieu → carte de fin. Muette (musique + TTS dans TikTok).
Usage : .venv/bin/python scripts/series-video.py spec.json
Spec : { "out": "x.mp4", "cover": {"photo", "dur"}, "slides": [{"text","pct"}], "opinion_dur": 3.2, "score_dur": 2.4,
         "engagement": {"after": 3, "title", "sub", "dur"}, "end": {"title","sub","dur"} }"""
import json, os, sys, subprocess, shutil, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from da_cards import opinion_card, score_card, text_card, photo
H, FPS = 1920, 30
DY = (H - 1350) // 2  # cartes centrées verticalement dans le 9:16
spec = json.load(open(sys.argv[1], encoding="utf8")); base = os.path.dirname(os.path.abspath(sys.argv[1]))
out = os.path.join(base, spec["out"]); tmp = tempfile.mkdtemp(prefix="series_")
n = 0
def push(im, dur):
    global n
    p = os.path.join(tmp, f"k{n:04d}.jpg"); im.save(p, quality=93)
    frames = max(1, int(round(dur * FPS)))
    for _ in range(frames): os.symlink(p, os.path.join(tmp, f"f{n:06d}.jpg")); n += 1
def push_seq(ims, total):
    per = total / len(ims)
    for im in ims: push(im, per)
push(photo(os.path.join(base, spec["cover"]["photo"]), H), spec["cover"].get("dur", 2.5))
od, sd = spec.get("opinion_dur", 3.2), spec.get("score_dur", 2.4)
th = spec.get("da", "default")
eng = spec.get("engagement")
for i, s in enumerate(spec["slides"], 1):
    push(opinion_card(s["text"], H, DY, theme=th), od)
    # remplissage de la vague sur 0,6 s (12 images), puis carte pleine
    push_seq([score_card(s["pct"], H, DY, fill=k / 12, show_text=k >= 8, theme=th) for k in range(1, 13)], 0.6)
    push(score_card(s["pct"], H, DY, theme=th), sd - 0.6)
    if eng and i == eng.get("after", 0): push(text_card(eng["title"], eng.get("sub", ""), H, DY, theme=th), eng.get("dur", 2.5))
e = spec.get("end")
if e: push(text_card(e["title"], e.get("sub", ""), H, DY, theme=th), e.get("dur", 3))
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(tmp, "f%06d.jpg"), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], check=True)
shutil.rmtree(tmp); print(f"→ {out} ({n / FPS:.1f} s, {len(spec['slides'])} opinions)")
