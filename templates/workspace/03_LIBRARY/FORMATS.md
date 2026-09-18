---
name: formats
description: Les formats de vidéo que l'agent sait décrire et produire, avec effort de production et qui peut les faire
type: library
updated: {{DATE}}
---

# Formats (catalogue générique)

Ce catalogue liste les **contenants** possibles. Un format devient « validé » (`formats/FORMAT-NN-*.md`) seulement après un test réel et une validation humaine.

<!-- Comment remplir : garder les lignes utiles, supprimer les autres, ajouter les formats propres à l'app. « Produit visible ? » = où l'app apparaît dans la vidéo. -->

| Slug | Description | Effort | Producteur | Produit visible ? |
|---|---|---:|---|---|
| `texte-plein-ecran` | Fond uni ou photo, un·e {{ITEM}} en gros, question d'engagement | 1 | Agent (ffmpeg) | Logo / nom en bas |
| `carrousel` | 5-10 slides, un·e {{ITEM}} par slide, dernière slide = résultat + app | 1 | Agent | Dernière slide |
| `screen-record` | Enregistrement d'écran de l'app + voix off ou texte | 1 | Agent (simulateur) ou humain (iPhone) | Oui, tout du long |
| `pov` | Photo d'accroche « POV : … » puis extraits de l'app jusqu'au payoff | 1 | Agent | Oui |
| `ugc-duo` | Deux personnes jouent, réaction au résultat | 3 | Humain + 1 | Téléphone à l'écran + résultat |
| `ugc-groupe` | 4-8 personnes, une lit, tous réagissent | 3 | Humain + amis | Résultat |
| `micro-trottoir` | Inconnus dans la rue répondent | 4 | Humain + micro | Résultat en incrust |
| `skit-pov` | Saynète scénarisée | 2-3 | Humain (+1) | Fin |
| `tier-list` | Classement à l'écran, commentaire voix | 1-2 | Agent (montage) + voix | Oui |
| `duet-stitch` | Réaction à une vidéo virale d'un autre créateur | 2 | Humain | Résultat |
| `reaction-commentaires` | On répond à un commentaire avec le résultat de l'app | 1-2 | Humain ou screen-record | Oui |

Effort : 1 = l'agent peut produire seul · 2 = une personne et un téléphone · 3 = plusieurs personnes · 4 = extérieur / inconnus / autorisations.
