# infra — scripts de l'agent content

Node ≥ 20, **aucune dépendance npm**. Outils système : `yt-dlp`, `ffmpeg`, `whisper-cpp` (Homebrew) + modèle `models/ggml-small.bin` (huggingface ggerganov/whisper.cpp). OCR : `swiftc -O -o bin/ocr scripts/ocr.swift` (framework Vision, macOS ; absent sous Linux → `extract.js` dégrade proprement, sans texte à l'écran). Rendu d'images : `python3 -m venv .venv && .venv/bin/pip install pillow`. Le runtime de production est un VPS Linux (`deploy/README.md`) ; le Mac reste le poste de création.

```bash
cp .env.example .env         # remplir ce qui est disponible
node src/doctor.js           # vérifie outils, .env, config d'instance, état des données
```

## Configuration d'instance

Le code est générique et multi-app : rien de propre à l'app n'est écrit en dur. Une nouvelle instance se configure sans toucher au code, avec quatre fichiers (schéma détaillé : `config/README.md`) :

| Fichier | Contenu |
|---|---|
| `config/project.json` | Nom, slug (labels launchd / systemd `com.content-agent.<slug>.*`), langues, marchés, `daily_hour`, `weekly_stats`, vocabulaire (`agree`, `disagree`, `score_label`, `verdict_label`, `item`…), CTA, hashtags cœur, titre des notifications |
| `config/accounts.json` | Comptes TikTok : handle, appareil, connecteur Higgsfield, DA, description fixe des carrousels, flags pause |
| `../01_BRAND/DA/themes.json` | Cartes de la DA : texte de marque, palette, polices (`fonts/`), variantes (`default`, `couple`, `en`…) |
| `.env` | Secrets et réglages machine (`.env.example`) |

Helpers : `src/lib/project.js` (`project()`, `t(key, lang)`, `cta(lang)`, `scheduledLabel(task)`) et `scripts/project_config.py` (`project()`, `t()`, `themes()`, `theme(name)`). Après un changement de slug ou d'horaire : sur le VPS, relancer `deploy/install.sh` (réécrit les timers) ; sur un Mac qui planifie encore en local, `node scripts/launchd/make-plists.js` régénère les plists (fichiers générés, hors git).

## Tableau de bord (local)

```bash
npm run dashboard            # → http://127.0.0.1:4747 (ouvre le navigateur ; --no-open, --port 4747)
```
Front vanilla sans dépendance (`src/dashboard/`, écoute uniquement sur 127.0.0.1). Onglets : **Comptes** (stock prêt dans la file, brouillons à finaliser, prochain envoi, interrupteurs *Envoi des brouillons* → `paused` et *Création* → `production_paused` dans `config/accounts.json`) · **File d'attente** (ordre de `06_CALENDAR/QUEUE.md`, média + textes à saisir dans l'app calculés par `buildJob()`, bouton « Marquer posté » → `mark-draft.js --posted`) · **Ce soir** (plan `data/publish/daily/<date>.json`, journal, lancement de `daily-plan.js`, `daily-drafts.sh [--dry-run]`, `daily-notify.js`, état du planificateur : systemd sous Linux, launchd sous macOS) · **Assets** (photos par thème avec usage tiré de PHOTOS.md, screen-records, rushs ; dépôt par glisser-déposer → `07_ASSETS/photos/_inbox/`, `screen-records/<thème>/`, `rushes/` ; boutons `photos-inbox.py` / `--apply`) · **Journal** (scripts lancés, sorties dans `data/dashboard/runs/`). Le serveur ne sert en lecture que `07_ASSETS/`, `08_ACCOUNTS/`, `02_VEILLE/assets/`, `01_BRAND/DA/` ; il n'écrit que `config/accounts.json` (flags), les fichiers déposés, et ce que font les scripts existants. Sur le VPS il est servi derrière Caddy (HTTPS + auth basique, `deploy/Caddyfile`) ; le bouton « Voir dans le Finder » n'existe que sous macOS.

## Pipeline de veille

| Étape | Commande | Entrée → sortie |
|---|---|---|
| Import TikTok | `node src/tiktok/import-export.js <export.json \| dossier \| urls.txt> [--history]` | export officiel / snippet navigateur / liste d'URLs → `data/tiktok/items.json`, `following.json` |
| Import Instagram | `node src/instagram/import-export.js <dossier export>` | `saved_posts.json`, `liked_posts.json`, `following.json` → `data/instagram/*.json` |
| Enrichir | `node src/enrich.js [--limit N] [--since AAAA-MM-JJ] [--platform tiktok] [--url <u>] [--force]` | yt-dlp → `data/videos/<platform>-<id>.json` |
| Comptes | `node src/enrich-authors.js [--limit N] [--ttl-days 7] [--handle h] [--only-videos]` | 30 dernières vidéos par compte → `data/tiktok/authors/*.json` (médiane de vues) |
| Scorer | `node src/score.js [--include-feeds]` | outlier, engagement, partages, vélocité → `data/videos/index.json` |
| Docs | `node src/build-docs.js [--top 40] [--all]` | → `../02_VEILLE/videos/`, `accounts/`, `digests/<date>.md` |
| Tout | `npm run sync` | enchaîne import → enrich → authors → score → docs |
| Télécharger | `node src/download.js [--min-outlier 3] [--key k] [--limit 10]` | MP4 → `data/media/` (analyse locale seulement) |
| Extraire | `node src/extract.js [--key k] [--concept FORMAT-01] [--no-audio] [--force]` | image d'accroche → `../02_VEILLE/assets/hooks/`, OCR du texte à l'écran (Vision, `bin/ocr`) + transcription (whisper.cpp, `models/ggml-small.bin`) → `../02_VEILLE/transcripts/<key>.md` |
| Transcrire (audio seul) | `node src/transcribe.js <key>` | whisper → `data/media/<key>.txt` |

Les fichiers MD générés conservent tout ce qui est écrit **après** le marqueur
`<!-- notes-agent … -->` : l'agent peut annoter, la régénération ne l'écrase pas. Le frontmatter et
le corps généré sont, eux, réécrits à chaque fois.

### Extraction navigateur (sans attendre l'export)

`src/tiktok/browser-extract.js` : coller dans la console sur son profil TikTok (onglet Favoris / J'aime)
ou dans la fenêtre Abonnements. Télécharge `tiktok-<kind>-<date>.json` → déposer dans `data/raw/tiktok/`.
Depuis Claude Code, l'outil Chrome MCP `javascript_tool` peut l'exécuter et lire `window.__CONTENT_EXPORT`.

## Stats des comptes et veille (hebdo, VPS)

```bash
node src/accounts/pull.js [--slug <slug>] [--n 60] [--media]    # profil (abonnés, likes, posts) + N derniers posts avec vues / likes / comm. / partages / sauv., carrousels détectés ; --media : images des 10 meilleurs carrousels (analyse seulement) → data/accounts/<slug>/
node src/accounts/report.js [--slug <slug>] [--date AAAA-MM-JJ]  # → 08_ACCOUNTS/<slug>/STATS.md, 06_CALENDAR/stats/<date>.md (digest à annoter), remplit metrics_d3 / metrics_d7 des fiches EXP dont post_url correspond
bash scripts/weekly-stats.sh                                    # les deux, journal dans data/accounts/weekly.log
bash scripts/weekly-veille.sh [--limit N]                       # veille complète (import des exports de data/raw/ → enrich → authors → score → docs), journal dans data/veille/<date>.log
```
Planifié **sur le VPS** par systemd (`deploy/README.md`) : `content-weekly-veille` (jour de `weekly_stats`, une heure avant) puis `content-weekly-stats` (`weekly_stats` de `config/project.json`, lundi 08:00 par défaut) ; `content-git-sync` pousse ensuite `02_VEILLE/`, `STATS.md` et le digest. Vérifier : `systemctl list-timers 'content-*'`, `journalctl -u content-weekly-stats -n 50` ; lancer hors horaire : `sudo systemctl start content-weekly-stats`. Les exports TikTok bruts arrivent du Mac par `deploy/sync-media.sh --data`. Sur un Mac sans VPS, `node scripts/launchd/make-plists.js` génère des plists launchd équivalents (hors git).
Données publiques uniquement (yt-dlp + page profil) : pas de rétention 3 s ni de temps de visionnage (TikTok Studio, à la main). Comptes privés ou sans post : relevé vide avec la raison. Option `WEEKLY_CLAUDE=1` (dans `.env`) pour enchaîner une revue Claude Code headless (`claude -p`, outils limités à lecture / édition / node) qui annote le digest : désactivé par défaut ; le laisser à 0 si la routine cloud `revue-hebdo` (`deploy/routines/`) est active.

## Envoi du soir (agent quotidien, `daily_hour`)

```bash
bash scripts/daily-drafts.sh [--dry-run]         # 1. daily-plan.js : prochain contenu `prêt` par compte (ordre de 06_CALENDAR/QUEUE.md) → data/publish/daily/<date>.json
                                                 # 2. claude -p (outils restreints : Higgsfield media_upload / confirm / prepare / publish / status + node) envoie chaque item en brouillon, daily-result.js trace + mark-draft
                                                 # 3. daily-notify.js : message de consignes (titre à taper, texte natif, bulles, son, stock restant, comptes sans stock) → iMessage / Telegram / stdout
node src/publish/daily-notify.js --test          # tester le canal (NOTIFY_CHANNEL=ntfy + NTFY_TOPIC ; telegram ; imessage = sans notification car auto-envoi)
```
Planifié **sur le VPS** par `content-daily-drafts.timer` (tous les jours à `daily_hour`, `deploy/README.md` ; `journalctl -u content-daily-drafts`, `sudo systemctl start content-daily-drafts` pour lancer tout de suite). Sur un Mac qui planifie en local (`scripts/launchd/make-plists.js`, plists hors git) : Mac allumé et session ouverte requis (trousseau pour `claude`), et si le projet est dans un dossier protégé (Bureau, Documents) il faut donner **Accès complet au disque** à `/bin/bash` (Réglages Système → Confidentialité et sécurité), sinon launchd échoue avec « Operation not permitted » (exit 126). Notification : **ntfy** (app téléphone abonnée au sujet secret `NTFY_TOPIC`, une notification par compte, expéditeur = ntfy donc alerte réelle ; titre par défaut = `notify_title` de `project.json`) ; iMessage inutile (message envoyé à soi-même, aucune alerte) et impossible sous Linux. Le prompt `scripts/daily-drafts.prompt.md` reçoit `__APP_NAME__` (nom de l'app) et `__DATE__`. Idempotent : une relance le même jour ne renvoie pas sur un compte déjà servi ; un compte sans stock est signalé dans le message, jamais servi deux fois. Un échec TikTok (`FAILED`) est retenté une fois puis signalé, le contenu reste `prêt` pour le lendemain. Journal : `data/publish/daily/<date>.log`, transcript headless `<date>.claude.json`. Prompt de la session : `scripts/daily-drafts.prompt.md`. Coût : ~0,3 $ / brouillon avec `DAILY_MODEL=claude-sonnet-5` (1,6 $ mesuré avec opus).

## Ads

```bash
node src/ads/tiktok-report.js --days 7 [--level ad] [--json] [--save]
node src/ads/tiktok-budget.js --list
node src/ads/tiktok-budget.js --adgroup <id> --budget 40 [--dry-run]
node src/ads/tiktok-budget.js --adgroup <id> --status DISABLE
```

## Publication

```bash
node src/publish/tiktok-draft.js EXP-015 [EXP-016 …] | --all [--json]   # job de brouillon TikTok → data/publish/jobs/<EXP>.json (contrôles média, titre, caption, fiche à saisir dans l'app)
node src/publish/higgsfield-put.js EXP-015 [presigned.json]             # PUT des fichiers vers les URLs de l'outil MCP media_upload
node src/publish/mark-draft.js EXP-015 --publish-id <id> [--posted --post-url <url>]   # trace dans la fiche EXP + QUEUE
node src/publish/instagram.js --video-url … --caption …                 # Reel Instagram (Graph API, publication directe)
```
TikTok = brouillons via le connecteur créateur Higgsfield (MCP), jamais l'API Business. Pipeline complet et connexion : `src/publish/README.md`, `src/publish/CONNEXION_TIKTOK.md`.

## Production (montage)

```bash
node src/produce/pov.js ../08_ACCOUNTS/<account>/specs/EXP-001.json --raw   # FORMAT-01 brut : photo fixe 3 s → extraits du screen-record (gels), sans texte ni voix (textes ajoutés dans TikTok, voir TEXTES.md) — c'est ce que rend le VPS
node src/produce/pov.js ../08_ACCOUNTS/<account>/specs/EXP-001.json         # version montée (macOS seulement) : + bulles Montserrat + voix macOS `say` (police et voix ≠ TikTok)
```
Spec JSON (champs communs à tous les formats : `format`, `rendition`, `account`, `angle`, `da`, `out` → `08_ACCOUNTS/<account>/posts/`) : `photo`, `hook`, `screen`, `segments` (temps dans l'enregistrement, `freezeStart` / `freezeEnd` en s), `bubbles` (`text`, `at`, `dur`, `pos` = hook | card | verdict | low), `voice` (voix macOS `say`, ex. Thomas). Les bulles sont rendues par `scripts/render-bubble.py` (Montserrat Bold sur bandeau noir, `fonts/Montserrat.ttf`). La musique n'est pas incluse : l'ajouter dans TikTok au moment de poster (bibliothèque commerciale).

```bash
.venv/bin/python scripts/carousel.py ../08_ACCOUNTS/<account>/specs/F02/<account>--F02-<angle>-<nn>.json [--preview out.jpg]   # FORMAT-02 carrousel 4:5 : photo brute + 3 × (carte opinion + carte score) ; `da` = default | couple
```

```bash
.venv/bin/python scripts/series-video.py ../08_ACCOUNTS/<account>/specs/F02/<account>--F02-<angle>-v01.json   # FORMAT-02 vidéo 9:16 muette : photo brute + 3 × (carte → vague → score) ; `da` = default | couple
```
Les cartes (opinion, score, texte) sont dans `scripts/da_cards.py`, partagées par `carousel.py`, `series-video.py` et `pie-video.py` ; texte de marque, palette, polices et variantes `da` viennent de `01_BRAND/DA/themes.json` (repli neutre si absent), les libellés du camembert (`pie-chart.py`) du vocabulaire de `config/project.json`.

```bash
python3 src/produce/posts-md.py ../08_ACCOUNTS/<account>   # régénère POSTS.md et TEXTES.md du compte depuis ses specs (vocabulaire : config/project.json ; en-tête : accounts.json)
```

```bash
node src/produce/render-pending.js [--dry-run] [--json] [--account <slug>] [--limit N]   # rend les specs sans sortie (à monter → prêt) ; tourne sur le VPS toutes les heures (content-render-pending) ; --json : résumé machine (doctor.js)
```

## Photos : boîte de dépôt

```bash
.venv/bin/python scripts/photos-inbox.py            # HEIC/PNG → JPG, planche contact numérotée, _triage.json à remplir (07_ASSETS/photos/_inbox/)
.venv/bin/python scripts/photos-inbox.py --apply    # renomme, range par thème, met à jour PHOTOS.md
```

## Utilitaires ffmpeg

```bash
scripts/normalize.sh in.mov out.mp4                       # 1080x1920 H.264 30 fps
scripts/make-text-video.sh "<unité de contenu>" out.mp4 7 "D'accord ?"   # texte plein écran (sous-titre / kicker par défaut : vocabulaire `question` / `kicker` de config/project.json ; marque en bas : `name`)
```

## Modèle de données (`data/videos/<key>.json`)

```json
{ "key": "tiktok-7234…", "platform": "tiktok", "url": "…", "author": {"handle": "…", "followers": 12000},
  "description": "…", "hashtags": ["#…"], "music": {"title": "…", "artist": "…"}, "duration_s": 17,
  "stats": {"views": 1200000, "likes": 98000, "comments": 2100, "shares": 15000, "saves": null},
  "posted_at": "2026-08-30T…", "saved_at": "2026-09-02T…", "sources": ["favorites"],
  "outlier_score": 12.4, "engagement_rate": 0.096, "share_rate": 0.0125, "comment_rate": 0.0018,
  "velocity": 80000, "priority": 24.3, "author_median_views": 97000 }
```

## Données et confidentialité

`data/` est ignoré par git : exports personnels, JSON yt-dlp, vidéos téléchargées. Rien n'est
réutilisé dans des publications ; les vidéos servent uniquement à l'analyse.
