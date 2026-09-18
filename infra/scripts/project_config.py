"""Configuration d'instance pour les scripts Pillow / ffmpeg (équivalent de infra/src/lib/project.js).
- project()          : infra/config/project.json fusionné avec des valeurs par défaut neutres (schéma : infra/config/README.md)
- t(key, lang)       : vocabulaire localisé (agree, disagree, score_label, verdict_label, item, item_plural, question, kicker)
- cta(lang)          : phrase d'appel vers le store
- themes()           : 01_BRAND/DA/themes.json (cartes DA : palette, polices, variantes) avec repli sur un thème `default` neutre
Aucune dépendance : json + os. ROOT = deux niveaux au-dessus de infra/scripts/."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
INFRA_ROOT = os.path.abspath(os.path.join(HERE, ".."))
ROOT = os.path.abspath(os.path.join(INFRA_ROOT, ".."))
PROJECT_FILE = os.path.join(INFRA_ROOT, "config", "project.json")
THEMES_FILE = os.path.join(ROOT, "01_BRAND", "DA", "themes.json")
FONTS_DIR = os.path.join(INFRA_ROOT, "fonts")
DA_DIR = os.path.join(ROOT, "01_BRAND", "DA")

DEFAULTS = {
    "name": "Content Agent", "slug": "app", "app_store_url": None, "play_store_url": None,
    "languages": ["fr", "en"], "default_language": "fr", "markets": [], "timezone": "Europe/Paris", "daily_hour": 18,
    "weekly_stats": {"weekday": 1, "hour": 8},
    "vocabulary": {
        "item": {"fr": "carte", "en": "card"}, "item_plural": {"fr": "cartes", "en": "cards"},
        "verdict_label": {"fr": "des joueurs pensent comme toi", "en": "of players think like you"},
        "agree": {"fr": "d’accord", "en": "agree"}, "disagree": {"fr": "pas d’accord", "en": "disagree"},
        "score_label": {"fr": "sont d’accord.", "en": "agree."},
        "question": {"fr": "D'accord ou pas d'accord ?", "en": "Agree or disagree?"}, "kicker": {"fr": "", "en": ""},
    },
    "cta": {"fr": "", "en": ""}, "hashtags_core": {"fr": [], "en": []}, "notify_title": None,
}

_project = None
def project():
    """Configuration fusionnée (fichier > défauts). Chargée une fois par processus."""
    global _project
    if _project is not None: return _project
    raw = {}
    if os.path.exists(PROJECT_FILE):
        try: raw = json.load(open(PROJECT_FILE, encoding="utf8"))
        except Exception as e: print(f"config/project.json illisible : {e}")
    p = dict(DEFAULTS); p.update(raw)
    p["vocabulary"] = {**DEFAULTS["vocabulary"], **(raw.get("vocabulary") or {})}
    p["weekly_stats"] = {**DEFAULTS["weekly_stats"], **(raw.get("weekly_stats") or {})}
    p["notify_title"] = p.get("notify_title") or p["name"]
    _project = p; return p

def localized(v, lang=None):
    """Valeur localisée : chaîne (même valeur partout) ou {fr: …, en: …}. Repli : langue par défaut, puis première valeur."""
    if v is None: return ""
    if not isinstance(v, dict): return v
    p = project(); lang = lang or p["default_language"]
    if lang in v: return v[lang]
    if p["default_language"] in v: return v[p["default_language"]]
    return next(iter(v.values()), "")

def t(key, lang=None): return localized(project()["vocabulary"].get(key), lang)
def cta(lang=None): return localized(project().get("cta"), lang)
def hashtags_core(lang=None):
    h = localized(project().get("hashtags_core"), lang); return h if isinstance(h, list) else []

def hex_rgb(v, default=None):
    """'#FFBE59' | [255,190,89] | (255,190,89) → tuple RGB ; None → default."""
    if v is None: return default
    if isinstance(v, (list, tuple)): return tuple(int(x) for x in v[:3])
    s = str(v).lstrip("#"); return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))

# ---- Thèmes de cartes (01_BRAND/DA/themes.json) ----
DEFAULT_PALETTE = {"bg": "#343434", "card": "#FFFFFF", "text": "#252525", "btn_no": "#D71C34", "btn_yes": "#00BF62", "fill": "#FFBE59"}
DEFAULT_FONTS = {"regular": "DMSans.ttf", "italic": "DMSans-Italic.ttf", "bold": None, "bold_italic": None, "optical_size": 9}

def _neutral_theme(lang=None):
    """Thème de repli quand themes.json manque : libellés tirés du vocabulaire de project.json, vague de la palette."""
    def cap(s): return s[:1].upper() + s[1:] if s else s
    sp = " " if (lang or project()["default_language"]) == "fr" else ""
    return {"fill": DEFAULT_PALETTE["fill"], "btn_no": f"{cap(t('disagree', lang))}{sp}?", "btn_yes": f"{cap(t('agree', lang))}{sp}?",
            "bar": {"fr": "Voir le résultat", "en": "See the result"}.get(lang or project()["default_language"], "See the result"),
            "deco": None, "score_label": t("score_label", lang), "lang": lang or project()["default_language"]}

_themes = None
def themes():
    """{ 'card_brand_text', 'palette', 'fonts', 'themes': {name: {...}} } — fichier 01_BRAND/DA/themes.json, sinon repli neutre."""
    global _themes
    if _themes is not None: return _themes
    raw = {}
    if os.path.exists(THEMES_FILE):
        try: raw = json.load(open(THEMES_FILE, encoding="utf8"))
        except Exception as e: print(f"01_BRAND/DA/themes.json illisible : {e}")
    out = {
        "card_brand_text": raw.get("card_brand_text", project()["name"]),
        "palette": {**DEFAULT_PALETTE, **(raw.get("palette") or {})},
        "fonts": {**DEFAULT_FONTS, **(raw.get("fonts") or {})},
        "themes": dict(raw.get("themes") or {}),
    }
    if "default" not in out["themes"]: out["themes"]["default"] = _neutral_theme(project()["default_language"])
    for name, th in out["themes"].items():   # champs manquants → complétés depuis le thème neutre de la langue du thème
        base = _neutral_theme(th.get("lang")); base["fill"] = out["palette"]["fill"]
        for k, v in base.items(): th.setdefault(k, v)
    _themes = out; return out

def theme(name):
    """Variante de DA par nom ; nom inconnu → `default` (avec avertissement)."""
    th = themes()["themes"]
    if name not in th: print(f"thème DA « {name} » inconnu (01_BRAND/DA/themes.json) → default"); return th["default"]
    return th[name]
