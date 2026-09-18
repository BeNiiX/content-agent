---
id: FORMAT-00               # proposé dans archive/ tant que non validé ; numéro = next_format_id de INDEX.md
name: slug-court
title: Titre lisible du format
status: proposé              # proposé | validé | archivé
validated_on: null
renditions: [carrousel, video]   # rendus possibles du même format
tools: []                    # scripts infra qui produisent ce format (ex. infra/scripts/carousel.py)
da_variants: [default]       # thèmes de 01_BRAND/DA/themes.json
accounts: []                 # slugs de comptes autorisés
sources: []                  # keys de 02_VEILLE/videos/<key>.md (preuves)
history: []                  # concepts fusionnés / d'origine
experiments: []              # ids EXP-xxx
created: {{DATE}}
updated: {{DATE}}
---

# FORMAT-00 — Titre

**Un contenant unique, décliné par compte (DA et {{ITEM_PLURAL}} propres à l'ICP) et par angle (hook natif, photo, CTA).**

## Structure

<!-- Comment remplir : plan par plan / slide par slide, avec ce qui est fixe et ce qui vient de l'angle. Dire où est le payoff et où va le CTA. -->

1.
2.
3.

## Rendus

| Rendu | Sortie | Outil | Durée / slides | Quand |
|---|---|---|---|---|
| | | | | |

## Déclinaison par compte (DA) — ne jamais mélanger

| Compte | `da` | Libellés | {{ITEM_PLURAL}} (`icp`) | Photos |
|---|---|---|---|---|
| | | | | |

## Déclinaison par angle (voir `01_BRAND/ANGLES.md`)

L'angle fixe : la **photo** (situation), le **texte natif** du plan 1, le **choix des {{ITEM_PLURAL}}**, la **caption** et son CTA.

## Spec type
```json
{ "format": "FORMAT-00", "rendition": "carrousel", "account": "<slug>", "angle": "<angle>", "da": "default",
  "out": "../../08_ACCOUNTS/<slug>/posts/F00-<angle>-01", "title_native": "…", "caption": "…",
  "cover": { "photo": "../../07_ASSETS/photos/<thème>/<fichier>.jpg" },
  "slides": [ { "item_id": "…", "text": "…", "pct": null } ] }
```
Nommage : `F00-<angle>-<nn>` dans `08_ACCOUNTS/<account>/posts/`.

## Preuves (veille)

<!-- Comment remplir : vidéos sources avec vues et outlier ; lien vers le concept d'origine dans archive/. -->

## Métriques

<!-- Comment remplir : seuils de succès propres au rendu (complétion, partages, commentaires…). Comparer à format et compte égaux entre angles. -->

## Résultats
| Exp | Compte | Angle | Rendu | Vues J+7 | Saves | Partages | Verdict |
|---|---|---|---|---:|---:|---:|---|

## Leçons
