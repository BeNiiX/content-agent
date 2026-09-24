"""Cartes de la DA « New DA » (01_BRAND/DA) : carte opinion, carte score (vague animable), carte texte. Police variable (DM Sans opsz 9 par défaut).
Utilisé par carousel.py (slides 4:5) et series-video.py (vidéo 9:16). Toutes les cotes sont en px sur un canevas 1080 de large ;
la hauteur du canevas est libre (1350 pour 4:5, 1920 pour 9:16), les cartes sont décalées verticalement de `dy`.
Instance : palette, polices, texte de marque et variantes (THEMES) viennent de 01_BRAND/DA/themes.json (repli neutre si absent),
voir project_config.py."""
import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageOps
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from project_config import themes as _themes, hex_rgb, FONTS_DIR, DA_DIR

W = 1080; SS = 2
FD = FONTS_DIR
_T = _themes(); _P = _T["palette"]; _F = _T["fonts"]
BG, CARD, TXT = hex_rgb(_P["bg"]), hex_rgb(_P["card"]), hex_rgb(_P["text"])
RED, GREEN, ORANGE = hex_rgb(_P["btn_no"]), hex_rgb(_P["btn_yes"]), hex_rgb(_P["fill"])
BRAND_TEXT = _T["card_brand_text"]   # texte de marque en tête des cartes opinion / texte
# Variantes de DA par compte / ICP (01_BRAND/DA/themes.json → themes ; doc : 01_BRAND/DA/README.md, 01_BRAND/ACCOUNTS.md).
# Chaque thème : fill (couleur de la vague), btn_no, btn_yes, bar, deco (PNG dans 01_BRAND/DA/ ou None), score_label, lang.
THEMES = {k: {**v, "fill": hex_rgb(v.get("fill"), ORANGE)} for k, v in _T["themes"].items()}
_warned = set()
def T_(name):
    """Thème par nom ; inconnu → default (avertissement unique)."""
    if name not in THEMES and name not in _warned: _warned.add(name); print(f"thème DA « {name} » inconnu (01_BRAND/DA/themes.json) → default")
    return THEMES.get(name, THEMES["default"])
def _deco(im, theme, card_y0):
    """Décoration (emoji) posée sur le coin haut-droit de la carte, comme sur la référence couple (rose 111 px, centre ≈ (916, y0+28))."""
    name = T_(theme).get("deco")
    if not name: return
    d = Image.open(os.path.join(DA_DIR, name)).convert("RGBA"); size = S(112); d = d.resize((size, size), Image.LANCZOS)
    im.paste(d, (S(916) - size // 2, S(card_y0 + 28) - size // 2), d)
CARD_X0, CARD_X1, R = 137, 941, 60
OP_Y0, OP_Y1 = 60, 1104
BTN_Y0, BTN_Y1 = 942, 1052; BTN_R = (213, 518); BTN_G = (566, 871)
BAR_Y0, BAR_Y1 = 1125, 1287
SC_Y0, SC_Y1 = 150, 1195; OR_INSET = 21
WAVE = [(158, 353), (182, 380), (206, 400), (230, 416), (254, 428), (278, 437), (302, 442), (326, 445), (350, 446), (374, 444), (398, 439), (422, 433), (446, 423), (470, 412), (494, 398), (518, 382), (542, 363), (566, 344), (590, 328), (614, 314), (638, 302), (662, 292), (686, 283), (710, 277), (734, 272), (758, 270), (782, 271), (806, 274), (830, 280), (854, 290), (878, 304), (902, 325), (921, 351)]

def font(size, weight=400, italic=False):
    """Police de la DA (themes.json → fonts). Police variable : axes [optical_size, weight] ; sinon fichier bold / bold_italic si fourni."""
    bold = weight >= 600
    name = (_F.get("bold_italic") if bold and italic else _F.get("bold") if bold else None) or (_F["italic"] if italic else _F["regular"])
    f = ImageFont.truetype(os.path.join(FD, name), size * SS)
    try: f.set_variation_by_axes([_F.get("optical_size", 9), weight])
    except Exception: pass   # police non variable : le fichier choisi porte déjà la graisse
    return f
def S(v): return int(round(v * SS))
def canvas(H): return Image.new("RGB", (W * SS, H * SS), BG)
def down(im, H): return im.resize((W, H), Image.LANCZOS)
def text_w(d, t, f): return d.textlength(t, font=f) / SS
def center(d, t, f, cy, fill=TXT, cx=W / 2):
    bb = d.textbbox((0, 0), t, font=f); w = (bb[2] - bb[0]) / SS; h = (bb[3] - bb[1]) / SS
    d.text((S(cx - w / 2) - bb[0], S(cy - h / 2) - bb[1]), t, font=f, fill=fill)
def wrap(d, text, f, maxw):
    """Retour à la ligne sur les espaces simples seulement : une espace insécable (U+00A0, « 2 fois\u00a0? ») garde le mot et sa ponctuation ensemble."""
    lines, line = [], ""
    for w in text.split(" "):
        if not w: continue
        t = (line + " " + w).strip()
        if text_w(d, t, f) <= maxw: line = t
        else: lines.append(line); line = w
    lines.append(line); return lines

def opinion_card(text, H=1350, dy=0, buttons=True, bar=True, theme="default"):
    T = T_(theme)
    im = canvas(H); d = ImageDraw.Draw(im)
    d.rounded_rectangle((S(CARD_X0), S(OP_Y0 + dy), S(CARD_X1), S(OP_Y1 + dy)), radius=S(R), fill=CARD)
    center(d, BRAND_TEXT, font(55, 700, italic=True), 183 + dy)
    f = font(66, 400); lines = wrap(d, text, f, 670)
    while len(lines) > 4 and f.size > 40 * SS: f = font(int(f.size / SS) - 4, 400); lines = wrap(d, text, f, 670)
    lh = 94 * (f.size / SS) / 66; y0 = (624 if len(lines) >= 4 else 590) + dy - lh * (len(lines) - 1) / 2
    for i, l in enumerate(lines): center(d, l, f, y0 + i * lh)
    if buttons:
        fb = font(38, 700); by = (BTN_Y0 + BTN_Y1) / 2 + dy
        d.rounded_rectangle((S(BTN_R[0]), S(BTN_Y0 + dy), S(BTN_R[1]), S(BTN_Y1 + dy)), radius=S(56), fill=RED); center(d, T["btn_no"], fb, by, CARD, (BTN_R[0] + BTN_R[1]) / 2)
        d.rounded_rectangle((S(BTN_G[0]), S(BTN_Y0 + dy), S(BTN_G[1]), S(BTN_Y1 + dy)), radius=S(56), fill=GREEN); center(d, T["btn_yes"], fb, by, CARD, (BTN_G[0] + BTN_G[1]) / 2)
    if bar:
        d.rounded_rectangle((S(CARD_X0), S(BAR_Y0 + dy), S(CARD_X1), S(BAR_Y1 + dy)), radius=S(R), fill=CARD)
        fi = font(54, 700, italic=True); by = (BAR_Y0 + BAR_Y1) / 2 + dy
        bb = d.textbbox((0, 0), T["bar"], font=fi); d.text((S(230) - bb[0], S(by - (bb[3] - bb[1]) / SS / 2) - bb[1]), T["bar"], font=fi, fill=TXT)
        d.line([(S(722), S(by)), (S(842), S(by))], fill=TXT, width=S(13))
        d.polygon([(S(872), S(by)), (S(832), S(by - 26)), (S(832), S(by + 26))], fill=TXT)
        d.rounded_rectangle((S(832), S(by - 8), S(848), S(by + 8)), radius=S(4), fill=TXT)
    _deco(im, theme, OP_Y0 + dy)
    return down(im, H)

def score_card(pct, H=1350, dy=0, fill=1.0, show_text=True, theme="default"):
    """fill : 0 → 1, hauteur de la vague (animation de remplissage)."""
    T = T_(theme)
    im = canvas(H); d = ImageDraw.Draw(im)
    d.rounded_rectangle((S(CARD_X0), S(SC_Y0 + dy), S(CARD_X1), S(SC_Y1 + dy)), radius=S(R), fill=CARD)
    ox0, ox1, oy1 = CARD_X0 + OR_INSET, CARD_X1 - OR_INSET, SC_Y1 - OR_INSET + dy
    if fill > 0:
        shift = (1 - fill) * (oy1 - 250 - dy)  # la vague monte depuis le bas
        top = 250 + dy + shift
        d.rounded_rectangle((S(ox0), S(min(top, oy1 - 60)), S(ox1), S(oy1)), radius=S(42), fill=T["fill"])
        d.polygon([(S(ox0), S(top - 10))] + [(S(x), S(y + dy + shift)) for x, y in WAVE] + [(S(ox1), S(top - 10))], fill=CARD)
    if show_text:
        center(d, f"{pct}%", font(173, 700), 645 + dy)
        center(d, T["score_label"], font(50, 700), 778 + dy)
    _deco(im, theme, SC_Y0 + dy)
    return down(im, H)

def text_card(title, sub="", H=1350, dy=0, theme="default"):
    """Carte d'engagement / de fin : carte blanche, titre gras, sous-titre."""
    im = canvas(H); d = ImageDraw.Draw(im)
    d.rounded_rectangle((S(CARD_X0), S(OP_Y0 + dy), S(CARD_X1), S(OP_Y1 + dy)), radius=S(R), fill=CARD)
    center(d, BRAND_TEXT, font(55, 700, italic=True), 183 + dy)
    f = font(70, 700); lines = wrap(d, title, f, 640); lh = 92; y0 = 560 + dy - lh * (len(lines) - 1) / 2
    for i, l in enumerate(lines): center(d, l, f, y0 + i * lh)
    if sub:
        fs = font(44, 400); sl = wrap(d, sub, fs, 620); y = y0 + lh * len(lines) + 30
        for i, l in enumerate(sl): center(d, l, fs, y + i * 60, (110, 110, 110))
    _deco(im, theme, OP_Y0 + dy)
    return down(im, H)

def photo(path, H=1350):
    return ImageOps.fit(ImageOps.exif_transpose(Image.open(path)).convert("RGB"), (W, H), method=Image.LANCZOS, centering=(0.5, 0.45))
