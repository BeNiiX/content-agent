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
    posts += [f"## {name} · {j['angle']} · {j['rendition']} · `posts/{name}{'' if j['rendition'] == 'video' else '/'}`" + (f" ({j['exp']})" if j.get('exp') else ""), "", f"**Front page (texte natif sur `{os.path.basename(j['cover']['photo'])}`) :**", "", f"> {j['title_native']}"]
    if j.get('title_native_line2'): posts.append(f"> {j['title_native_line2']}")   # ligne 2 = la mécanique, plus petite (révision du 21/09)
    alt = j.get('title_native_alt')
    if isinstance(alt, dict) and alt.get('line1'): posts += ["", f"*Variante ({alt.get('quand', 'autre texte natif')}) : « {alt['line1']} »" + (f" / « {alt['line2']} »" if alt.get('line2') else "") + "*"]
    if j.get('title_native_last_slide'): posts += ["", f"**Dernière slide (texte natif, hors 15 % du bas) :** « {j['title_native_last_slide']} »"]
    posts += ["", "**Caption :**", "", f"> {j['caption']}", "", f"**{ITEMS_CAP} :**", ""]
    for i, s in enumerate(j['slides'], 1): posts.append(f"{i}. « {s['text']} » → **{s['pct']}%** {t('score_label', lang)}")
    posts.append("")
for f in sorted(glob.glob(f"{acc_dir}/specs/F01/*.json")):
    j = json.load(open(f)); name = os.path.basename(f)[:-5]
    textes += [f"## {name} · {j['angle']} · `posts/{name}.mp4` ({j.get('exp', '')}) · photo `{os.path.basename(j['photo'])}`", "", "| Début | Fin | Position | Texte |", "|---|---|---|---|"]
    for b in j['bubbles']:
        pos = {'hook': 'sur la photo, au tiers haut', 'card': f"haut de la carte {t('item', lang)}", 'verdict': f"sous « {t('verdict_label', lang)} »", 'low': 'bas de la carte'}.get(b.get('pos', 'card'), 'haut')
        textes.append(f"| {b['at']:.1f} s | {b['at'] + b['dur']:.1f} s | {pos} | {b['text']} |")
    textes.append("")
for f in sorted(glob.glob(f"{acc_dir}/specs/F04/*.json")):   # FORMAT-04 test du partenaire : hook incrusté + voix + tic-tac dans le fichier ; temps réels dans <spec>.plan.json
    if f.endswith(".plan.json"): continue
    from partner_quiz import plan
    j = json.load(open(f)); name = os.path.basename(f)[:-5]; side = f[:-5] + ".plan.json"
    if j.get("variant_of"): continue   # variante (autre voix) d'un post existant : même contenu, pas une entrée à part
    pj = json.load(open(side)) if os.path.exists(side) else {}; beats = pj.get("beats") or plan(j)
    h = j.get("hook") or {}; l1 = h.get("line1") or j.get("title_native", ""); l2 = h.get("line2") or j.get("title_native_line2", "")
    posts += [f"## {name} · {j['angle']} · vidéo test du partenaire · `posts/{name}.mp4`" + (f" ({j['exp']})" if j.get('exp') else ""), "", f"**Hook incrusté sur `{os.path.basename(j['cover']['photo'])}`** (bandeau TikTok, rien à écrire dans l'app) :", "", f"> **{l1}**"]
    if l2: posts.append(f"> {l2}")
    posts += ["", "**Caption :**", "", f"> {j['caption']}", "", f"**{ITEMS_CAP} :** (lues par la voix, puis chrono 3-2-1 avec tic-tac ; personne ne révèle, le partenaire juge)", ""]
    for i, s in enumerate(j['slides'], 1): posts.append(f"{i}. « {s['text']} »" + (f" → **{s['pct']}%** {t('score_label', lang)} (révélé)" if s.get('reveal') else f" — {s['pct']}% {t('score_label', lang)} (non montré)"))
    posts.append("")
    tts = j.get("tts") is not False
    textes += [f"## {name} · {j['angle']} · `posts/{name}.mp4`" + (f" ({j['exp']})" if j.get('exp') else "") + f" · photo `{os.path.basename(j['cover']['photo'])}` · {beats[-1]['t1']:.1f} s", "",
               (f"Piste audio **incluse** (voix {pj.get('voice') or ''} + tic-tac) : dans TikTok, ajouter **la musique seulement** (garder le son original). Temps ci-dessous pour repère." if tts else "Vidéo muette : musique tendance + TTS TikTok sur les temps ci-dessous."), "", "| Début | Fin | Temps | Ce que dit la voix |", "|---|---|---|---|"]
    pos = {"cover": "photo (hook incrusté)", "rule": "carte gage", "opinion": "carte opinion → chrono", "engagement": "carte CTA", "score": "carte score", "end": "carte de fin"}
    for b in beats:
        txt = b['text'] + (f" {b['sub']}" if b.get('sub') else "") if b['kind'] != 'score' else f"{b['pct']} % des joueurs {t('score_label', lang)}"
        if b['kind'] == 'opinion' and b.get('lead'): txt += f" *(chrono à {b['t0'] + b['lead']:.1f} s)*"
        textes.append(f"| {b['t0']:.1f} s | {b['t1']:.1f} s | {pos[b['kind']]} | {txt} |")
    textes.append("")
open(f"{acc_dir}/POSTS.md", "w").write("\n".join(posts)); open(f"{acc_dir}/TEXTES.md", "w").write("\n".join(textes))
print(acc, "POSTS.md + TEXTES.md régénérés")
