---
name: publish-queue
description: File de publication par compte — un compte = un ICP, jamais de contenu croisé ; l'ordre du tableau est l'ordre d'envoi de l'automate du soir
type: index
updated: {{DATE}}
---

# File de publication

Statuts : `idée` → `à tourner` → `à monter` (spec écrite dans `08_ACCOUNTS/<slug>/specs/`, rendu attendu du VPS : `render-pending.js` passe la fiche en `prêt`) → `prêt` → `brouillon envoyé` → `publié`. Fichiers dans `08_ACCOUNTS/<account>/posts/`, textes natifs et captions dans `08_ACCOUNTS/<account>/POSTS.md`.
**L'ordre de la section d'un compte est l'ordre d'envoi** (`infra/src/publish/daily-plan.js` prend la première ligne `prêt` dont la fiche EXP porte `account: <slug>`). Garder ≥ 7 contenus `prêt` par compte actif.

<!-- Comment remplir : une section `## <slug> — <ICP> (DA <thème>) — <@handle>` par compte de `infra/config/accounts.json`. Le titre de section DOIT commencer par le slug exact (c'est la clé lue par les scripts). Une ligne par contenu, colonne « Ordre » numérotée à partir de 1. -->

## {{ACCOUNT_SLUG}} — ICP (DA default) — {{HANDLE}}

| Ordre | Exp | Angle | Format | Fichier | Statut | À ajouter dans TikTok |
|---|---|---|---|---|---|---|

## Comptes sans production

| Compte | Handle | Prochaine étape |
|---|---|---|

## Idées non produites

<!-- Comment remplir : idées avec compte + angle + format pressentis, sans fiche EXP encore. -->
