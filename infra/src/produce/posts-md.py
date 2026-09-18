#!/usr/bin/env python3
"""Régénère POSTS.md (front page + caption + contenus) et TEXTES.md (bulles POV + timings) d'un compte depuis ses specs.
Usage : python3 infra/src/produce/posts-md.py 08_ACCOUNTS/<account>
Vocabulaire (« opinions », « des joueurs pensent comme toi », « sont d'accord. ») : infra/config/project.json ; en-tête du compte : infra/config/accounts.json (role, da)."""
import json, glob, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts"))
from project_config import t, INFRA_ROOT
acc_dir = sys.argv[1].rstrip('/'); acc = os.path.basename(acc_dir)
try: _acc = json.load(open(os.path.join(INFRA_ROOT, "config", "accounts.json"), encoding="utf8"))["accounts"].get(acc, {})
except Exception: _acc = {}
H = f"{acc} — {_acc['role']}" + (f" (DA {_acc['da']})" if _acc.get("da") else "") if _acc.get("role") else acc
lang = _acc.get("lang") or ("en" if (_acc.get("da") or "").startswith("en") else None)   # langue du compte (accounts.json → lang, sinon déduite de la DA)
ITEMS = t("item_plural", lang); ITEMS_CAP = ITEMS[:1].upper() + ITEMS[1:]
posts = ["---", f"name: posts-{acc}", f"description: Textes natifs (front page), captions et opinions de chaque post du compte {acc} — ne jamais réutiliser sur un autre compte", "type: production", "generated: true", "---", "", f"# Posts — {H}", "", "Slide 1 / plan 1 = photo brute : écrire le **texte natif** ci-dessous dans TikTok (police classique, ≤ 8 mots). Carrousels en 4:5 ; vidéos FORMAT-02 en 9:16 muettes (voix TTS TikTok sur chaque carte opinion + son tendance). Vidéos FORMAT-01 : bulles et timings dans `TEXTES.md`.", ""]
textes = ["---", f"name: textes-{acc}", f"description: Bulles à saisir dans TikTok (texte natif + synthèse vocale) et leur timing pour les vidéos POV (FORMAT-01) du compte {acc}", "type: production", "generated: true", "---", "", f"# Textes POV — {H}", "", "Ajouter chaque bulle en texte natif (bandeau noir), régler sa durée, puis Texte → Synthèse vocale. Musique : Radetzky March ou Beau Danube bleu (bibliothèque commerciale), volume ~50, garder le son original.", ""]
for f in sorted(glob.glob(f"{acc_dir}/specs/F02/*.json")):
    j = json.load(open(f)); name = os.path.basename(f)[:-5]
    posts += [f"## {name} · {j['angle']} · {j['rendition']} · `posts/{name}{'' if j['rendition'] == 'video' else '/'}`", "", f"**Front page (texte natif sur `{os.path.basename(j['cover']['photo'])}`) :**", "", f"> {j['title_native']}", "", "**Caption :**", "", f"> {j['caption']}", "", f"**{ITEMS_CAP} :**", ""]
    for i, s in enumerate(j['slides'], 1): posts.append(f"{i}. « {s['text']} » → **{s['pct']}%** {t('score_label', lang)}")
    posts.append("")
for f in sorted(glob.glob(f"{acc_dir}/specs/F01/*.json")):
    j = json.load(open(f)); name = os.path.basename(f)[:-5]
    textes += [f"## {name} · {j['angle']} · `posts/{name}.mp4` ({j.get('exp', '')}) · photo `{os.path.basename(j['photo'])}`", "", "| Début | Fin | Position | Texte |", "|---|---|---|---|"]
    for b in j['bubbles']:
        pos = {'hook': 'sur la photo, au tiers haut', 'card': f"haut de la carte {t('item', lang)}", 'verdict': f"sous « {t('verdict_label', lang)} »", 'low': 'bas de la carte'}.get(b.get('pos', 'card'), 'haut')
        textes.append(f"| {b['at']:.1f} s | {b['at'] + b['dur']:.1f} s | {pos} | {b['text']} |")
    textes.append("")
open(f"{acc_dir}/POSTS.md", "w").write("\n".join(posts)); open(f"{acc_dir}/TEXTES.md", "w").write("\n".join(textes))
print(acc, "POSTS.md + TEXTES.md régénérés")
