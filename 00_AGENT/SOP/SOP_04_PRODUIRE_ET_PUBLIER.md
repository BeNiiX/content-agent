---
name: sop-04-produire-et-publier
description: Du fichier vidéo au post publié sur TikTok et Instagram, avec fiche expérience — statuts, envoi en brouillon, envoi automatique du soir (VPS)
type: sop
updated: 2026-09-18
---

# SOP 04 — Produire et publier

## Statuts d'un contenu (fiche EXP et `06_CALENDAR/QUEUE.md`)

`idée` → `à tourner` → `à monter` → `prêt` → `brouillon envoyé` → `publié` → `mesuré`.

- `à tourner` : il manque un rush, une photo ou un screen-record (l'humain).
- `à monter` : **la spec est écrite** (`08_ACCOUNTS/<account>/specs/`), le rendu est attendu du VPS : `infra/src/produce/render-pending.js`
  (timer `content-render-pending`, toutes les heures) rend la spec et passe la fiche en `prêt` quand `media_file` = la sortie
  rendue. C'est le contrat entre les routines cloud (qui écrivent des specs) et le VPS (qui rend). Un asset manquant laisse la
  fiche en `à monter` (rsync depuis le Mac : `deploy/sync-media.sh`).
- `prêt` : le fichier existe, la fiche a `media_file` + `Caption`, la ligne QUEUE est en place → candidat à l'envoi du soir.

## Pré-requis

- Fichier final dans `08_ACCOUNTS/<account>/posts/` (vidéo 9:16 MP4 1080×1920, 30 i/s, 3-60 s ; carrousel = dossier de JPEG 4:5, nombre de slides fixé par le format).
  Conversion si besoin : `infra/scripts/normalize.sh <in> <out>` (ffmpeg, H.264, AAC, 30 fps).
- Fiche `04_EXPERIMENTS/EXP-<NNN>.md` créée avec hypothèse.
- Ligne dans `06_CALENDAR/QUEUE.md` avec date, plateforme, caption, hashtags, son.

## TikTok — envoi en brouillon (connecteur créateur Higgsfield, MCP)

Rien n'est publié par l'agent : le média part dans les **brouillons TikTok**, l'humain finalise dans l'app.
Compte créateur, jamais l'API Business. Connexion initiale : `infra/src/publish/CONNEXION_TIKTOK.md`.

1. La fiche EXP doit contenir `media_file` et une ligne `Caption : « … »` ; charger la skill `creation-contenu-viral` et cocher sa checklist.
2. `cd infra && node src/publish/tiktok-draft.js EXP-015` → job dans `data/publish/jobs/`. Zéro `problems` sinon corriger le média.
3. `tiktok_accounts` → `connector_id` (`active`, sinon `tiktok_reconnect`).
4. `media_upload` (fichiers du job) → sauver la réponse dans `data/publish/jobs/EXP-015.presigned.json` →
   `node src/publish/higgsfield-put.js EXP-015` → `media_confirm`.
5. `tiktok_prepare_publish` en `UPLOAD_TO_DRAFT` (photo_images dans l'ordre des slides, cover 0 ; ou video_url). Carrousel : envoyer **uniquement** la description (phrase fixe `carousel_description`, passée dans le paramètre `title` du connecteur, jamais de paramètre `description`) ; le champ Titre de l'app n'est jamais rempli par le connecteur, **l'humain tape le titre** (`in_app.tiktok_title_field`). Détail et sources : `infra/src/publish/README.md`. Vidéo : `title` = caption.
   puis `tiktok_publish` avec les confirmations demandées et `is_aigc` du job. `tiktok_publish_status` jusqu'à OK.
6. `node src/publish/mark-draft.js EXP-015 --publish-id <id>` → fiche EXP `brouillon envoyé` + QUEUE.
7. Remettre à l'humain la fiche `in_app` du job : texte de front page, **titre à taper** (carrousel), section TEXTES.md, son.
   Il ouvre le brouillon dans l'app, saisit textes + musique, poste.
8. Quand c'est posté : `node src/publish/mark-draft.js EXP-015 --posted --post-url <url>`.

Limites : la musique et la caption ne survivent pas toujours au brouillon (TikTok), d'où l'étape 7.
Cadence : au plus une journée de contenus par envoi, 5 / min, 13 / 24 h.
`DIRECT_POST` seulement si `MISSION.md` → `publish: auto`.

Fallback : publication manuelle depuis l'app TikTok (l'humain), l'agent fournit caption + hashtags + son.

## Envoi automatique du soir (si `MISSION.md` → `daily_drafts: auto`)

Exécuté **sur le VPS** (`deploy/README.md`, timer `content-daily-drafts`, plus de launchd sur le Mac) chaque jour à
`project.json → daily_hour` : `infra/scripts/daily-drafts.sh` envoie en brouillon le **prochain contenu `prêt`** de la section
de chaque compte connecté dans `06_CALENDAR/QUEUE.md` (ordre du tableau), puis envoie à l'humain une notification (canal
`NOTIFY_CHANNEL` de `infra/.env`, ntfy recommandé) avec, par compte : titre à taper, texte natif de la slide 1, bulles +
timings pour une vidéo, son, stock restant ; et « PLUS DE STOCK » pour un compte vide. Conséquences pour l'agent :
**l'ordre de QUEUE.md est l'ordre d'envoi**, une fiche passe automatiquement en `brouillon envoyé` (commit + push par
`content-git-sync`), et il faut garder ≥ 7 contenus `prêt` ou `à monter` par compte actif (la notification signale ⚠️ sous 3).
Le lendemain, vérifier `data/publish/daily/<date>.json` sur le VPS ou `journalctl -u content-daily-drafts` (échecs) et le
relevé des posts effectivement publiés (relevé hebdo, SOP_06). Lancer hors horaire : `sudo systemctl start content-daily-drafts`.

## Instagram Reels — via Graph API

Pré-requis dans `infra/.env` : `IG_USER_ID`, `IG_ACCESS_TOKEN` (compte pro/créateur lié à une Page).
La vidéo doit être accessible par URL publique (hébergement public au choix : bucket de l'app, Higgsfield, `/public-media/` de Caddy sur le VPS…).

```bash
node src/publish/instagram.js --video-url https://... --caption "..." [--share-to-feed] [--dry-run]
```

Le script crée le conteneur REELS, attend `status_code = FINISHED`, publie, et écrit l'ID du média
dans la fiche expérience si `--exp EXP-012` est fourni.

Fallback : Meta Business Suite (planification manuelle) ou Buffer / Later.

## Republication Instagram en Reel d'essai

Chaque TikTok publié est republié sur Instagram en **Reel d'essai** (trial reel : Instagram le diffuse à des non-abonnés sans l'afficher sur le profil ; s'il performe, on le promeut en Reel normal). Depuis l'app Instagram : Reel → « Essai » activé avant publication. Via Graph API : pas d'option trial, publier normalement. Règle issue de la skill `creation-contenu-viral`.

## Après publication (obligatoire)

- Vérifier la checklist de la skill `creation-contenu-viral` (CTA en dernière bulle **et** en description, 3-4 hashtags max).
- Renseigner dans la fiche expérience : `published_at`, `platform`, `post_url`, `caption`, `hook`, `sound`.
- Passer la ligne de `QUEUE.md` en `publié`.
- Programmer la relève J+3 et J+7 (le playbook quotidien s'en charge).
