#!/usr/bin/env python3
"""Tri de la boîte de dépôt photos 07_ASSETS/photos/_inbox/.
Passe 1 (sans option) : convertit HEIC/PNG/WebP en JPG (sips), copie l'original dans _backup-fichiers-origine/, fabrique une planche
contact numérotée (_contact-sheet-NN.jpg) et un _triage.json à compléter par l'agent (theme, situation, precision, personnes).
Passe 2 (--apply) : renomme <theme>-<situation>-<precision>.jpg, range dans photos/<theme>/ (créé si besoin), ajoute la ligne au
catalogue PHOTOS.md (section du thème, créée si besoin), retire l'image de _inbox/.
Usage : .venv/bin/python scripts/photos-inbox.py [--apply] [--max-side 2160]"""
import os, sys, json, re, subprocess, shutil, argparse, unicodedata
from PIL import Image, ImageDraw, ImageFont, ImageOps
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PHOTOS = os.path.join(ROOT, "07_ASSETS", "photos"); INBOX = os.path.join(PHOTOS, "_inbox"); BACKUP = os.path.join(PHOTOS, "_backup-fichiers-origine")
TRIAGE = os.path.join(INBOX, "_triage.json"); CATALOG = os.path.join(PHOTOS, "PHOTOS.md")
EXT_IMG = (".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tif", ".tiff")
ap = argparse.ArgumentParser(); ap.add_argument("--apply", action="store_true"); ap.add_argument("--max-side", type=int, default=2160)
a = ap.parse_args()
slug = lambda s: re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", s.lower()).encode("ascii", "ignore").decode())).strip("-")

def list_inbox():
    out = []
    for d, _, fs in os.walk(INBOX):
        for f in sorted(fs):
            if f.lower().endswith(EXT_IMG) and not f.startswith("_"): out.append(os.path.join(d, f))
    return out

if not a.apply:
    files = list_inbox()
    if not files: print("_inbox/ vide"); sys.exit(0)
    os.makedirs(BACKUP, exist_ok=True)
    triage = json.load(open(TRIAGE, encoding="utf8")) if os.path.exists(TRIAGE) else {"_doc": "À remplir par l'agent après lecture de la planche contact : theme (soiree|amis|couple|sport|famille|taf|paysages|…), situation (2-3 mots), precision (1-2 mots), personnes (nombre ou 0), angles (liste). Laisser skip: true pour écarter une photo (reste dans _inbox/_ecartees/).", "items": {}}
    items = triage["items"]; converted = []
    for i, src in enumerate(files, 1):
        base, ext = os.path.splitext(os.path.basename(src)); ext = ext.lower()
        jpg = os.path.join(INBOX, f"inbox-{i:03d}.jpg")
        if base.startswith("inbox-") and ext == ".jpg": jpg = src
        else:
            shutil.copy2(src, os.path.join(BACKUP, os.path.basename(src)))
            if ext in (".jpg", ".jpeg"): shutil.move(src, jpg)
            else:
                subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "92", src, "--out", jpg], check=True, capture_output=True); os.remove(src)
        im = Image.open(jpg); im = ImageOps.exif_transpose(im)
        if max(im.size) > a.max_side: im.thumbnail((a.max_side, a.max_side), Image.LANCZOS)
        im.convert("RGB").save(jpg, quality=92); converted.append(jpg)
        key = os.path.basename(jpg)
        items.setdefault(key, {"origine": os.path.basename(src), "size": list(im.size), "theme": "", "situation": "", "precision": "", "personnes": None, "angles": [], "skip": False})
    # planches contact (24 par planche)
    for s in range(0, len(converted), 24):
        chunk = converted[s:s + 24]; cols = 6; th = 360; tw = 270
        sheet = Image.new("RGB", (cols * (tw + 10), ((len(chunk) + cols - 1) // cols) * (th + 30)), "white"); d = ImageDraw.Draw(sheet)
        try: font = ImageFont.truetype(os.path.join(ROOT, "infra", "fonts", "DMSans.ttf"), 22)
        except Exception: font = ImageFont.load_default()
        for k, p in enumerate(chunk):
            im = Image.open(p); im.thumbnail((tw, th)); x = (k % cols) * (tw + 10); y = (k // cols) * (th + 30)
            sheet.paste(im, (x, y)); d.text((x + 4, y + th + 4), os.path.basename(p), fill="black", font=font)
        out = os.path.join(INBOX, f"_contact-sheet-{s // 24 + 1:02d}.jpg"); sheet.save(out, quality=80); print("planche :", out)
    json.dump(triage, open(TRIAGE, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(f"{len(converted)} image(s) prêtes · compléter {TRIAGE} puis --apply")
    sys.exit(0)

# --apply
triage = json.load(open(TRIAGE, encoding="utf8")); items = triage["items"]; cat = open(CATALOG, encoding="utf8").read(); moved = 0
for key, it in items.items():
    src = os.path.join(INBOX, key)
    if not os.path.exists(src): continue
    if it.get("skip"): os.makedirs(os.path.join(INBOX, "_ecartees"), exist_ok=True); shutil.move(src, os.path.join(INBOX, "_ecartees", key)); continue
    if not (it.get("theme") and it.get("situation")): print("incomplet :", key); continue
    theme = slug(it["theme"]); name = "-".join(filter(None, [theme, slug(it["situation"]), slug(it.get("precision", ""))])) + ".jpg"
    dst_dir = os.path.join(PHOTOS, theme); os.makedirs(dst_dir, exist_ok=True); dst = os.path.join(dst_dir, name); n = 2
    while os.path.exists(dst): dst = os.path.join(dst_dir, name.replace(".jpg", f"-{n:02d}.jpg")); n += 1
    shutil.move(src, dst); moved += 1
    desc = f"{it['situation']}{', ' + it['precision'] if it.get('precision') else ''}{', ' + str(it['personnes']) + ' pers.' if it.get('personnes') else ''}"
    row = f"| `{os.path.basename(dst)}` | {desc} | {', '.join(it.get('angles') or []) or '—'} | — |"
    m = re.search(rf"^## {re.escape(theme)}/ \((\d+)\)\s*$", cat, re.M)
    if m:
        # insérer à la fin du tableau de la section
        start = m.end(); nxt = cat.find("\n## ", start); nxt = len(cat) if nxt < 0 else nxt
        sec = cat[start:nxt].rstrip("\n"); cat = cat[:start] + sec + "\n" + row + "\n" + cat[nxt:]
        cat = cat[:m.start()] + f"## {theme}/ ({int(m.group(1)) + 1})" + cat[m.end():]
    else:
        cat = cat.rstrip("\n") + f"\n\n## {theme}/ (1)\n\n| Fichier | Contenu | Angles | Utilisée dans |\n|---|---|---|---|\n{row}\n"
    print("→", os.path.relpath(dst, PHOTOS))
open(CATALOG, "w", encoding="utf8").write(cat)
if moved: json.dump({"_doc": triage["_doc"], "items": {k: v for k, v in items.items() if os.path.exists(os.path.join(INBOX, k))}}, open(TRIAGE, "w", encoding="utf8"), ensure_ascii=False, indent=1)
print(f"{moved} photo(s) rangée(s), PHOTOS.md mis à jour")
