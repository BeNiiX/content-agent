---
name: sop-03-adapter-concept
description: Produire, à partir d'un concept documenté, une adaptation à l'app prête à tourner (script, shot-list, textes, caption) puis des variantes originales
type: sop
updated: 2026-09-18
---

# SOP 03 — Adapter un concept à l'app

## Étapes

0. **Choisir le compte et l'angle** (`01_BRAND/ACCOUNTS.md`, `ANGLES.md`) avant toute chose : ils fixent la DA (`da`), le filtre d'unités de contenu (`icp` dans la banque `07_ASSETS/items.json` — nom d'instance possible, voir `07_ASSETS/README.md`), la photo (situation de l'angle), le hook natif et le CTA. Le spec et la fiche EXP portent `account`, `angle`, `format`, `rendition`, `da`.

1. Relire `01_BRAND/APP_CONTEXT.md` (mécanique, payoff de l'app, marchés) et `01_BRAND/VOICE.md`.
2. Dans le concept, section **Adaptations**, créer `A1 — copie fidèle` :
   - Même durée ± 20 %, même position du hook, même moment du payoff.
   - Sujet remplacé par 1 à 3 unités de contenu de l'app (banque `07_ASSETS/items.json` ou son nom d'instance, filtrées par `icp` ; critère de
     sélection dans `01_BRAND/APP_CONTEXT.md` § Banque).
   - Payoff = l'écran résultat de l'app ou la réaction des joueurs à ce résultat.
3. Écrire le **brief de tournage** (bloc dans le concept) :
   - Hook (3 propositions, la première est la recommandée)
   - Script / dialogues ou voix off
   - Shot-list (plan, durée, texte à l'écran)
   - Matériel : téléphone, nb de personnes, lieu, app ouverte sur quel thème
   - Caption FR + EN, 3-5 hashtags, son suggéré (choisi dans l'app au moment de publier)
   - Version(s) : FR / EN / muette
4. Créer `A2 — variante` en appliquant UNE technique de `CREATIVE_FRAMEWORK.md` §6 (croisement, inversion, contrainte, série…).
5. Si le concept est purement visuel ou texte (carrousel, texte plein écran, screen-record), l'agent
   peut **produire lui-même** : images via Canva / Higgsfield, montage via ffmpeg (`infra/scripts/`),
   puis déposer dans `08_ACCOUNTS/<account>/`. Sinon, ajouter à `06_CALENDAR/QUEUE.md` avec statut `à tourner`.
6. Créer la fiche expérience `04_EXPERIMENTS/EXP-<NNN>.md` (hypothèse, hook retenu, métrique de succès),
   liée au concept.

## Contraintes

- Jamais réutiliser les images, voix ou textes d'origine.
- Unités de contenu conformes aux règles de l'app (`01_BRAND/APP_CONTEXT.md` § Règles d'une unité valide).
- Une vidéo = une idée. Si l'adaptation en contient deux, ce sont deux vidéos.
