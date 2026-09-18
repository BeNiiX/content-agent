#!/usr/bin/env python3
"""Montage CONCEPT-013 (camembert « devine où ça s'arrête »), 1080×1920, 30 i/s, muet.
Deux modes :
  face     : rush de réaction (tête calée) + camembert .mov alpha (pie-chart.py) posé sur le front + opinion en haut.
  faceless : photo (hook) → carte opinion DA → camembert sur fond #343434 avec l'opinion en haut.
Usage : .venv/bin/python scripts/pie-video.py spec.json
Spec commun : {"mode", "out", "text" (opinion), "pct", "lang", "burn_text": true, "lead", "fill", "hold"}
  face     : {"rush", "start" (s), "pie_size" (px), "pie_x", "pie_y" (coin haut-gauche du canevas du camembert)}
  faceless : {"photo" (null = pas de photo), "hook", "photo_dur", "card" (false = pas de carte), "card_dur", "da", "text_y"} — variante validée par l'instance d'origine : photo_as_background true + card false = photo en fond, texte en haut, rond vide direct
`burn_text` : incruste les textes (prototype / relecture) ; à false, sortie brute pour texte natif TikTok."""
import json, os, subprocess, sys, tempfile, shutil
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from da_cards import font, opinion_card, photo, wrap
W, H, FPS = 1080, 1920, 30
BG = "#343434"
HERE = os.path.dirname(os.path.abspath(__file__)); PY = sys.executable

def run(cmd): subprocess.run(cmd, check=True)

def text_png(text, path, size=58, y=140, maxw=920, color=(255, 255, 255), stroke=(37, 37, 37)):
    """Texte gras centré, en haut du 9:16, hors zone d'interface. Canevas transparent 1080×1920."""
    SS = 2; im = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0)); d = ImageDraw.Draw(im); f = font(size, 700)
    lines = wrap(d, text, f, maxw); lh = size * 1.25
    for i, l in enumerate(lines):
        bb = d.textbbox((0, 0), l, font=f, stroke_width=6 * SS); w = (bb[2] - bb[0]) / SS
        d.text(((W - w) / 2 * SS - bb[0], (y + i * lh) * SS - bb[1]), l, font=f, fill=color, stroke_width=6 * SS, stroke_fill=stroke)
    im.resize((W, H), Image.LANCZOS).save(path)

def render_pie(spec, tmp, size):
    name = "pie"; run([PY, os.path.join(HERE, "pie-chart.py"), "--pct", str(spec["pct"]), "--lang", spec.get("lang", "fr"), "--name", name, "--out", tmp,
                       "--size", str(size), "--lead", str(spec.get("lead", 0.6)), "--fill", str(spec.get("fill", 2.5)), "--hold", str(spec.get("hold", 1.5)), "--labels", spec.get("labels", "outside")])
    return os.path.join(tmp, name + ".mov"), spec.get("lead", 0.6) + spec.get("fill", 2.5) + spec.get("hold", 1.5)

def enc(out): return ["-r", str(FPS), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", out]

def face(spec, base, tmp, out):
    size = spec.get("pie_size", 1080); pie, dur = render_pie(spec, tmp, size)
    rush = os.path.join(base, spec["rush"]); x, y = spec.get("pie_x", 0), spec.get("pie_y", 100)
    fc = f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1,fps={FPS}[bg];[1:v]format=rgba[p];[bg][p]overlay={x}:{y}:shortest=1[v]"
    inputs = ["-ss", str(spec["start"]), "-t", str(dur), "-i", rush, "-i", pie]
    if spec.get("burn_text", True):
        t = os.path.join(tmp, "txt.png"); text_png(spec["text"], t, y=spec.get("text_y", 140)); inputs += ["-i", t]; fc += ";[v][2:v]overlay=0:0[v]"
    run(["ffmpeg", "-y", "-loglevel", "error"] + inputs + ["-filter_complex", fc, "-map", "[v]", "-t", str(dur)] + enc(out))

def faceless(spec, base, tmp, out):
    dy = (H - 1350) // 2; th = spec.get("da", "default"); burn = spec.get("burn_text", True)
    segs = []
    if spec.get("photo") and not spec.get("photo_as_background"):
        p = photo(os.path.join(base, spec["photo"]), H)
        if burn and spec.get("hook"):
            t = os.path.join(tmp, "hook.png"); text_png(spec["hook"], t, size=72, y=300); p = p.convert("RGBA"); p.alpha_composite(Image.open(t)); p = p.convert("RGB")
        p.save(os.path.join(tmp, "s1.jpg"), quality=94); stills = [(os.path.join(tmp, "s1.jpg"), spec.get("photo_dur", 2.5))]
    else: stills = []
    if spec.get("card", True):
        opinion_card(spec["text"], H, dy, theme=th).save(os.path.join(tmp, "s2.jpg"), quality=94); stills.append((os.path.join(tmp, "s2.jpg"), spec.get("card_dur", 3.2)))
    pie, dur = render_pie(spec, tmp, 1080)
    for i, (img, d) in enumerate(stills):
        o = os.path.join(tmp, f"seg{i}.mp4"); run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-framerate", str(FPS), "-i", img, "-t", str(d)] + enc(o)); segs.append(o)
    fc = f"[0:v][1:v]overlay=0:{(H - 1080) // 2}:shortest=1[v]"
    if spec.get("photo_as_background") and spec.get("photo"):   # photo en fond sur toute la durée du camembert (variante validée, voir docstring)
        bg = os.path.join(tmp, "bg.jpg"); photo(os.path.join(base, spec["photo"]), H).save(bg, quality=94); inputs = ["-loop", "1", "-framerate", str(FPS), "-i", bg, "-i", pie]
    else: inputs = ["-f", "lavfi", "-i", f"color=c={BG}:s={W}x{H}:r={FPS}", "-i", pie]
    if burn:
        t = os.path.join(tmp, "txt.png"); text_png(spec["text"], t, size=54, y=spec.get("text_y", 440)); inputs += ["-i", t]; fc = fc.replace("[v]", "[v0]") + ";[v0][2:v]overlay=0:0[v]"
    o = os.path.join(tmp, "seg2.mp4"); run(["ffmpeg", "-y", "-loglevel", "error"] + inputs + ["-filter_complex", fc, "-map", "[v]", "-t", str(dur)] + enc(o)); segs.append(o)
    lst = os.path.join(tmp, "list.txt"); open(lst, "w").write("".join(f"file '{s}'\n" for s in segs))
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", out])

def main():
    spec = json.load(open(sys.argv[1], encoding="utf8")); base = os.path.dirname(os.path.abspath(sys.argv[1]))
    out = os.path.join(base, spec["out"]); tmp = tempfile.mkdtemp(prefix="pievid_")
    (face if spec["mode"] == "face" else faceless)(spec, base, tmp, out)
    shutil.rmtree(tmp); print("→", out)

if __name__ == "__main__": main()
