---
name: deploy-todo-autres
description: Changements nécessaires ou souhaitables hors de deploy/ (fichiers appartenant à d'autres agents ou à l'humain), relevés pendant la préparation du déploiement VPS — avec l'état de chaque point
type: todo
updated: 2026-09-18
owner: l'humain (arbitre) — les fichiers cités appartiennent aux agents infra / dashboard / doc
---

# À corriger ou décider ailleurs que dans `deploy/`

Demandes classées par importance pour le VPS. État au 18/09/2026 : les points marqués **fait** ont été appliqués (agent de généricisation / cohérence Linux) ; les autres restent ouverts.

## Bloquant ou gênant pour le VPS

1. **`.gitignore`** — déjà revu par un autre agent le 18/09 (`07_ASSETS/photos/_inbox/*`, `deploy/*.local`,
   `deploy/**/*.secret`, `*.log`) : rien à ajouter. Convention retenue : un éventuel fichier de connexion local pour
   `sync-media.sh` s'appellerait `deploy/sync.local` (ignoré) — aujourd'hui les variables `VPS_*` sont lues dans
   `infra/.env` du Mac, déjà hors git.

2. **fait** — **`infra/src/extract.js`** — plantait sous Linux au lieu de dégrader : `run(OCR, …)` appelle `bin/ocr` sans vérifier
   son existence ; `spawnSync` renvoie `stdout: null` (ENOENT) et `res.stdout.trim()` lève une TypeError. Proposition :
   `if (!fs.existsSync(OCR)) { console.warn("OCR indisponible (bin/ocr absent) : texte à l'écran non extrait"); return []; }`
   en tête de `ocrFrames`. La transcription dégrade déjà proprement (`WHISPER` null → `available: false`). Tant que ce
   n'est pas fait, `extract.js` est une étape Mac (documenté dans `deploy/README.md` et `deploy/mac.md`).

3. **fait** (garde `darwin`, bouton masqué hors macOS via `platform` de `/api/state`) — **`infra/src/dashboard/actions.js`** `reveal()` — `spawn("open", ["-R", …])` sans garde de plateforme : sous Linux
   `open` n'est pas la commande attendue (ou est absente → événement `error` non écouté → **le serveur du tableau de bord
   tombe**, systemd le relance mais la requête échoue). Proposition : `if (process.platform !== "darwin") throw new
   Error("révéler dans le Finder : macOS seulement")`, ou `xdg-open`. Et masquer le bouton côté front hors macOS
   (`/api/state` pourrait exposer `platform`).

4. **fait** (systemd sous Linux : `list-timers` + `show -p ExecMainStatus`) — **`infra/src/dashboard/state.js`** `schedule()` — lisait les plists launchd et `launchctl print` ; sur le VPS l'onglet
   « Ce soir » affichera « non installé ». Proposition : si `process.platform === "linux"`, lire
   `systemctl list-timers --output=json content-daily-drafts.timer content-daily-stats.timer` (ou `systemctl show -p
   NextElapseUSecRealtime,LastTriggerUSec,Result <unit>`) et exposer `{ installed, next, last_exit }` avec la même forme.

5. **`infra/scripts/daily-drafts.sh` / `daily-stats.sh`** — rien à corriger pour Linux (relus : bash, `date +%F`,
   `sed`, `grep`, `node`, `claude`). Deux remarques non bloquantes :
   - `daily-plan.js` date le plan avec `today()` = date **UTC** (`toISOString`), le script avec `date +%F` (fuseau du
     service, Europe/Paris). À 18:00 Paris les deux coïncident ; un lancement manuel entre 00:00 et 02:00 Paris
     produirait deux dates différentes (plan de la veille UTC, journal du jour). Proposition : `today()` en local
     (`new Date().toLocaleDateString("sv-SE")`), ou la même source pour les deux.
   - `daily-stats.sh` avec `WEEKLY_CLAUDE=1` lance `claude -p` avec `--allowedTools "Read,Edit,Write,Bash(node:*),Glob,Grep"`
     : OK sur le VPS (session claude.ai). Si la routine cloud `revue-hebdo` est active, laisser `WEEKLY_CLAUDE` à 0 pour
     ne pas annoter deux fois.

## Décisions à prendre (l'humain)

6. **décidé : option (b)** (`infra/scripts/weekly-veille.sh` + `deploy/systemd/content-weekly-veille.*`, lundi 07:00) — **Veille dans le cloud** — `infra/data/**` est hors git, donc la routine `veille-hebdo` ne peut pas enrichir (yt-dlp)
   dans un clone frais ; elle annote seulement. Options : (a) garder l'enrichissement sur le Mac (`npm run sync` +
   `git push` de `02_VEILLE/`) ; (b) le faire sur le VPS après `deploy/sync-media.sh --data` (un timer
   `content-weekly-veille` est facile à ajouter dans `deploy/systemd/` : dimanche 22:00, `bash scripts/sync.sh --limit 60`,
   puis git-sync pousse `02_VEILLE/` avant la routine du lundi 07:00) — risque : blocage de l'IP du VPS par TikTok ;
   (c) versionner `infra/data/tiktok/items.json`, `infra/data/videos/*.json`, `infra/data/tiktok/authors/*.json`
   (quelques Mo, dépôt privé, contiennent la liste des favoris/likes de l'humain) en retirant ces chemins de `.gitignore`,
   et donner à l'environnement cloud un réseau *Custom* (`*.tiktok.com`, `*.tiktokcdn.com`, `*.instagram.com`). Mon
   avis : (a) maintenant, (b) si le Mac devient un goulot, (c) seulement si (b) est bloqué par TikTok.

7. **Branche `main` et routines cloud** — les routines poussent sur `main` à condition que la branche ne soit pas
   protégée et ne porte que des commits « de l'humain » : l'identité git du VPS doit donc être celle du compte GitHub
   (documenté). Si l'on préfère une protection de `main`, les prompts prévoient le repli `claude/<routine>-<date>` + pull
   request, à fusionner depuis le Mac — plus de friction, plus de contrôle.

8. **fait** (SOP_04, QUEUE.md, templates EXP) — **Statut `à monter`** — c'est le contrat routine cloud → VPS (`render-pending.js` passe `à monter` → `prêt` quand
   `media_file` = sortie rendue). Le vocabulaire existe déjà dans `06_CALENDAR/QUEUE.md` (`idée → à tourner → à monter →
   prêt`) mais pas dans le commentaire du template (`04_EXPERIMENTS/_TEMPLATE_EXPERIMENT.md` : `planifié | à tourner |
   prêt | publié | mesuré`) : l'ajouter, et le mentionner dans `SOP_04`.

9. **`infra/config/project.json`** (créé par un autre agent) — `deploy/` le référence pour `{{APP}}` (`name`, `slug`) ;
   confirmer les noms de champs. Les unités systemd restent nommées `content-*` (générique) ; s'il y a un jour deux apps
   sur le même VPS, préfixer par le slug (`APP_USER=content-<slug>`, `APP_DIR=/home/content-<slug>/app`, unités renommées).

## Documentation à mettre à jour (propriétaires : doc / infra)

10. **fait** — **`infra/README.md`** § « Stats des comptes » et « Envoi du soir » — décrivaient launchd et le Mac ; remplacer par un
    renvoi à `deploy/README.md` (timers systemd, `journalctl`, `systemctl start content-daily-drafts`) et noter que le
    tableau de bord est aussi servi par Caddy.
11. **fait** — **`00_AGENT/SOP/SOP_04_PRODUIRE_ET_PUBLIER.md`** § « Envoi automatique du soir » et **`SOP_06`** § « Relevé
    automatique du lundi » — « launchd » → « VPS (systemd) », « Mac éteint » → « VPS : `journalctl -u content-daily-stats` ».
12. **`CLAUDE.md`** (carte du projet) — ajouter la ligne `deploy/` : « runtime VPS, routines cloud, scripts de synchro
    (propriétaire : agent déploiement) » ; et **`README.md`** racine (arborescence).
13. **fait** (`cloud_routines: auto` + commentaire VPS) — **`00_AGENT/MISSION.md`** — le commentaire du champ `autonomy.daily_drafts` décrit l'envoi du soir comme un script du
    Mac ; préciser « exécuté sur le VPS (`deploy/README.md`) », et ajouter une ligne `cloud_routines: auto` (veille,
    specs, revue : texte seulement, jamais de publication ni de dépense) pour que l'autonomie des routines soit écrite.

## Améliorations possibles (non urgentes)

14. **yt-dlp `--cookies <fichier>`** dans `infra/src/lib/ytdlp.js` (variable `YTDLP_COOKIES_FILE`) : sur le VPS il n'y a
    pas de navigateur ; un export de cookies Netscape depuis le Mac (extension « Get cookies.txt ») rsyncé dans
    `infra/data/` permettrait Instagram et un TikTok moins capricieux.
15. **fait** — **`infra/src/doctor.js`** : afficher `claude auth status`, la présence de `.venv/bin/python` + Pillow, et
    `render-pending --dry-run` en résumé (« N specs à rendre, M bloquées »).
16. **Dashboard** : bouton « Rendre les specs en attente » (`render-pending.js`) dans `A.SCRIPTS`, et lecture de
    `infra/data/render/state.json` dans l'onglet Comptes (specs `à monter` par compte).
17. **`git-sync.sh`** ajoute `08_ACCOUNTS/*/posts/**/*.jpg` : si un carrousel est re-rendu avec des pixels différents pour
    un même contenu (police, version Pillow), le dépôt grossit d'un jeu de JPEG à chaque rendu. Acceptable (≈ 2 Mo par
    carrousel) ; sinon envisager Git LFS pour `*.jpg` de `posts/`.
