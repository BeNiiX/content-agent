# Publication

## Principe

L'agent **ne publie jamais**. Il envoie le média (carrousel photo ou vidéo) dans les **brouillons TikTok** du
compte, via la Content Posting API *côté créateur* (Login Kit, mode brouillon / boîte de réception). L'humain
ouvre le brouillon dans l'app TikTok, ajoute les textes natifs et la musique, et poste. Pas d'API Business, pas
de compte Business : TikTok ne voit qu'une autorisation créateur classique.

`PUBLISH_BACKEND` dans `.env` choisit **qui** envoie ; le reste du pipeline (plan, fiches, file, message) ne change pas.
Un backend est un module `src/publish/backends/<nom>.js` (`createDraft`, `status`, `listAccounts`, `connectUrl`).

## Fournisseur : Post for Me (`PUBLISH_BACKEND=postforme`, actif depuis le 21/09/2026)

[postforme.dev](https://www.postforme.dev) — 10 $/mois, comptes illimités, 1 000 posts/mois, open source.
Plateforme `tiktok` chez eux = app développeur Login Kit, **lane créateur** (distincte de `tiktok_business`,
qu'on n'utilise pas). `platform_configurations.tiktok.is_draft = true` → le post arrive en brouillon dans la
boîte de réception du compte, via l'API officielle. Médias : `create-upload-url` → `PUT` → `media_url`.

- **Clé** : `POSTFORME_API_KEY` dans `.env`. **Compte** : `postforme_account_id` par compte dans `config/accounts.json`.
- **Timing** : la soumission prend quelques secondes, mais **leur file met 5 à 20 min** à livrer le brouillon
  (17 min mesurées le 21/09). `daily-send.js` soumet tout, puis attend la confirmation réelle de la plateforme
  jusqu'à `DAILY_SEND_WAIT_MIN` (25 min par défaut) avant de tracer et de laisser `daily-notify.js` parler.
  D'où le timer à 17:45 pour des brouillons vers 18:00.
- **Sécurité** : l'objet post renvoyé par leur API contient les jetons TikTok du compte → **ne jamais le
  journaliser en entier**.
- Connexion d'un compte : `CONNEXION_TIKTOK.md`.

Historique : le 20/09/2026, le fournisseur précédent a rendu son API de publication inutilisable en automatique
(publication conditionnée à un formulaire interactif) ; d'où le changement de fournisseur le 21/09/2026.
Tout ce qui suit (règles de champs, limites) vient de TikTok, pas du fournisseur, et reste valable.

## Pipeline d'un brouillon

| Étape | Qui | Commande |
|---|---|---|
| 1. Construire le job | script | `node src/publish/tiktok-draft.js EXP-015` (ou `--all` : toutes les fiches `prêt`) → `data/publish/jobs/EXP-015.json` (fichiers, contrôles TikTok, caption, fiche « à saisir dans l'app », **compte** = champ `account` de la fiche → `<backend>_account_id` via `config/accounts.json`) |
| 2. Plan du jour | script | `node src/publish/daily-plan.js` → `data/publish/daily/<date>.json` : 1 item `planned` par compte (premier contenu `prêt` de sa section de `06_CALENDAR/QUEUE.md`) |
| 3. Envoyer | script | `node src/publish/daily-send.js [--exp EXP-015]` : upload des médias, création du post `is_draft`, attente de la confirmation |
| 4. Tracer | script | automatique (`daily-result.js` → `mark-draft.js`) : fiche EXP `status: brouillon envoyé`, `draft_sent_at`, `tiktok_publish_id` (préfixé par le nom du fournisseur) + ligne QUEUE |
| 5. Prévenir | script | `node src/publish/daily-notify.js` : consignes par compte (titre à taper, texte natif, bulles, son, stock restant) |
| 6. Poster | l'humain | app TikTok → notification « contenu prêt » / brouillons → textes natifs (`in_app.sheet` du job) + musique → Poster |
| 7. Clôturer | script | `node src/publish/mark-draft.js EXP-015 --posted --post-url <url>` |

Tout est enchaîné par `scripts/daily-drafts.sh [--dry-run]` (timer `content-daily-drafts` sur le VPS).

Contrôles faits par `tiktok-draft.js` (limites TikTok) : photos JPEG/WebP seulement (PNG refusé), ≤ 20 Mo,
dans 1080×1920, ≤ 35 images ; vidéos H.264 MP4/MOV, 3-600 s, ≥ 360 px, 23-60 i/s, ≤ 1 Go. Un job avec
`problems` non vide n'est pas envoyé (`daily-plan.js` le passe en `error`). Une caption doit exister dans la
fiche EXP (`Caption : « … »`), sinon le job le signale.

## Champs titre / description d'un carrousel (règle figée le 17/09/2026)

**Ce qu'on envoie** : pour un carrousel, **uniquement la description** (phrase fixe du compte,
`carousel_description` dans `config/accounts.json`, ex. « Pour plus de <unités>, télécharge <app> :) lien en
bio », dans la langue du compte), envoyée comme caption du post. L'humain tape le **titre** dans le champ
« Ajoute un titre accrocheur » de l'app (le job l'indique dans `in_app.tiktok_title_field` : hook ≤ 8 mots,
= texte natif de la slide 1). Pour une vidéo, la caption envoyée = la caption de la fiche (TikTok n'a qu'un champ).

**Pourquoi** : 3 brouillons de test le 17/09/2026 (compte principal et compte EN) ont montré que, quoi qu'on
envoie, un seul champ arrive dans l'éditeur photo de TikTok et il atterrit dans la **description** ; le champ
Titre n'est jamais pré-rempli. Tout texte mis « en titre » est donc soit perdu, soit mal placé.

**Ce que disent les docs** : l'API TikTok (`/v2/post/publish/content/init/`, photos) accepte `post_info.title`
(90 caractères) et `post_info.description` (4 000) et affirme que « title and description … will be reflected in
the editing flow once user clicks on the inbox notification »
([référence photo](https://developers.tiktok.com/doc/content-posting-api-reference-photo-post),
[guide upload](https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content/)). En pratique,
les outils tiers envoient une caption unique, qui atterrit dans la description (même bug côté open source :
[postiz #1059](https://github.com/gitroomhq/postiz-app/issues/1059)). La règle ci-dessus ne dépend pas de
l'explication ; elle est à revérifier si un jour un fournisseur expose `title` et `description` séparément.

**Vidéos** : une vidéo envoyée en boîte de réception **n'accepte aucun texte**. Limite TikTok, valable pour tout
fournisseur : l'endpoint `/v2/post/publish/inbox/video/init/` n'accepte que `source_info`, aucun `post_info` (ni
titre, ni caption, ni confidentialité), contrairement aux photos
([référence](https://developers.tiktok.com/doc/content-posting-api-reference-upload-video)). Personne ne peut donc
pré-remplir la caption d'une vidéo en brouillon : le brouillon arrive avec la caption par défaut de l'app qui a
téléversé (un hashtag du fournisseur), à remplacer dans l'app. Le message du soir envoie la caption dans un
message à part, en bloc copiable d'un tap (Telegram `<code>`), et rappelle de remplacer ce hashtag.

Ce que le brouillon **ne conserve pas** (limite TikTok) : la musique (`music_sound_id` ne marche qu'en
`DIRECT_POST`), et la caption n'est pas garantie. D'où la fiche `in_app` du job : texte de front page, caption à
recoller, section TEXTES.md, son suggéré.

Échec `photo_pull_failed` côté TikTok : TikTok n'a pas réussi à télécharger les images (vu le 17/09 avec des URLs
pourtant accessibles) → vérifier les URLs en HEAD puis réessayer une fois ; un brouillon raté ne consomme pas de quota.

Cadence : au plus une journée de contenus par envoi (1 brouillon par compte et par jour, ce que fait l'envoi du
soir). Les brouillons ne consomment pas le quota de publication TikTok, mais ne pas noyer la boîte de réception.

Autonomie : `00_AGENT/MISSION.md` → `draft_tiktok: auto`. L'envoi en brouillon ne publie rien ; la
publication reste `confirm` (l'humain poste depuis l'app). `DIRECT_POST` est interdit tant que `publish: confirm`.

## Instagram — Graph API (Reels)

`node src/publish/instagram.js --video-url https://... --caption "..." [--share-to-feed] [--dry-run]`
Pré-requis `.env` : `IG_USER_ID`, `IG_ACCESS_TOKEN` (compte pro/créateur lié à une Page). Vidéo à une URL publique.
Pas de mode brouillon côté Instagram : publication directe, donc validation explicite de l'humain avant.
Carrousels Instagram : non implémentés (l'humain les poste depuis l'app avec la même caption).

## Fallback

Publication manuelle depuis l'app : l'agent fournit caption, hashtags, son, textes (fichiers `08_ACCOUNTS/<account>/TEXTES.md`, `Carousels/POSTS.md`).
