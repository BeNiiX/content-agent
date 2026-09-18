---
name: deploy-mac
description: Ce qui reste côté Mac une fois le VPS en service — rituel git + rsync, désinstallation des jobs launchd, opérations encore impossibles ailleurs
type: runbook
updated: 2026-09-18
---

# Côté Mac, après la mise en service du VPS

Le Mac redevient un poste de **création et d'édition** : il ne planifie plus rien. Trois réflexes, une désinstallation.

## 1. Avant de travailler : `git pull`

Le VPS pousse toutes les 10 min (statuts des fiches, STATS.md, JPEG rendus, digests) et les routines cloud poussent leurs
specs / concepts / mémos. Toujours commencer par :

```bash
cd <racine du clone>          # le dossier qui contient CLAUDE.md et infra/
git pull --rebase --autostash
```

Et pousser en fin de session (`git add … && git commit && git push`). Un commit du VPS entre-temps se rebase sans conflit
dans l'immense majorité des cas (le VPS ne touche qu'à des champs de frontmatter et à des fichiers générés).

## 2. Après un tournage, une photo, un rendu local : `deploy/sync-media.sh`

- **Photos** (`07_ASSETS/photos/…`, JPEG) et **specs / fiches** → git (`git push`).
- **Vidéos** (screen-records, rushs, MP4 rendus sur le Mac) → rsync :

```bash
deploy/sync-media.sh --dry-run    # vérifier
deploy/sync-media.sh              # Mac → VPS (jamais 07_ASSETS/legacy, jamais work/)
deploy/sync-media.sh --from-vps   # rapatrier les MP4 rendus par le VPS (les JPEG et fiches arrivent par git pull)
```

Une fois pour toutes dans `infra/.env` du Mac : `VPS_HOST=<IP ou domaine>` (`VPS_USER`, `VPS_PATH`, `VPS_SSH_PORT` si
différents des défauts `content`, `/home/content/app`, `22`). La clé SSH du Mac doit être dans
`/home/content/.ssh/authorized_keys` sur le VPS (fait à l'étape 1 du README).

Ordre conseillé après un tournage : trier les photos (`photos-inbox.py`), `git push`, puis `sync-media.sh`. Le VPS rend
les specs en attente dans l'heure (`content-render-pending`), ou tout de suite avec
`ssh content@<VPS> 'sudo systemctl start content-render-pending'` (si sudo est autorisé) — sinon depuis root.

## 3. Désinstaller les deux jobs launchd (devenus inutiles)

Les tâches launchd `com.content-agent.<slug>.daily-drafts` (`daily_hour`) et `com.content-agent.<slug>.weekly-stats`
(`weekly_stats`) — `<slug>` = `infra/config/project.json → slug` ; une instance plus ancienne a pu les installer sous un autre
label, vérifier avec `launchctl list | grep -i content` — ne doivent plus tourner sur le Mac : elles enverraient des brouillons
en double et écriraient des relevés concurrents. À exécuter à la main, une fois (ces commandes ne sont pas lancées par l'agent) :

```bash
SLUG=$(node -p 'require("./infra/config/project.json").slug')
launchctl bootout gui/$(id -u)/com.content-agent.$SLUG.daily-drafts
launchctl bootout gui/$(id -u)/com.content-agent.$SLUG.weekly-stats
rm -f ~/Library/LaunchAgents/com.content-agent.$SLUG.daily-drafts.plist \
      ~/Library/LaunchAgents/com.content-agent.$SLUG.weekly-stats.plist
launchctl print gui/$(id -u)/com.content-agent.$SLUG.daily-drafts 2>&1 | head -1   # doit dire "Could not find service"
```

`launchctl bootout` répond « No such process » si le job n'était pas chargé : sans importance. Les plists ne sont plus
versionnés (`infra/scripts/launchd/*.plist` est dans `.gitignore`, générés par `make-plists.js` seulement si un Mac doit
planifier en local) ; le tableau de bord lit l'état de launchd sous macOS et de systemd sous Linux. L'« Accès complet au
disque » éventuellement accordé à `/bin/bash` pour launchd peut être retiré (Réglages Système → Confidentialité et sécurité →
Accès complet au disque).

Ne pas lancer `bash scripts/daily-drafts.sh` (sans `--dry-run`) sur le Mac tant que le VPS est en service : le plan du
jour est idempotent **par machine**, pas entre machines.

## 4. Ce qui reste impossible ailleurs que sur le Mac

| Opération | Pourquoi | Commande |
|---|---|---|
| Montage POV **avec voix** (`pov.js` sans `--raw`) | voix macOS `say` | `node src/produce/pov.js <spec>` puis `sync-media.sh` |
| OCR + transcription des vidéos de veille (`extract.js`) | `bin/ocr` (Vision) et `whisper-cpp` | `node src/extract.js --key …` puis `git push` (`02_VEILLE/transcripts`, `assets/hooks`) |
| Veille avec cookies navigateur (Instagram, TikTok bloqué) | `YTDLP_COOKIES_FROM_BROWSER=chrome` | `npm run sync` puis `git push` de `02_VEILLE/` |
| Export TikTok / extraction navigateur | fichiers personnels, Chrome | `node src/tiktok/import-export.js …` (puis `sync-media.sh --data` si la veille doit tourner sur le VPS) |
| FORMAT-03 `mode: face` (calage sur un rush) | il faut voir la vidéo | écrire la spec sur le Mac, `git push` ; le VPS rend (le rush a été rsyncé) |
| Tableau de bord local | inchangé | `npm run dashboard` — ou `https://DOMAIN/` (VPS) pour la même chose |
| Sessions Claude Code interactives (SOP, arbitrages, tests) | c'est ton poste | `claude` à la racine ; `/schedule` pour gérer les routines cloud |
