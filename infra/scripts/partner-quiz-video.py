#!/usr/bin/env python3
"""Vidéo FORMAT-04 « test du partenaire » 1080x1920, 30 i/s, DA app, **avec piste audio** (voix + tic-tac) : il ne reste
que la musique à ajouter dans TikTok. Photo brute avec le hook incrusté (bandeau TikTok, 2 lignes) et dit par la voix → pour
chaque opinion : carte, la voix lit l'opinion, chrono 3-2-1 (un tic par chiffre) puis 0 (ding) — personne ne révèle, le
partenaire juge → carte CTA au milieu → carte de fin. Cartes gage / score possibles mais retirées à la validation humaine du 21/09.
Plan des temps : partner_quiz.plan, écrit dans <spec>.plan.json (lu par posts-md.py pour TEXTES.md).
Usage : .venv/bin/python scripts/partner-quiz-video.py spec.json [--preview out.jpg] [--no-tts] [--out fichier.mp4]
  --preview : planche des cartes (une image par temps) sans encoder ; --no-tts : rendu sans voix.
Voix : spec `tts` = {engine: edge | say | piper, voice, rate} (défaut edge / fr-FR-DeniseNeural, choix humain du 21/09 ; rendu sur le Mac)."""
import json, os, sys, subprocess, shutil, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from da_cards import opinion_card, score_card, text_card, photo
from partner_quiz import plan, total_dur, countdown_cfg, countdown_state, with_disc, voice_lines, tts_cfg, tts_available, tts_wav, read_wav, normalize, build_audio
H, FPS = 1920, 30
DY = (H - 1350) // 2          # cartes centrées verticalement dans le 9:16 (même repère que series-video.py)
RING_FPS = 15                 # cadence de l'animation de l'anneau (chaque image dure 2 trames)
HERE = os.path.dirname(os.path.abspath(__file__))

spec = json.load(open(sys.argv[1], encoding="utf8")); base = os.path.dirname(os.path.abspath(sys.argv[1]))
out = os.path.abspath(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else os.path.join(base, spec["out"]); th = spec.get("da", "default"); cfg = countdown_cfg(spec)
preview = sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None
tmp = tempfile.mkdtemp(prefix="pquiz_"); n = 0; sheet = []

# 1. Voix : durées → plan des temps
lines = {} if "--no-tts" in sys.argv else voice_lines(spec); voices = {}; durs = {}; tts = tts_cfg(spec) or {}
if lines and (why := tts_available(tts)): sys.exit(f"voix indisponible : {why} — rendre sur le Mac (deploy/sync-media.sh ensuite) ou --no-tts")
for key, text in lines.items():
    w = os.path.join(tmp, f"v_{key.replace(':', '_')}.wav"); durs[key] = tts_wav(text, w, tts); voices[key] = normalize(read_wav(w))
beats = plan(spec, durs)

def push(im, dur, key=True):
    global n
    p = os.path.join(tmp, f"k{n:04d}.jpg"); im.save(p, quality=93)
    if key: sheet.append(p)
    for _ in range(max(1, int(round(dur * FPS)))): os.symlink(p, os.path.join(tmp, f"f{n:06d}.jpg")); n += 1

def cover_image(b):
    """Photo brute + hook incrusté (bandeau noir TikTok, ligne 1 grosse, ligne 2 plus petite) à ~28 % de la hauteur."""
    im = photo(os.path.join(base, spec["cover"]["photo"]), H).convert("RGBA"); y = int(H * (spec.get("hook") or {}).get("y", 0.28))
    for i, (txt, size) in enumerate(((b.get("text"), 62), (b.get("sub"), 48))):
        if not txt: continue
        png = os.path.join(tmp, f"hook{i}.png")
        subprocess.run([sys.executable, os.path.join(HERE, "render-bubble.py"), png, "--text", txt, "--size", str(size), "--maxw", "980"], check=True)
        bub = Image.open(png).convert("RGBA"); im.alpha_composite(bub, (0, y)); y += bub.height - 6
    return im.convert("RGB")

# 2. Images
for b in beats:
    k = b["kind"]
    if k == "cover": push(cover_image(b) if spec.get("burn_text", True) else photo(os.path.join(base, spec["cover"]["photo"]), H), b["dur"])
    elif k in ("rule", "engagement", "end"): push(text_card(b["text"], b.get("sub", ""), H, DY, theme=th), b["dur"])
    elif k == "opinion":
        card = opinion_card(b["text"], H, DY, theme=th); lead = b["lead"]
        push(card, lead)                                                    # lecture (la voix lit l'opinion), sans chrono
        run = cfg["from"] * cfg["step"]; steps = int(round(run * RING_FPS)); first = True
        for i in range(steps):                                              # anneau qui se vide, chiffre 3 → 1
            digit, frac = countdown_state(lead + i / RING_FPS, cfg, lead)
            push(with_disc(card, digit, frac), 1 / RING_FPS, key=first); first = False
        push(with_disc(card, 0, 0.0), cfg["zero"])                         # 0 : on répond (ding)
    elif k == "score":
        for j in range(1, 10):                                              # vague qui monte sur 0,6 s (9 × 2 trames), texte à partir de 6/9
            push(score_card(b["pct"], H, DY, fill=j / 9, show_text=j >= 6, theme=th), 2 / FPS, key=False)
        push(score_card(b["pct"], H, DY, theme=th), b["dur"] - 0.6)
if preview:
    ims = [Image.open(p).resize((270, 480)) for p in sheet]; cols = min(6, len(ims)); rows = (len(ims) + cols - 1) // cols
    sh = Image.new("RGB", (cols * 270, rows * 480), (20, 20, 20))
    for i, im in enumerate(ims): sh.paste(im, ((i % cols) * 270, (i // cols) * 480))
    sh.save(preview if os.path.isabs(preview) else os.path.join(base, preview), quality=88); shutil.rmtree(tmp); print(f"→ planche {preview} ({len(ims)} temps, {n / FPS:.1f} s)"); sys.exit()

# 3. Piste audio (voix + tic-tac) et encodage
os.makedirs(os.path.dirname(out), exist_ok=True)
audio = bool(voices) or (spec.get("sfx") or {}).get("tick", True)
wav = os.path.join(tmp, "audio.wav")
if audio: build_audio(beats, spec, voices, wav)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(tmp, "f%06d.jpg")] + (["-i", wav] if audio else []) +
               ["-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p"] + (["-c:a", "aac", "-b:a", "160k", "-shortest"] if audio else []) + ["-movflags", "+faststart", out], check=True)
json.dump({"spec": os.path.basename(sys.argv[1]), "out": spec["out"], "duration_s": total_dur(beats), "tts": bool(voices), "engine": tts.get("engine") if voices else None, "voice": tts.get("voice") if voices else None, "beats": beats},
          open(os.path.splitext(os.path.abspath(sys.argv[1]))[0] + ".plan.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)
shutil.rmtree(tmp); print(f"→ {out} ({n / FPS:.1f} s, {len(spec['slides'])} opinions, {'voix + tic-tac' if voices else 'tic-tac seul' if audio else 'muet'})")
