---
id: EXP-000
account: {{ACCOUNT_SLUG}}   # un seul, slug de infra/config/accounts.json
angle: ""                   # voir 01_BRAND/ANGLES.md
format: FORMAT-00           # voir 03_LIBRARY/formats/
rendition: carrousel        # carrousel | video
da: default                 # thème de 01_BRAND/DA/themes.json
platform: tiktok            # tiktok | instagram
market: FR                  # FR | EN
type: organic               # organic | paid
status: idée                # idée | à tourner | à monter (spec écrite, rendu attendu du VPS : render-pending.js → prêt) | prêt | brouillon envoyé | publié | mesuré
hook: ""
hook_family: ""
sound: ""
media_file: 08_ACCOUNTS/{{ACCOUNT_SLUG}}/posts/F00-<angle>-<nn>.mp4   # fichier vidéo ou dossier de slides
items: []                   # ids de 07_ASSETS/items.json utilisés
ad_candidate: false         # true = créa candidate pour la pub (choix humain dans 05_CAMPAIGNS/)
boosted: false              # true = poussée en pub, sortie du calcul organique
published_at: null
post_url: null
draft_sent_at: null
tiktok_publish_id: null
metrics_d3: {views: null, likes: null, comments: null, shares: null, saves: null, retention_3s: null, avg_watch_pct: null, profile_visits: null}
metrics_d7: {views: null, likes: null, comments: null, shares: null, saves: null, retention_3s: null, avg_watch_pct: null, profile_visits: null, installs_attributed: null}
verdict: null               # gagnant | neutre | flop | inconclusif
created: {{DATE}}
updated: {{DATE}}
---

# EXP-000 — Titre

## Hypothèse
Si [hook / mécanique], alors [métrique] ≥ [seuil], parce que [raison tirée du concept ou du format].

## Métrique de succès
(une seule, avec seuil, cf. `00_AGENT/SCORING.md`)

Caption : « … »

## Caption publiée

## Ce qui s'est passé (J+3)

## Résultat (J+7) et verdict

## Leçon (1 phrase, recopiée dans le format)
