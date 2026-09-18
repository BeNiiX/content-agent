# Publication

## TikTok — brouillons via le connecteur créateur (Higgsfield MCP)

Principe : l'agent **n'a jamais publié**. Il envoie le média (carrousel photo ou vidéo) dans les
**brouillons TikTok** du compte via la Content Posting API *côté créateur* (Login Kit sur le compte
TikTok de l'humain, mode `UPLOAD_TO_DRAFT`). L'humain ouvre le brouillon dans l'app TikTok, ajoute les
textes natifs et la musique, et poste. Pas d'API Business, pas de compte Business, pas d'app développeur à
faire auditer : l'app TikTok auditée est celle de Higgsfield, TikTok ne voit qu'une autorisation créateur classique.

Pourquoi pas notre propre app TikTok for Developers : tant qu'elle n'est pas auditée (plusieurs semaines),
tout contenu passé par elle est forcé en privé, et les carrousels exigent des images servies depuis un domaine
vérifié. Le connecteur Higgsfield règle les deux.

### Connexion (une fois par compte) — voir `CONNEXION_TIKTOK.md`

Multi-comptes : un connecteur Higgsfield par compte TikTok (`tiktok_connect` avec un `name` distinct), registre dans
`config/accounts.json` + `01_BRAND/ACCOUNTS.md`. Une fiche EXP sans `account`, ou dont le compte n'a pas de
`connector_id`, produit un job avec `problems` : ne pas envoyer.

### Pipeline d'un brouillon

| Étape | Qui | Commande / outil |
|---|---|---|
| 1. Construire le job | script | `node src/publish/tiktok-draft.js EXP-015` (ou `--all` : toutes les fiches `prêt`) → `data/publish/jobs/EXP-015.json` (fichiers, contrôles TikTok, titre, caption, fiche « à saisir dans l'app », **compte** = champ `account` de la fiche → `connector_id` via `config/accounts.json`) |
| 2. URLs d'upload | agent (MCP) | `media_upload` avec `job.mcp["1_media_upload"].files` → réponse sauvegardée dans `data/publish/jobs/EXP-015.presigned.json` |
| 3. Envoyer les octets | script | `node src/publish/higgsfield-put.js EXP-015` → `EXP-015.uploaded.json` (media_ids) |
| 4. Confirmer | agent (MCP) | `media_confirm { type: image \| video, media_ids }` → URLs Higgsfield (`show_medias` si besoin) |
| 5. Préparer | agent (MCP) | `tiktok_prepare_publish` : `connector_id` (de `tiktok_accounts`), `mode: UPLOAD_TO_DRAFT`, `media_type`, `title`, `description`, `photo_images` dans l'ordre des slides + `photo_cover_index: 0` (ou `video_url`) |
| 6. Envoyer en brouillon | agent (MCP) | `tiktok_publish` avec `publish_session_id`, `mode: UPLOAD_TO_DRAFT`, `user_confirmed`, `preview_confirmed`, `is_aigc` (= `job.is_aigc`) et chaque `required_confirmations` du prepare |
| 7. Suivre | agent (MCP) | `tiktok_publish_status` jusqu'à traitement terminé |
| 8. Tracer | script | `node src/publish/mark-draft.js EXP-015 --publish-id <id>` → fiche EXP (`status: brouillon envoyé`, `draft_sent_at`, `tiktok_publish_id`) + ligne QUEUE |
| 9. Poster | l'humain | app TikTok → notification « contenu prêt » / brouillons → textes natifs (`in_app.sheet` du job) + musique → Poster |
| 10. Clôturer | script | `node src/publish/mark-draft.js EXP-015 --posted --post-url <url>` |

Contrôles faits par `tiktok-draft.js` (limites TikTok) : photos JPEG/WebP seulement (PNG refusé), ≤ 20 Mo,
dans 1080×1920, ≤ 35 images ; vidéos H.264 MP4/MOV, 3-600 s, ≥ 360 px, 23-60 i/s, ≤ 1 Go. Un job avec
`problems` non vide ne doit pas être envoyé. Une caption doit exister dans la fiche EXP (`Caption : « … »`),
sinon le job le signale.

### Champs titre / description d'un carrousel (règle figée le 17/09/2026)

**Ce qu'on envoie** : pour un carrousel, **uniquement la description**, passée dans le paramètre `title` du connecteur Higgsfield
(phrase fixe du compte, `carousel_description` dans `config/accounts.json`, ex. « Pour plus de <unités>, télécharge <app> :)
lien en bio », dans la langue du compte). **Pas de paramètre `description`.** L'humain tape le **titre** dans le champ
« Ajoute un titre accrocheur » de l'app (le job l'indique dans `in_app.tiktok_title_field` : hook ≤ 8 mots, = texte natif de la
slide 1). Pour une vidéo, `title` = caption (TikTok n'a qu'un champ).

**Pourquoi** (3 brouillons reçus le 17/09/2026 sur le compte principal et le compte EN de l'instance d'origine) :

| Envoi (paramètres du connecteur) | Reçu dans l'éditeur photo TikTok |
|---|---|
| `title` = hook long, `description` = caption longue | textes « mal placés » (constat de l'humain), retapés à la main |
| `title` = « Jour 24 · <série> », `description` = phrase fixe | champ Titre **vide**, champ description = « Jour 24 · <série> », phrase fixe **perdue** |
| `title` = phrase fixe EN, `description` = « Day 4 of my <series> » | champ Titre **vide**, description = phrase fixe |

Conclusion : quel que soit le contenu, seul `title` arrive, et il atterrit dans la description ; le champ Titre n'est jamais rempli.

**Ce que disent les docs** : l'API TikTok (`/v2/post/publish/content/init/`, photos) accepte `post_info.title` (90 caractères)
et `post_info.description` (4 000) en `MEDIA_UPLOAD`, et affirme que « title and description … will be reflected in the editing
flow once user clicks on the inbox notification » ([référence photo](https://developers.tiktok.com/doc/content-posting-api-reference-photo-post),
[guide upload](https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content/)). Le paramètre `title` de
l'outil Higgsfield est décrit « Caption / title », limité à 150 caractères (ni 90 ni 2 200 : c'est un champ caption unique côté
connecteur). Lecture la plus probable : Higgsfield envoie son `title` dans le champ « caption » de TikTok (la description pour une
photo) et n'envoie pas `post_info.title` pour les photos ; un outil open source a eu exactement ce bug
([postiz #1059](https://github.com/gitroomhq/postiz-app/issues/1059)). Impossible de le vérifier sans voir la requête Higgsfield ;
la règle ci-dessus ne dépend pas de l'explication.

Test encore possible un jour (non fait, chaque essai laisse un brouillon à supprimer) : envoyer `description` seule, sans `title`,
pour voir si elle atterrit quelque part. À ne tenter que si l'humain le demande.

Ce que le brouillon **ne conserve pas** (limite TikTok, pas du connecteur) : la musique (`music_sound_id` ne
marche qu'en `DIRECT_POST`), et la caption n'est pas garantie. D'où la fiche `in_app` du job : texte de
front page, caption à recoller, section TEXTES.md, son suggéré.

Statut `FAILED / photo_pull_failed` : TikTok n'a pas réussi à télécharger les images (vu le 17/09 avec des URLs pourtant accessibles) → vérifier les URLs en HEAD, puis refaire `tiktok_prepare_publish` + `tiktok_publish` une fois ; passé une fois, ça ne consomme pas de quota.

Quotas (Higgsfield, avant TikTok) : 5 posts / min, 13 / 24 h ; les brouillons ne consomment pas le quota TikTok
mais respecter la cadence (`cadence_*` → attendre `retry_after_seconds`). Envoyer au maximum une journée de
contenus à la fois pour ne pas noyer les brouillons.

Autonomie : `00_AGENT/MISSION.md` → `draft_tiktok: auto`. L'envoi en brouillon ne publie rien ; la
publication reste `confirm` (l'humain poste depuis l'app). `DIRECT_POST` est interdit tant que `publish: confirm`.

## Instagram — Graph API (Reels)

`node src/publish/instagram.js --video-url https://... --caption "..." [--share-to-feed] [--dry-run]`
Pré-requis `.env` : `IG_USER_ID`, `IG_ACCESS_TOKEN` (compte pro/créateur lié à une Page). Vidéo à une URL publique.
Pas de mode brouillon côté Instagram : publication directe, donc validation explicite de l'humain avant.
Carrousels Instagram : non implémentés (l'humain les poste depuis l'app avec la même caption).

## Fallback

Publication manuelle depuis l'app : l'agent fournit caption, hashtags, son, textes (fichiers `08_ACCOUNTS/<account>/TEXTES.md`, `Carousels/POSTS.md`).
