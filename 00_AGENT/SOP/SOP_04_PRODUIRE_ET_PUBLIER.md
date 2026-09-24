---
name: sop-04-produire-et-publier
description: Du fichier vidéo au post publié sur TikTok et Instagram, avec fiche expérience — statuts, envoi en brouillon, envoi automatique du soir (VPS)
type: sop
updated: 2026-09-21
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

## TikTok — envoi en brouillon (API créateur, fournisseur `PUBLISH_BACKEND`)

Rien n'est publié par l'agent : le média part dans les **brouillons TikTok** (boîte de réception), l'humain
finalise dans l'app. Compte créateur, jamais l'API Business. Autorisation initiale d'un compte :
`infra/src/publish/CONNEXION_TIKTOK.md`.

1. La fiche EXP doit contenir `media_file` et une ligne `Caption : « … »` ; charger la skill `creation-contenu-viral` et cocher sa checklist.
2. `cd infra && node src/publish/tiktok-draft.js EXP-015` → job dans `data/publish/jobs/`. Zéro `problems` sinon corriger le média.
3. `node src/publish/daily-plan.js` → le plan du jour prend le premier contenu `prêt` du compte dans `06_CALENDAR/QUEUE.md`
   (un compte sans `<backend>_account_id` ou en pause est ignoré).
4. `node src/publish/daily-send.js [--exp EXP-015]` : upload des médias chez le fournisseur, création du post en
   brouillon, puis attente de la confirmation réelle de la plateforme (5 à 20 min, `DAILY_SEND_WAIT_MIN`).
   Carrousel : on envoie **uniquement** la description (phrase fixe `carousel_description`) comme caption ; le champ
   Titre de l'app n'est jamais pré-rempli, **l'humain tape le titre** (`in_app.tiktok_title_field`). Vidéo : aucun
   texte n'arrive (limite TikTok), la caption est envoyée dans le message du soir. Détail et sources : `infra/src/publish/README.md`.
5. Traçage automatique (`daily-result.js` → `mark-draft.js`) : fiche EXP `brouillon envoyé` + QUEUE. À la main :
   `node src/publish/mark-draft.js EXP-015 --publish-id <id>`.
6. Remettre à l'humain la fiche `in_app` du job : texte de front page, **titre à taper** (carrousel), section TEXTES.md, son.
   Il ouvre le brouillon dans l'app, saisit textes + musique, poste.
7. Quand c'est posté : `node src/publish/mark-draft.js EXP-015 --posted --post-url <url>`.

Limites : la musique et la caption ne survivent pas au brouillon (TikTok), d'où l'étape 6.
Cadence : au plus une journée de contenus par envoi (1 brouillon par compte et par jour).
La publication directe (`DIRECT_POST`) est interdite tant que `MISSION.md` → `publish: confirm`.

Fallback : publication manuelle depuis l'app TikTok (l'humain), l'agent fournit caption + hashtags + son.

## Envoi automatique du soir (si `MISSION.md` → `daily_drafts: auto`)

Exécuté **sur le VPS** (`deploy/README.md`, timer `content-daily-drafts`, plus de launchd sur le Mac) chaque jour à
`project.json → daily_hour` : `infra/scripts/daily-drafts.sh` envoie en brouillon le **prochain contenu `prêt`** de la section
de chaque compte relié au fournisseur d'envoi dans `06_CALENDAR/QUEUE.md` (ordre du tableau), puis envoie à l'humain une notification (canal
`NOTIFY_CHANNEL` de `infra/.env`, ntfy recommandé) avec, par compte : titre à taper, texte natif de la slide 1, bulles +
timings pour une vidéo, son, stock restant ; et « PLUS DE STOCK » pour un compte vide. Conséquences pour l'agent :
**l'ordre de QUEUE.md est l'ordre d'envoi**, une fiche passe automatiquement en `brouillon envoyé` (commit + push par
`content-git-sync`), et il faut garder ≥ 7 contenus `prêt` ou `à monter` par compte actif (la notification signale ⚠️ sous 3).
Le lendemain, vérifier `data/publish/daily/<date>.json` sur le VPS ou `journalctl -u content-daily-drafts` (échecs) et le
relevé des posts effectivement publiés (relevé hebdo, SOP_06). Lancer hors horaire : `sudo systemctl start content-daily-drafts`.

## Instagram Reels — via Graph API

Pré-requis dans `infra/.env` : `IG_USER_ID`, `IG_ACCESS_TOKEN` (compte pro/créateur lié à une Page).
La vidéo doit être accessible par URL publique (hébergement public au choix : bucket de l'app, `/public-media/` de Caddy sur le VPS…).

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
