---
name: sop-01-veille-tiktok
description: Récupérer les vidéos enregistrées / likées et les comptes suivis sur TikTok (et Instagram), les enrichir, les scorer et produire un digest annoté
type: sop
updated: 2026-09-18
---

# SOP 01 — Veille TikTok (et Instagram)

## Entrées possibles

| Source | Comment l'obtenir | Où la déposer |
|---|---|---|
| **Export officiel TikTok** (recommandé, complet) | App TikTok : Profil > ☰ > Réglages et confidentialité > Compte > Télécharger tes données > format **JSON** > demander. Disponible sous 1-3 jours, puis à télécharger sous 4 jours. Contient favoris, likes, following, historique. | `infra/data/raw/tiktok/<date>/` (zip décompressé) |
| **Extraction navigateur** (instantané, partiel) | Ouvrir tiktok.com connecté, aller sur Profil > onglet Favoris (ou Likes), coller `infra/src/tiktok/browser-extract.js` dans la console (ou l'exécuter via l'outil Chrome MCP `javascript_tool`). Le script scrolle, collecte les liens et télécharge `tiktok-favorites-<date>.json`. Même chose sur la fenêtre « Abonnements ». | `infra/data/raw/tiktok/` |
| **Liste manuelle** | Coller des URLs (une par ligne) | `infra/data/raw/urls.txt` |
| **Export Instagram** | Comptes Center > Tes informations et autorisations > Télécharger tes informations > JSON. Dossier `saved/` et `followers_and_following/`. | `infra/data/raw/instagram/<date>/` |

## Pipeline

```bash
cd infra
node src/tiktok/import-export.js data/raw/tiktok/<date>      # → data/tiktok/items.json, following.json
node src/instagram/import-export.js data/raw/instagram/<date> # → data/instagram/items.json, following.json
node src/enrich.js                # yt-dlp --dump-json par URL non encore enrichie → data/videos/<id>.json
node src/enrich-authors.js        # médiane de vues par compte (30 dernières vidéos) → data/tiktok/authors/<handle>.json
node src/score.js                 # outlier_score, engagement_rate… → data/videos/index.json
node src/build-docs.js            # → 02_VEILLE/accounts/*.md, videos/*.md, digests/<date>.md
# ou tout d'un coup :
npm run sync
```

Sur le VPS (`deploy/`), le même pipeline tourne chaque semaine par le timer `content-weekly-veille`
(`infra/scripts/weekly-veille.sh`, journal `infra/data/veille/<date>.log`) à partir des exports déposés dans
`infra/data/raw/` par `deploy/sync-media.sh --data` ; `git-sync` pousse ensuite `02_VEILLE/`.

Options utiles : `node src/enrich.js --limit 50` (ne traite que 50 URLs), `--since 2026-08-01`
(ignore les saves plus anciens), `node src/download.js --min-outlier 3` (télécharge les MP4 des outliers
dans `data/media/` pour visionnage / transcription).

## Annoter le digest (travail de l'agent)

Ouvrir `02_VEILLE/digests/<date>.md`. Pour chaque ligne, remplir la colonne **décision** :

- `documenter` → lancer SOP_02 (créer le concept ou rattacher à un concept existant).
- `ignorer` + raison en 5 mots (hors niche, pas transposable, déjà couvert).
- `plus tard` si la vidéo est récente et que la vélocité n'est pas encore lisible.

Puis remplir la section **Tendances de la semaine** : sons récurrents, hooks récurrents, formats
nouveaux, comptes qui montent (`02_VEILLE/accounts/*.md` colonne *tendance*).

## Ajouter un compte à suivre

Éditer `02_VEILLE/COMPETITORS.md` (et `infra/config/competitors.json`). Le prochain
`enrich-authors` récupère ses 30 dernières vidéos même sans les avoir enregistrées, ce qui
permet de surveiller un concurrent en continu.

## Ce que l'agent ne fait pas

- Pas de scraping massif ni de contournement de login. Uniquement les données de l'humain propriétaire des comptes
  (export, navigateur connecté) et les pages publiques via yt-dlp à faible cadence.
- Pas de téléchargement de vidéos pour réutilisation : uniquement pour analyse locale.
