# infra/config — configuration d'instance

Le code de `infra/` est générique. Tout ce qui dépend de l'app vit dans ces fichiers (et dans `.env` pour les secrets) :

| Fichier | Rôle | Lu par |
|---|---|---|
| `project.json` | Identité de l'app : nom, slug, langues, marchés, horaires, vocabulaire, CTA, hashtags | `src/lib/project.js` (Node), `scripts/project_config.py` (Python) |
| `accounts.json` | Registre des comptes TikTok : handle, appareil, identifiant chez le fournisseur d'envoi (`<backend>_account_id`), DA, description fixe des carrousels, flags | `src/publish/lib.js` → tous les scripts de publication, le tableau de bord, `posts-md.py` |
| `competitors.json` | Comptes concurrents suivis par la veille | `src/enrich-authors.js`, `src/build-docs.js` |
| `../../01_BRAND/DA/themes.json` | Thèmes des cartes (palette, polices, texte de marque, variantes) | `scripts/da_cards.py` → carrousels, vidéos série, camemberts |
| `../.env` | Secrets et réglages machine (`.env.example` documente chaque clé) | `src/lib/env.js` |

Une nouvelle instance = copier `project.json`, `accounts.json`, `themes.json`, `.env.example → .env`, les remplir, et déposer ses polices dans `infra/fonts/`. Aucune modification de code.

## `project.json`

| Clé | Type | Exemple (app fictive « Mon App ») | Usage |
|---|---|---|---|
| `name` | string | `"Mon App"` | Nom affiché : tableau de bord, `--brand` de `render-frame.py`, prompt de l'envoi du soir (`__APP_NAME__`), titre des notifications par défaut |
| `slug` | string (court, `[a-z0-9-]`) | `"monapp"` | Labels des tâches planifiées `com.content-agent.<slug>.daily-drafts` / `.daily-stats` / `.weekly-veille` (launchd, systemd), noms de sujets |
| `app_store_url` / `play_store_url` | string ou null | `"https://apps.apple.com/app/id0000000000"` | Liens store pour les CTA et docs |
| `languages` | string[] | `["fr", "en"]` | Langues des contenus produits |
| `default_language` | string | `"fr"` | Langue de repli de `t(key)` |
| `markets` | string[] | `["FR", "US"]` | Marchés ciblés (info) |
| `timezone` | string IANA | `"Europe/Paris"` | Fuseau des horaires ci-dessous |
| `daily_hour` | int 0-23 | `18` | Heure de l'envoi du soir (plist launchd, tableau de bord) |
| `daily_minute` | entier 0-59 | `45` | Minute de l'envoi du soir (17:45 : les brouillons sont livrés par la plateforme vers 18:00) |
| `stats_hour` | entier 0-23 | `7` | Relevé quotidien des comptes (stats publiques → STATS.md, digest) |
| `weekly_veille` | `{ weekday, hour }` | `{ "weekday": 1, "hour": 6 }` | Veille hebdo (import, enrichissement, scoring ; 1 = lundi) |
| `vocabulary` | objet de valeurs localisées | voir ci-dessous | Mots de l'app dans les rendus et les docs générées |
| `cta` | valeur localisée | `"C'est l'app Mon App sur l'App Store"` | Phrase d'appel à mettre en caption |
| `hashtags_core` | valeur localisée → string[] | `["#monapp", "#jeudesoirée"]` | Hashtags toujours présents (le reste tourne, voir `03_LIBRARY/HOOKS.md`) |
| `notify_title` | string ou null | `"Mon App"` | Titre par défaut des notifications ntfy (null → `name`) |

**Valeur localisée** = soit une chaîne (même valeur dans toutes les langues), soit `{ "fr": "…", "en": "…" }`. Repli : `default_language`, puis la première valeur.

### `vocabulary`

| Clé | FR (exemple « Mon App ») | EN | Où c'est utilisé |
|---|---|---|---|
| `item` / `item_plural` | question / questions | question / questions | Libellés des docs générées (`posts-md.py`, tableau de bord, `doctor.js`). C'est l'unité de contenu de l'app (ce qu'elle affiche et fait voter / répondre). |
| `verdict_label` | des joueurs ont répondu comme toi | of players answered like you | Position des bulles POV dans `TEXTES.md` |
| `agree` / `disagree` | d’accord / pas d’accord | agree / disagree | Étiquettes du camembert (`pie-chart.py`) ; thème `default` neutre des cartes si `themes.json` manque (apostrophe typographique `’` comme sur les cartes) |
| `score_label` | sont d’accord. | agree. | Sous le pourcentage : carte score (via `themes.json`), lignes de `POSTS.md` |
| `question` | D'accord ou pas d'accord ? | Agree or disagree? | Sous-titre par défaut de `make-text-video.sh` |
| `kicker` | Question du jour | Question of the day | Kicker par défaut de `make-text-video.sh` |

Accès : `import { project, t, cta, hashtagsCore, scheduledLabel } from "./src/lib/project.js"` ; `from project_config import project, t, cta, themes, theme`. Sans `project.json`, des valeurs neutres (`name` = « Content Agent », `slug` = « app ») permettent de tourner ; `node src/doctor.js` signale le fichier manquant.

## `01_BRAND/DA/themes.json`

```json
{
  "card_brand_text": "Mon App",                       // texte en tête des cartes unité de contenu / texte
  "palette": { "bg": "#343434", "card": "#FFFFFF", "text": "#252525", "btn_no": "#D71C34", "btn_yes": "#00BF62", "fill": "#FFBE59" },
  "fonts": { "regular": "DMSans.ttf", "italic": "DMSans-Italic.ttf", "bold": null, "bold_italic": null, "optical_size": 9 },
  "themes": {
    "default": { "lang": "fr", "fill": "#FFBE59", "btn_no": "Pas d’accord ?", "btn_yes": "D’accord ?", "bar": "Voir le résultat", "deco": null, "score_label": "sont d’accord." },
    "couple":  { "lang": "fr", "fill": "#FFC8CE", "btn_no": "pas d’accord ?", "btn_yes": "d’accord ?", "bar": "Voir les résultats", "deco": "rose.png", "score_label": "sont d’accord." },
    "en":      { "lang": "en", "fill": "#FFBE59", "btn_no": "Disagree?", "btn_yes": "Agree?", "bar": "See the result", "deco": null, "score_label": "agree." }
  }
}
```

- `palette` : couleurs hex (fond, carte, texte, boutons non / oui, vague par défaut). `btn_yes` / `btn_no` servent aussi au camembert.
- `fonts` : noms de fichiers dans `infra/fonts/`. Police variable : axes `[optical_size, weight]` (DM Sans) ; police fixe : fournir `bold` / `bold_italic`, l'axe de graisse est ignoré.
- `themes.<da>` : une variante par valeur `da` des specs et de `accounts.json` (exemple ci-dessus : `default`, `couple`, `en` — noms libres). Champs manquants complétés depuis le vocabulaire de `project.json` (langue `lang`). `deco` = PNG dans `01_BRAND/DA/` posé en haut à droite des cartes.
- Fichier absent : thème `default` neutre (vague `palette.fill`, libellés `agree` / `disagree` / `score_label` de `project.json`).

Vérification de non-régression après modification : régénérer un carrousel dans un dossier temporaire et comparer les JPEG (`cmp`) avec la version précédente.

## `accounts.json`

Voir le champ `_doc` du fichier. Champs par compte : `handle`, `device`, `<backend>_account_id` (identifiant du compte chez le fournisseur d'envoi choisi par `PUBLISH_BACKEND`, ex. `postforme_account_id`), `<backend>_connected_at`, `role`, `icp`, `da` (clé de `themes.json`), `lang` (optionnel : langue du compte, sinon déduite de `da`), `carousel_description`, `paused`, `production_paused` (+ horodatages). Les sections `## <slug>` de `06_CALENDAR/QUEUE.md` doivent porter ces slugs.
