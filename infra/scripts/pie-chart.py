#!/usr/bin/env python3
"""Camembert animé « d'accord / pas d'accord » (CONCEPT-013) aux couleurs de l'app (01_BRAND/DA/themes.json → palette btn_yes / btn_no,
police de la DA), libellés = vocabulaire agree / disagree de infra/config/project.json dans la langue --lang.
La part verte grandit depuis midi, dans le sens horaire, avec le compteur qui défile, puis s'arrête sur le vrai % ; le reste devient
rouge et se libelle. Sorties (dans --out) : frames PNG alpha, <name>.mov (ProRes 4444, alpha, pour CapCut / overlay),
<name>-preview.mp4 (sur le fond de la palette), <name>-final.png.
Usage : .venv/bin/python scripts/pie-chart.py --pct 42 [--lang fr|en] [--name pie-42] [--out dir] [--fill 2.5] [--hold 1.5] [--size 1080]
--pct = % de joueurs D'ACCORD (réel, jamais inventé : 07_ASSETS/opinions.json)."""
import argparse, math, os, shutil, subprocess, tempfile
from PIL import Image, ImageDraw
import sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from da_cards import font, GREEN, RED, TXT, BG
from project_config import t

WHITE = (255, 255, 255); BG_HEX = "#%02x%02x%02x" % BG
FPS, SS = 30, 2
def slice_labels(lang): return (t("agree", lang), t("disagree", lang))   # (part verte, part rouge) — config/project.json

def fmt(p, lang):
    s = f"{p:.1f}".rstrip("0").rstrip(".")
    return (s.replace(".", ",") if lang == "fr" else s) + " %" if lang == "fr" else s + "%"

def ease(t):  # ease-out cubique
    return 1 - (1 - t) ** 3

def frame(size, pct_now, pct_final, lang, done, ring=True, labels="outside"):
    """Canevas carré transparent. Cercle de rayon 0,36*size, étiquettes à l'extérieur."""
    S = size * SS; im = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    cx = cy = S / 2; r = size * 0.30 * SS; m = size * 0.02 * SS  # marge de sécurité pour les étiquettes
    box = [cx - r, cy - r, cx + r, cy + r]
    d.ellipse(box, fill=WHITE if not done else RED)
    if ring: d.ellipse([cx - r - 6 * SS, cy - r - 6 * SS, cx + r + 6 * SS, cy + r + 6 * SS], outline=WHITE, width=6 * SS)
    a = 360 * pct_now / 100
    if a > 0: d.pieslice(box, -90, -90 + a, fill=GREEN)
    fl, fs = font(int(size * 0.052), 700), font(int(size * 0.058), 700)
    yes, no = slice_labels(lang)
    def label(mid_deg, name, p, span_deg=360):
        """Étiquette dans l'axe du milieu de la part : à l'extérieur (référence de l'instance d'origine) ou à l'intérieur comme la source TikTok
        (`labels=inside`, texte blanc contour sombre ; repasse à l'extérieur si la part est trop fine). Contrainte dans le canevas."""
        ang = math.radians(mid_deg - 90); inside = labels == "inside" and span_deg >= 40
        if inside: lx = cx + 0.56 * r * math.cos(ang); ly = cy + 0.56 * r * math.sin(ang)
        elif labels == "inside" and not done: lx, ly = cx, cy   # part encore fine pendant le remplissage : au centre du rond blanc (évite le texte natif au-dessus du front)
        else: lx = cx + (r + size * 0.10 * SS) * math.cos(ang); ly = cy + (r + size * 0.08 * SS) * math.sin(ang)
        fill, stroke = (WHITE, TXT) if inside else (TXT, WHITE)
        rows = [(name, fl), (fmt(p, lang), fs)]; bbs = [d.textbbox((0, 0), t, font=f) for t, f in rows]
        w = max(b[2] - b[0] for b in bbs); hs = [b[3] - b[1] for b in bbs]; gap = 8 * SS; h = sum(hs) + gap
        x0 = min(max(lx - w / 2, m), S - m - w); y0 = min(max(ly - h / 2, m), S - m - h)
        for (t, f), b, hh in zip(rows, bbs, hs):
            tw = b[2] - b[0]; d.text((x0 + (w - tw) / 2 - b[0], y0 - b[1]), t, font=f, fill=fill, stroke_width=5 * SS, stroke_fill=stroke); y0 += hh + gap
    label(a / 2, yes, pct_now, a)
    if done and pct_final < 100: label(a + (360 - a) / 2, no, 100 - pct_final, 360 - a)
    return im.resize((size, size), Image.LANCZOS)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--pct", type=float, required=True); ap.add_argument("--lang", default="fr")
    ap.add_argument("--name"); ap.add_argument("--out", default="."); ap.add_argument("--fill", type=float, default=2.5)
    ap.add_argument("--hold", type=float, default=1.5); ap.add_argument("--size", type=int, default=1080); ap.add_argument("--lead", type=float, default=0.6); ap.add_argument("--labels", default="outside", choices=["outside", "inside"])
    a = ap.parse_args(); name = a.name or f"pie-{a.pct:g}"; os.makedirs(a.out, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="pie_"); n = 0
    for _ in range(int(a.lead * FPS)):                      # cercle vide
        frame(a.size, 0, a.pct, a.lang, False, labels=a.labels).save(f"{tmp}/f{n:05d}.png"); n += 1
    nf = int(a.fill * FPS)
    for i in range(1, nf + 1):                              # remplissage
        frame(a.size, a.pct * ease(i / nf), a.pct, a.lang, False, labels=a.labels).save(f"{tmp}/f{n:05d}.png"); n += 1
    final = frame(a.size, a.pct, a.pct, a.lang, True, labels=a.labels)
    for _ in range(int(a.hold * FPS)): final.save(f"{tmp}/f{n:05d}.png"); n += 1
    final.save(os.path.join(a.out, f"{name}-final.png"))
    seq = f"{tmp}/f%05d.png"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", seq, "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", os.path.join(a.out, f"{name}.mov")], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"color=c={BG_HEX}:s={a.size}x{a.size}:r={FPS}", "-framerate", str(FPS), "-i", seq,
                    "-filter_complex", "[0][1]overlay=shortest=1", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", os.path.join(a.out, f"{name}-preview.mp4")], check=True)
    shutil.rmtree(tmp); print(f"→ {a.out}/{name}.mov + -preview.mp4 + -final.png ({n / FPS:.1f} s)")

if __name__ == "__main__": main()
