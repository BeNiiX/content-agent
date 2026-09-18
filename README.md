# content-agent — agent de création de contenu multi-comptes

Framework pour faire tourner un **agent IA creative strategist + content creator** au service d'une app mobile :
veille TikTok / Instagram, bibliothèque de formats, production de carrousels et de vidéos, envoi quotidien en
**brouillon TikTok** sur plusieurs comptes créateur, stats hebdo, tableau de bord, campagnes paid. Chaque app est
une **instance** de ce framework (voir `templates/`) ; ce dépôt-ci est l'instance décrite dans `infra/config/project.json`.

> Point d'entrée agent : [`CLAUDE.md`](CLAUDE.md). Déploiement : [`deploy/README.md`](deploy/README.md).
> Projet vierge pour une autre app : [`templates/README.md`](templates/README.md).

## Le cycle

```
   VEILLE ──► DOCUMENTER ──► ADAPTER ──► PRODUIRE ──► BROUILLON ──► PUBLIER ──► MESURER ──► RÉALLOUER
 (infra +     (03_LIBRARY)  (03_LIBRARY  (07_ASSETS → (VPS 18:00,   (humain,   (stats lundi, (05_CAMPAIGNS)
  02_VEILLE)                 /formats)   08_ACCOUNTS)  notification) dans l'app) 04_EXPERIMENTS)
                                    ▲                                                   │
                                    └──────────────── ce qui marche ────────────────────┘
```

1. **Veille** : `infra/` importe les vidéos enregistrées / likées et les comptes suivis, enrichit chaque vidéo
   (yt-dlp), calcule un *outlier score* (vues ÷ médiane du compte) et génère `02_VEILLE/`.
2. **Documenter** : chaque vidéo performante est déconstruite en concept ; un format n'est validé qu'une fois approuvé
   par l'humain (`03_LIBRARY/formats/`).
3. **Adapter / produire** : specs JSON par compte (`08_ACCOUNTS/<slug>/specs/`) rendues en carrousels 4:5 ou vidéos
   9:16 (Pillow + ffmpeg), textes natifs et captions dans `POSTS.md` / `TEXTES.md`.
4. **Brouillon** : tous les jours à 18:00, le VPS envoie le prochain contenu `prêt` de chaque compte dans les brouillons
   TikTok via le connecteur Higgsfield (jamais l'API Business, jamais de publication directe) et notifie l'humain
   (ntfy) avec les consignes : titre à taper, texte natif, bulles, son, stock restant.
5. **Publier** : l'humain ouvre le brouillon dans l'app, ajoute titre / textes / musique, poste.
6. **Mesurer** : chaque post = une fiche `04_EXPERIMENTS/EXP-nnn.md` ; relevé public des comptes chaque lundi
   (`08_ACCOUNTS/<slug>/STATS.md`, `06_CALENDAR/stats/`), revue hebdo.
7. **Réallouer** : les gagnants organiques deviennent des créas paid ; budgets selon `05_CAMPAIGNS/BUDGET_RULES.md`.

## Architecture d'exécution

```
   MAC (Claude Code interactif)           GITHUB (dépôt privé)            CLOUD (routines Claude Code)
   tournage, photos, éditorial   ──push──►  textes, specs, fiches,  ◄──push──  veille, specs, fiches,
   git pull / push                          photos JPEG, config               revue hebdo (texte seulement)
   deploy/sync-media.sh (vidéos) ─┐                 │ pull (10 min)
                                  ▼                 ▼
                              VPS (runtime) : clone + vidéos + Claude Code CLI connecté au compte
                              ├─ render-pending  (toutes les heures) : rend les specs sans sortie
                              ├─ daily-drafts    (18:00)            : brouillons TikTok + notification ntfy
                              ├─ weekly-veille   (lundi 07:00)      : import / enrichissement / scoring de la veille
                              ├─ weekly-stats    (lundi 08:00)      : stats publiques des comptes
                              ├─ auth-check      (09:00)            : session Claude encore valide ? sinon notification
                              ├─ git-sync        (10 min)           : pull / commit des statuts / push
                              └─ Caddy : tableau de bord + /media/ (HTTPS, auth)
```

## Ce qui est versionné, ce qui ne l'est pas

| Dans git | Hors git (`.gitignore`) |
|---|---|
| Docs, SOP, skill, code, config d'instance (`project.json`, `accounts.json`, `themes.json`), specs, fiches, files, stats, **photos JPEG** | `infra/.env`, `01_BRAND/ACCOUNTS_CREDENTIALS.md`, vidéos et rushs (`*.mp4`, `*.mov` → rsync vers le VPS), `infra/data/` (exports, caches, jobs, plans, logs), `.venv`, modèles |

## Arborescence

```
├── CLAUDE.md, README.md         instructions agent, ce fichier               framework
├── .claude/skills/              skill creation-contenu-viral                 framework
├── 00_AGENT/                    SOP/, SCORING, CREATIVE_FRAMEWORK (framework) · MISSION, PLAYBOOK, REFERENCES (instance)
├── 01_BRAND/                    APP_CONTEXT, AUDIENCE, VOICE, ANGLES, ACCOUNTS, DA/themes.json        instance
├── 02_VEILLE/                   COMPETITORS + accounts/ videos/ digests/ (générés)                    instance
├── 03_LIBRARY/                  INDEX, HOOKS, FORMATS, formats/ (validés), archive/                   instance
├── 04_EXPERIMENTS/              LOG.md + une fiche par contenu                                         instance
├── 05_CAMPAIGNS/                BUDGET_RULES, CAMPAIGNS + une fiche par campagne                       instance
├── 06_CALENDAR/                 QUEUE.md (par compte, = ordre d'envoi), stats/ (digests du lundi)     instance
├── 07_ASSETS/                   photos/ (par thème + _inbox/), screen-records/, rushes/, banque JSON    instance
├── 08_ACCOUNTS/<slug>/          specs/, posts/, POSTS.md, TEXTES.md, STATS.md, HEADLINES.md            instance
├── infra/                       code + config/ (instance) + data/ (hors git)                          framework
├── deploy/                      VPS : install.sh, systemd/, Caddyfile, sync-media.sh, git-sync.sh, routines/   framework
└── templates/                   workspace vierge, new-project.sh, make-template.sh                    framework
```

## Démarrage rapide

**Sur cette instance (Mac)** :
```bash
cd infra && cp .env.example .env         # remplir ce qui est disponible
node src/doctor.js                       # état de l'environnement
npm run dashboard                        # tableau de bord local
```

**Déployer le runtime** : suivre `deploy/README.md` (VPS Ubuntu, `deploy/install.sh`, `claude login`, timers, Caddy).

**Créer une instance pour une autre app** : `templates/new-project.sh <dossier> "<Nom>" <slug>` puis remplir
`01_BRAND/`, `00_AGENT/MISSION.md`, `infra/config/`, connecter les comptes TikTok (`infra/src/publish/CONNEXION_TIKTOK.md`).

**Brancher des agents cloud** : prompts prêts dans `deploy/routines/`, à planifier avec `/schedule` dans Claude Code.

## Sources de données et limites connues

| Besoin | Méthode retenue | Limite |
|---|---|---|
| Favoris / likes / following TikTok | Export officiel « Télécharger tes données » (JSON) + extraction navigateur (`infra/src/tiktok/browser-extract.js`) | L'API TikTok n'expose pas ces listes. L'export prend 1 à 3 jours. |
| Métadonnées vidéo et stats des comptes | `yt-dlp` + lecture des pages publiques (`infra/src/accounts/pull.js`) | Pas de rétention ni de temps de visionnage (TikTok Studio, à la main). Un compte d'une autre région peut être illisible d'ici. |
| Brouillons TikTok | Connecteur Higgsfield MCP (`media_upload` → `tiktok_prepare_publish` → `tiktok_publish`, mode `UPLOAD_TO_DRAFT`) | Compte créateur, app Higgsfield auditée. Le champ Titre d'un carrousel n'est jamais rempli : l'humain le tape (`infra/src/publish/README.md`). 13 posts / 24 h par compte. |
| Publication Instagram | Graph API (`infra/src/publish/instagram.js`) | Compte pro / créateur + Page Facebook + app Meta. Vidéo à une URL publique. |
| Rapports & budgets TikTok Ads | Marketing API (`infra/src/ads/`) | App développeur TikTok avec accès Marketing API + token long. |
| Notification quotidienne | ntfy (push, expéditeur ≠ l'humain) ; Telegram possible ; iMessage inutile (auto-envoi sans alerte) | Le sujet ntfy doit rester secret. |
