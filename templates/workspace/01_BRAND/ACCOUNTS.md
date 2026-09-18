---
name: accounts
description: Registre des comptes TikTok / Instagram de {{APP_NAME}} — handle, appareil, rôle, ICP, angles, formats, DA, cadence, KPI, état de connexion. Un compte = un ICP, rien ne se mélange. Identifiants dans ACCOUNTS_CREDENTIALS.md (hors git).
type: strategy
platform: tiktok
updated: {{DATE}}
---

# Comptes

**Règle n° 1 : un compte = un ICP.** Les contenus, les {{ITEM_PLURAL}}, les photos et la DA d'un compte ne servent jamais à un autre.
Chaque production (spec, fiche EXP, dossier `08_ACCOUNTS/<slug>/`) porte le champ `account`.
**Règle n° 2 : jamais le même fichier sur deux comptes.** Un format gagnant se **reproduit** (autre {{ITEM}}, autre photo) pour un autre compte, il ne se reposte pas.
**Règle n° 3 : compte créateur / personnel partout.** Jamais de compte Business (sons restreints). Les ads passent par Spark Ads avec un code autorisé depuis le compte créateur.

Identifiants (e-mail, mot de passe, numéro, 2FA) : `ACCOUNTS_CREDENTIALS.md`, ignoré par git. Ce fichier-ci ne contient aucun secret.

## Registre

<!-- Comment remplir : une ligne par compte. Slug = `{{APP_SLUG}}-<icp>` (kebab-case, c'est la clé de `infra/config/accounts.json` et le champ `account` des fiches EXP). Un connecteur Higgsfield par compte (`tiktok_connect` avec un `name` distinct, depuis l'appareil qui porte le compte). -->

| Slug | Handle | Appareil | Rôle en une ligne | Abonnés (date) | Connecteur Higgsfield | État |
|---|---|---|---|---|---|---|
| `{{ACCOUNT_SLUG}}` | {{HANDLE}} | | | null | `null` (name `tiktok-{{ACCOUNT_SLUG}}`) | à connecter |

Abonnés relevés par `infra/src/accounts/pull.js` (données publiques), chaque lundi → `08_ACCOUNTS/<slug>/STATS.md` et `06_CALENDAR/stats/<date>.md`.

## Carte des appareils

<!-- Comment remplir : quel téléphone porte quels comptes (3 comptes max par appareil dans le sélecteur TikTok). Le brouillon envoyé par l'agent arrive sur le compte qui a autorisé Higgsfield, quel que soit le compte ouvert dans l'app. -->

| Appareil | Comptes | Remarque |
|---|---|---|
| | | |

## Priorité de mise en route

1.

---

## {{ACCOUNT_SLUG}} — {{HANDLE}}

<!-- Comment remplir : dupliquer ce bloc pour chaque compte. Chaque ligne est une décision, pas un souhait. -->

| | |
|---|---|
| **ICP** | persona de `AUDIENCE.md` |
| **Promesse** | |
| **Angles** (`ANGLES.md`) | |
| **Formats** | formats validés de `03_LIBRARY/formats/` autorisés ici |
| **DA** | `default` (`01_BRAND/DA/themes.json`) |
| **{{ITEM_PLURAL}}** | filtre `icp: …` dans `07_ASSETS/items.json` |
| **Voix** | |
| **Cadence cible** | |
| **KPI de succès** | ex. partages ÷ vues ≥ 1 % |
| **Ne jamais** | |
| **État** | |

---

## Publication et connexion
Registre machine : `infra/config/accounts.json` (slug → handle, appareil, connector_id, flags `paused` / `production_paused`). La fiche EXP porte `account:` ; sans connecteur, le job de brouillon est refusé.
Procédure : `infra/src/publish/CONNEXION_TIKTOK.md`. Pipeline : `infra/src/publish/README.md`.
