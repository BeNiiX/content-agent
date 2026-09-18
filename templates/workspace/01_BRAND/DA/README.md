---
name: da
description: Direction artistique des cartes générées (carrousels, vidéos série, camemberts) — un thème par compte / ICP, paramètres dans themes.json, références PNG à côté
type: brand-doc
updated: {{DATE}}
---

# DA — un thème par compte

Les scripts de rendu (`infra/scripts/da_cards.py`, `carousel.py`, `series-video.py`, `pie-video.py`) dessinent les cartes de l'app à partir de `themes.json` (ce dossier) : texte de marque, palette, polices (`infra/fonts/`), et une variante `themes.<da>` par compte de `ACCOUNTS.md`. Schéma complet : `infra/config/README.md`.

<!-- Comment remplir : 1) déposer ici 2 captures de l'app (carte {{ITEM}} + carte résultat, 1080×1350) nommées `ref-<theme>-item-card.png` / `ref-<theme>-score-card.png` ; 2) mesurer couleurs et libellés ; 3) les reporter dans `themes.json` (libellés = vocabulaire de `project.json`) ; 4) régénérer un carrousel test et comparer aux références. Ajouter un compte = ajouter un thème + 2 références. -->

| Thème (`da`) | Compte(s) | Vague (`fill`) | Boutons | Barre | Décoration | Références |
|---|---|---|---|---|---|---|
| `default` | tous tant qu'il n'y a qu'un ICP | `#5B8DEF` (neutre, à remplacer par l'accent de l'app) | « Non » / « Oui » | « Voir le résultat » | — | `ref-default-item-card.png`, `ref-default-score-card.png` (à fournir) |

## Référence initiale

<!-- Comment remplir : date et provenance des captures, mesures (positions des cartes, boutons, police, tailles) utilisées pour calibrer les scripts, écarts constatés. -->
