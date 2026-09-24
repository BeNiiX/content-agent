---
name: gabarits
description: Définitions concept → format → gabarit → créa, fiche technique versionnée par gabarit (format × rendu × compte), boucle d'apprentissage (pilotes → validation → production → évolution) et gel des créas hors gabarit validé
type: framework
decided: 2026-09-24 (après une review humaine des créas : « la plupart sont bâclées »)
updated: 2026-09-24
---

# Gabarits : valider un format par compte avant d'en produire

## Pourquoi

Jusqu'au 24/09, un format était validé sur un **principe** (structure + vidéos sources) puis produit en série sur tous les
comptes : chaque créa réinventait les détails (longueur du hook, photo, ton, textes), et les défauts se répétaient partout.
Il manquait une étape : **valider sur des pilotes réels, compte par compte, une fiche technique** que toutes les créas
suivent ensuite. Corriger un défaut = corriger une règle de la fiche, pas N créas.

## Les quatre niveaux

| Niveau | Ce que c'est | Où | Qui valide |
|---|---|---|---|
| **Concept** | Idée repérée en veille, avec ses sources | `03_LIBRARY/archive/CONCEPT-*.md` | personne : candidat |
| **Format** | Mécanique générique, sans compte (ex. « photo vraie vie → 3 unités de contenu → score ») | `03_LIBRARY/formats/FORMAT-0x-*.md` | l'humain, sur le principe |
| **Gabarit** | Format × **rendu** × **compte**, avec sa **fiche technique versionnée** | `03_LIBRARY/gabarits/<F0x-rendu>/<compte>.md` | l'humain, **sur des pilotes réels** (onglet Formats) |
| **Créa** | Une instance d'un gabarit validé : seules les variables changent | spec `08_ACCOUNTS/<compte>/specs/` + fiche `04_EXPERIMENTS/EXP-*.md` | l'humain (onglet Validation) |

Identifiant d'un gabarit : `F02-carrousel.<compte>` (format abrégé, rendu, compte). Les rendus possibles d'un format sont ceux
que ses scripts savent produire (`RENDUS` dans `infra/src/lib/gabarits.js` ; ex. F01 `video` · F02 `carrousel`, `video` · F03
`faceless`, `reaction` · F04 `video`). Un carrousel et une vidéo du même format sont **deux
gabarits** (défauts différents). Une case sans intérêt pour un compte est marquée `non pertinent` plutôt que forcée.

## La fiche technique

Chaque fichier de gabarit (modèle : `_TEMPLATE_GABARIT.md`) contient :

- **Constantes** : ce qui est identique pour toutes les créas du gabarit — rendu (police, tailles, positions, durées, nombre de
  slides, voix, ratio) et éditorial (structure, longueur max du hook, ton, textes natifs, caption, CTA, son, description).
- **Variables** : ce qu'une créa a le droit de changer, et dans quelles limites (unités de contenu de la banque `07_ASSETS/`, photo d'un thème donné,
  hook dans une **famille** imposée — la formulation reste libre —, angle).
- **Contrôles** : la checklist qu'une créa doit passer avant d'arriver en validation (bloc `checks` lisible par une machine
  pour ce qui se vérifie automatiquement : mots du hook, durée, nombre de slides, % issu de la banque).
- **Références** : les pilotes validés = « c'est exactement ça ».
- **Historique des versions** et **retours** de l'humain sur le gabarit.

## Statuts d'un gabarit

`à prototyper` → `pilotes en revue` ⇄ `à retoucher` → `validé` (vN) → `évolution proposée` → `validé` (vN+1) · `non pertinent`

- **à prototyper** : pas encore de fiche ni de pilotes. L'agent rédige la fiche v0 et prépare **2 pilotes**.
- **pilotes en revue** : l'humain juge la fiche **et** les pilotes dans l'onglet Formats (commentaires, retouches, validation).
- **à retoucher** : l'humain a listé des changements (`validation_note`, un par ligne). L'agent corrige **la fiche d'abord**,
  puis régénère les pilotes selon la fiche, et repasse en `pilotes en revue`.
- **validé** : fiche figée en version N (`version`, `validated_at`), pilotes = références. La production est débloquée.
- **évolution proposée** : l'agent a constaté des retours récurrents sur les créas du gabarit (retouches, commentaires,
  learnings) et propose un changement de fiche (section « Évolution proposée »). Validé → version N+1.

## Règles

1. **Pas de créa hors gabarit validé.** La production (routine `production-specs`, sessions) ne crée une créa que pour un
   gabarit `validé`, en suivant sa fiche, et écrit dans la fiche EXP `gabarit: <id>` et `gabarit_version: <N>`.
2. **Gel.** Une créa non validée est **gelée** tant que son gabarit n'est pas validé, ou si sa `gabarit_version` est plus
   ancienne que la version courante. Elle n'apparaît pas « à valider » et ne part pas. Les créas **déjà validées** restent
   valables et continuent de partir (décision du 24/09).
3. **Dégel.** Quand un gabarit est validé (ou passe en vN+1), l'agent met à jour ses créas gelées selon la fiche (re-spec,
   re-rendu, textes), écrit `gabarit_version: N`, et elles arrivent « à valider ».
4. **Pilotes.** Pris de préférence parmi les créas gelées du gabarit (`pilote: true` dans la fiche EXP) : on les améliore
   selon la fiche v0 plutôt que d'en créer de nouvelles. Validés avec le gabarit, ils deviennent des créas normales
   (« à valider ») et restent les références.
5. **Une règle, un endroit.** Un défaut qui revient se corrige dans la fiche (évolution), jamais créa par créa.

## Où ça se passe

- Onglet **Formats** du tableau de bord : matrice format × compte, page par gabarit (fiche, pilotes, décisions).
- Routine cloud **`gabarits-quotidien`** (`deploy/routines/gabarits-quotidien.md`) : rédige les fiches v0, prépare les
  pilotes, applique les retouches de gabarit, propose les évolutions, dégèle les créas des gabarits validés.
