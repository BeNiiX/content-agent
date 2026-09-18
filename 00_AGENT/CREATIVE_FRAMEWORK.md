---
name: creative-framework
description: Grammaire créative de l'agent — anatomie d'une vidéo courte, familles de hooks, structures de rétention, méthode d'adaptation et de génération de concepts originaux
type: agent-doc
updated: 2026-09-18
---

# Framework créatif

## 1. Anatomie d'une vidéo courte qui installe une app

| Segment | Durée | Rôle | Question à se poser |
|---|---:|---|---|
| **Hook** | 0-2 s | Arrêter le pouce. Texte à l'écran + image + son alignés sur UNE promesse. | Pourquoi je ne scrolle pas ? |
| **Setup** | 2-6 s | Poser le cadre (qui, où, quel jeu). Montrer l'app dans les 5 premières secondes si c'est une créa produit. | Est-ce que je comprends la situation sans le son ? |
| **Tension** | 6-20 s | L'unité de contenu est lue, les avis divergent, on attend le résultat. Boucle ouverte. | Qu'est-ce que le spectateur veut savoir ? |
| **Payoff** | 1 plan | Le résultat de l'app (écran de payoff de `01_BRAND/APP_CONTEXT.md`), réaction, chiffre surprenant. | Est-ce que ça donne envie de voter soi-même ? |
| **CTA** | 1-2 s | Implicite (nom de l'app à l'écran) ou explicite (« lien en bio », « c'est sur <nom de l'app> »). | Le nom de l'app est-il lisible ? |

Règles de forme : 9:16, sous-titres brûlés, texte hook ≤ 8 mots, visage ou app visible dès la
première frame, rythme de coupe < 3 s, durée cible 12-25 s (organique) / 15-30 s (paid).

## 2. Familles de hooks (à combiner avec `03_LIBRARY/HOOKS.md`)

| Famille | Mécanisme | Exemple (formule à trous ; exemples réels de l'instance dans `03_LIBRARY/HOOKS.md`) |
|---|---|---|
| **Affirmation frontale** | Une phrase clivante, c'est tout. | « <affirmation clivante>. » |
| **Défi social** | Menace la relation. | « Cette <unité> a failli briser notre couple » |
| **Chiffre choc** | Statistique contre-intuitive. | « <N> % des joueurs ne sont pas d'accord avec ça » |
| **POV / situation** | Le spectateur se projette. | « POV : ton pote sort ÇA en soirée » |
| **Micro-trottoir** | Vrais inconnus, vraies réactions. | « On demande aux <habitants de la ville> leur <unité> la plus <adjectif> » |
| **Tier list / classement** | Le cerveau veut compléter. | « On classe les <unités> de la plus sage à la plus dangereuse » |
| **Négation / interdit** | « Ne joue pas à ça si… » | « Ne joue pas à ce jeu avec ta belle-famille » |
| **Question directe** | Le commentaire est la réponse. | « <la question de l'app> ? » (`project.json → vocabulary.question`) |
| **Résultat avant l'histoire** | Montre la réaction finale d'abord. | Plan de la réaction finale → « voilà pourquoi » |

## 3. Structures de rétention

- **Boucle ouverte** : annoncer le verdict, le retarder jusqu'à la fin.
- **Escalade** : 3 unités de plus en plus fortes (la troisième est le payoff).
- **Pattern interrupt** : changement de plan / zoom / son toutes les 2-3 s.
- **Vote visuel** : mains levées, split-screen d'accord / pas d'accord, barre de pourcentage animée.
- **Fin en cliffhanger** : « Partie 2 pour celle qui a tout cassé ».

## 4. Formats

Catalogue : `03_LIBRARY/FORMATS.md` ; formats validés (un fichier par format, avec outil de rendu) : `03_LIBRARY/formats/`.
Familles génériques : UGC (couple, groupe) · micro-trottoir · screen-record de l'app + voix off · texte plein écran ·
carrousel photo · duet / stitch · skit / POV scénarisé · tier list · réaction à des commentaires.

## 5. Méthode d'adaptation d'un concept (détail SOP_03)

1. **Isoler la mécanique**, pas le sujet : « inconnus réagissent à une question gênante » ≠ « micro-trottoir sur les ex ».
2. **Remplacer le sujet** par une unité de contenu de l'app (banque `07_ASSETS/items.json` ou son nom d'instance, critères dans `01_BRAND/APP_CONTEXT.md` § Banque).
3. **Garder les invariants** : durée, position du hook, moment du payoff, type de plan.
4. **Ajouter le produit** au bon endroit : l'écran résultat de l'app = le payoff naturel.
5. **Écrire 3 hooks** pour la même vidéo, en tourner 2, publier le meilleur en A/B paid si budget.
6. **Version FR + version EN** quand le concept est visuel (même tournage, sous-titres différents).

## 6. Générer des concepts originaux

Techniques, à utiliser dans `SOP_02` section *Variantes* :

- **Croisement** : format A × sujet B (tier list × unités « couple » ; micro-trottoir × résultat chiffré).
- **Inversion** : l'app se trompe, l'humain gagne (« l'app dit X, la table entière dit Y »).
- **Contrainte** : 1 seul plan, 5 secondes, sans parole, uniquement des regards.
- **Série** : « <Unité> du jour #12 » avec le même cadre, pour créer une attente.
- **Personnage** : un « juge » récurrent, une mamie, un enfant qui tranche les débats d'adultes.
- **Participation** : « envoyez la vôtre en commentaire, on la met dans l'app » (si l'app a une soumission utilisateur).
- **Meta** : coulisses (modération, ce qu'on n'a pas osé publier, comment on choisit).

## 7. Checklist avant publication

La checklist complète (technique, hook, CTA, republication) est dans la skill `creation-contenu-viral`. Résumé :

- [ ] Hook lisible sans le son en < 1 s
- [ ] App ou nom de l'app visible dans les 5 premières secondes (créa produit) ou en payoff (créa contenu)
- [ ] Une seule idée
- [ ] Sous-titres, 9:16, ≥ 1080×1920, 23-60 fps, 3-60 s
- [ ] Caption : hook répété + question + 3-5 hashtags de niche (voir `03_LIBRARY/HOOKS.md` section hashtags)
- [ ] Fiche expérience créée avec hypothèse et métrique de succès
- [ ] Unité de contenu conforme aux règles de l'app (`01_BRAND/APP_CONTEXT.md`)
