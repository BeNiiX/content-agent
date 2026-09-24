"""FORMAT-04 « test du partenaire » : plan des temps, chrono, voix et tic-tac. Utilisé par partner-quiz-video.py (rendu 9:16
avec piste audio) et src/produce/posts-md.py (TEXTES.md : temps réels lus dans le sidecar <spec>.plan.json écrit au rendu).
Structure d'une spec (mêmes clés que FORMAT-02 quand c'est la même chose) :
  { "format": "FORMAT-04", "rendition": "video", "da", "out", "cover": {"photo", "dur"},
    "hook": {"line1", "line2", "speak"},                   # texte incrusté sur la photo (bandeau TikTok) + phrase dite par la voix
    "tts": {"engine": "edge", "voice": "fr-FR-DeniseNeural", "rate": "+0%"} | false,   # voix : edge (Microsoft, en ligne, sans clé — choix humain du 21/09 : Denise), say (macOS), piper (hors ligne, models/piper) ; false = muet
    "speak_opinions": true,                                # la voix lit chaque opinion avant le chrono (comme la source)
    "countdown": {"lead": 0.6, "from": 3, "step": 1.0, "zero": 0.6},   # lecture (≥ voix + 0,3 s), puis 3-2-1 (step s chacun, un tic par chiffre), puis 0 (ding)
    "sfx": {"tick": true},                                 # tic-tac synthétisé (aucun sample externe)
    "rule": {"title", "sub", "dur"},                       # carte gage (facultative, retirée à la validation humaine du 21/09)
    "slides": [{"text", "pct", "reveal": false}, …],       # reveal true = carte score après le chrono (facultatif, retiré le 21/09)
    "engagement": {"after": 3, "title", "sub", "dur"},     # carte CTA au milieu
    "score_dur": 2.4, "end": {"title", "sub", "dur"} }
Le chrono est posé au-dessus de la carte (bande sombre du 9:16), jamais dans les 15 % du bas (zone d'interface)."""
import array, math, os, random, shutil, subprocess, sys, wave
from PIL import Image, ImageDraw
from da_cards import font
from project_config import INFRA_ROOT

DISC_R, DISC_CX, DISC_CY = 95, 540, 220      # rayon et centre du chrono (canevas 1080×1920, carte à partir de y = 345 → 30 px de marge)
DISC_BG, DISC_RING = (21, 21, 21), (255, 255, 255)
SR = 44100                                   # piste audio mono 16 bits

def countdown_cfg(spec):
    c = spec.get("countdown") or {}
    return {"lead": float(c.get("lead", 0.6)), "from": int(c.get("from", 3)), "step": float(c.get("step", 1.0)), "zero": float(c.get("zero", 0.6))}

def voice_lines(spec):
    """Ce que la voix dit, par temps : {"cover": …, "opinion:1": …, "engagement": …, "end": …} (clés absentes = pas de voix)."""
    if spec.get("tts") is False: return {}
    v = {}
    h = spec.get("hook") or {}
    if h.get("speak") or h.get("line1"): v["cover"] = h.get("speak") or " ".join(x for x in (h.get("line1"), h.get("line2")) if x)
    r = spec.get("rule")
    if r and r.get("speak", True): v["rule"] = r.get("speak") or f"{r['title']} {r.get('sub', '')}".strip()
    if spec.get("speak_opinions", True):
        for i, s in enumerate(spec["slides"], 1): v[f"opinion:{i}"] = s.get("speak") or s["text"]
    e = spec.get("engagement")
    if e and e.get("speak", True): v["engagement"] = e.get("speak") or f"{e['title']} {e.get('sub', '')}".strip()
    e = spec.get("end")
    if e and e.get("speak", True): v["end"] = e.get("speak") or f"{e['title']} {e.get('sub', '')}".strip()
    return v

def plan(spec, voice_durs=None):
    """Liste ordonnée des temps : [{kind, t0, t1, dur, text, sub, pct, lead, key}] ; kind ∈ cover | rule | opinion | engagement | score | end.
    voice_durs : durées des voix par clé de voice_lines (le temps s'allonge pour laisser parler : photo ≥ voix + 0,4 s, lecture d'une opinion ≥ voix + 0,3 s)."""
    vd = voice_durs or {}; beats, t = [], 0.0
    def add(kind, dur, key=None, **kw):
        nonlocal t
        beats.append({"kind": kind, "key": key or kind, "t0": round(t, 2), "t1": round(t + dur, 2), "dur": round(dur, 3), **kw}); t += dur
    cov = spec.get("cover") or {}; h = spec.get("hook") or {}
    if cov.get("photo"): add("cover", max(float(cov.get("dur", 2.5)), vd.get("cover", 0) + 0.4), text=h.get("line1", spec.get("title_native", "")), sub=h.get("line2", spec.get("title_native_line2", "")))
    r = spec.get("rule")
    if r: add("rule", max(float(r.get("dur", 2.5)), vd.get("rule", 0) + 0.5), text=r["title"], sub=r.get("sub", ""))
    eng = spec.get("engagement"); cfg = countdown_cfg(spec); run = cfg["from"] * cfg["step"]; sd = float(spec.get("score_dur", 2.4))
    for i, s in enumerate(spec["slides"], 1):
        lead = max(cfg["lead"], vd.get(f"opinion:{i}", 0) + 0.3)
        add("opinion", lead + run + cfg["zero"], key=f"opinion:{i}", text=s["text"], pct=s.get("pct"), n=i, lead=round(lead, 3))
        if s.get("reveal"): add("score", sd, key=f"score:{i}", text=s["text"], pct=s["pct"], n=i)
        if eng and i == int(eng.get("after", 0)): add("engagement", max(float(eng.get("dur", 2.5)), vd.get("engagement", 0) + 0.5), text=eng["title"], sub=eng.get("sub", ""))
    e = spec.get("end")
    if e: add("end", max(float(e.get("dur", 3.0)), vd.get("end", 0) + 0.5), text=e["title"], sub=e.get("sub", ""))
    return beats

def total_dur(beats): return round(sum(b["dur"] for b in beats), 3)

def countdown_state(elapsed, cfg, lead):
    """(chiffre affiché ou None pendant la lecture, fraction d'anneau restante 0-1). elapsed = temps depuis l'apparition de la carte."""
    if elapsed < lead: return None, 1.0
    run = cfg["from"] * cfg["step"]; e = elapsed - lead
    if e >= run: return 0, 0.0
    return int(math.ceil((run - e) / cfg["step"] - 1e-9)), max(0.0, 1 - e / run)

def disc(digit, frac, r=DISC_R):
    """Chrono : disque sombre, anneau blanc qui se vide dans le sens horaire (frac = part restante), chiffre gras. RGBA, taille 2r."""
    SS = 2; size = 2 * r; S = size * SS
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    w = 9 * SS; pad = 12 * SS
    d.ellipse([pad, pad, S - pad, S - pad], fill=DISC_BG + (255,))
    if frac > 0: d.arc([w / 2, w / 2, S - w / 2, S - w / 2], -90, -90 + 360 * frac, fill=DISC_RING + (255,), width=w)
    f = font(int(r * 0.95), 700); t = str(digit)
    bb = d.textbbox((0, 0), t, font=f); tw, th = bb[2] - bb[0], bb[3] - bb[1]
    d.text((S / 2 - tw / 2 - bb[0], S / 2 - th / 2 - bb[1]), t, font=f, fill=DISC_RING + (255,))
    return im.resize((size, size), Image.LANCZOS)

def with_disc(card, digit, frac):
    """Carte (RGB 1080×H) + chrono posé en haut ; sans chiffre (lecture) la carte est rendue telle quelle."""
    if digit is None: return card
    im = card.copy(); dsc = disc(digit, frac); im.paste(dsc, (DISC_CX - DISC_R, DISC_CY - DISC_R), dsc); return im

# ---- audio : voix (edge-tts / say / piper), tic-tac et ding synthétisés, mixage en PCM ----
TTS_DEFAULT = {"engine": "edge", "voice": "fr-FR-DeniseNeural"}   # choix humain du 21/09 (écoute comparée de 16 voix) ; rendu sur le Mac
def _venv_bin(name):
    p = os.path.join(os.path.dirname(sys.executable), name); return p if os.path.exists(p) else shutil.which(name)

def tts_cfg(spec):
    t = spec.get("tts"); return None if t is False else {**TTS_DEFAULT, **(t if isinstance(t, dict) else {})}

def tts_available(cfg):
    """None si le moteur est utilisable, sinon la raison."""
    e = cfg["engine"]
    if e == "say": return None if shutil.which("say") else "`say` absent (macOS seulement)"
    if e == "edge": return None if _venv_bin("edge-tts") else "`edge-tts` absent (.venv/bin/pip install edge-tts)"
    if e == "piper": return None if _venv_bin("piper") and os.path.exists(os.path.join(INFRA_ROOT, "models", "piper", cfg["voice"] + ".onnx")) else f"piper ou models/piper/{cfg['voice']}.onnx absent"
    return f"moteur TTS inconnu : {e}"

def tts_wav(text, out_wav, cfg):
    """Voix → wav mono 44,1 kHz 16 bits. edge : voix neurales Microsoft (en ligne, sans clé ; rate « +10% ») · say : macOS (rate en mots/min, 185 comme
    les POV) · piper : modèle onnx local (offline, tourne aussi sur le VPS). Retourne la durée en s. Échec = exception (jamais une autre voix en silence)."""
    e, voice = cfg["engine"], cfg["voice"]; base = out_wav[:-4]
    if e == "say":
        subprocess.run(["say", "-v", voice, "-r", str(cfg.get("rate", 185)), "-o", base + ".aiff", text], check=True); src = base + ".aiff"
    elif e == "edge":
        args = [_venv_bin("edge-tts"), "--voice", voice, "--text", text, "--write-media", base + ".mp3"]
        if cfg.get("rate"): args += ["--rate=" + str(cfg["rate"])]
        subprocess.run(args, check=True); src = base + ".mp3"
    elif e == "piper":
        args = [_venv_bin("piper"), "-m", os.path.join(INFRA_ROOT, "models", "piper", voice + ".onnx"), "-f", base + ".raw.wav"]
        if cfg.get("speaker") is not None: args += ["-s", str(cfg["speaker"])]
        subprocess.run(args, input=text.encode("utf8"), check=True); src = base + ".raw.wav"
    else: raise ValueError(f"moteur TTS inconnu : {e}")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-ar", str(SR), "-ac", "1", "-sample_fmt", "s16", out_wav], check=True)
    os.remove(src)
    with wave.open(out_wav) as w: return w.getnframes() / w.getframerate()

def read_wav(path):
    with wave.open(path) as w:
        assert w.getframerate() == SR and w.getnchannels() == 1 and w.getsampwidth() == 2, path
        a = array.array("h"); a.frombytes(w.readframes(w.getnframes())); return a

def _tone(dur, f, decay, amp, noise=0.0, seed=0):
    rnd = random.Random(seed); n = int(dur * SR); out = array.array("h", [0] * n)
    for i in range(n):
        t = i / SR; env = math.exp(-t * decay)
        v = math.sin(2 * math.pi * f * t) * env + (noise * (rnd.random() * 2 - 1) * math.exp(-t * decay * 4) if noise else 0)
        out[i] = int(max(-1, min(1, v * amp)) * 32767)
    return out

def tick(high=True):
    """Clic de pendule : sinus bref + souffle, aigu (tic) ou grave (tac)."""
    return _tone(0.09, 1700 if high else 1150, 70, 0.38, noise=0.5, seed=1 if high else 2)

def ding():
    """Fin du chrono : deux notes claires (sol 6 puis si 6), courte résonance."""
    a = _tone(0.45, 1568, 7, 0.35); b = _tone(0.55, 1976, 6, 0.35); off = int(0.14 * SR)
    out = array.array("h", a + array.array("h", [0] * max(0, off + len(b) - len(a))))
    for i, v in enumerate(b): out[off + i] = max(-32768, min(32767, out[off + i] + v))
    return out

def mix_into(master, clip, at_s, gain=1.0):
    off = int(at_s * SR)
    for i, v in enumerate(clip):
        j = off + i
        if j >= len(master): break
        master[j] = max(-32768, min(32767, master[j] + int(v * gain)))

def normalize(clip, peak=0.8):
    m = max(1, max(abs(v) for v in clip)); g = peak * 32767 / m
    return array.array("h", (int(v * g) for v in clip)) if g < 1 else clip

def build_audio(beats, spec, voices, out_wav):
    """Piste mono : voix au début de chaque temps qui en a une, un tic par chiffre du chrono (aigu / grave alternés), ding au 0."""
    total = total_dur(beats); master = array.array("h", [0] * int(math.ceil(total * SR) + SR // 10))
    cfg = countdown_cfg(spec); sfx = (spec.get("sfx") or {}).get("tick", True)
    for b in beats:
        if b["key"] in voices: mix_into(master, voices[b["key"]], b["t0"] + 0.1)
        if b["kind"] == "opinion" and sfx:
            t = b["t0"] + b["lead"]
            for k in range(cfg["from"]): mix_into(master, tick(high=k % 2 == 0), t + k * cfg["step"])
            mix_into(master, ding(), t + cfg["from"] * cfg["step"])
    with wave.open(out_wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(master[: int(total * SR)].tobytes())
    return total
