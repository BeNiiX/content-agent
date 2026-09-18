---
name: sop-02-documenter-concept
description: Déconstruire une vidéo performante en concept réutilisable (03_LIBRARY/archive en candidat, 03_LIBRARY/formats une fois validé)
type: sop
updated: 2026-09-18
---

# SOP 02 — Documenter un concept

## Quand

Une vidéo du digest a `outlier_score ≥ 3` (ou `engagement_rate` remarquable si médiane inconnue),
ou l'humain partage une URL avec « documente ça ».

## Étapes

1. **Regarder la vidéo** (lien dans la fiche `02_VEILLE/videos/<id>.md`, ou fichier local
   `infra/data/media/<id>.mp4` après `node src/download.js`), puis **extraire** : `node src/extract.js --key <id>`
   → `02_VEILLE/transcripts/<id>.md` (image d'accroche, texte à l'écran seconde par seconde, transcription audio,
   script reconstitué) et `02_VEILLE/assets/hooks/<id>.jpg`. Planche-contact rapide pour visionner sans ouvrir la
   vidéo : `ffmpeg -i in.mp4 -vf "fps=1/2,scale=300:-1,tile=4x3" -frames:v 1 sheet.jpg`.
2. **Chercher un concept existant** : `grep -ril "<mot-clé>" 03_LIBRARY/formats/ 03_LIBRARY/archive/`. Si la mécanique
   existe déjà, ajouter la vidéo dans sa section *Sources* et mettre à jour les stats. Sinon :
3. **Créer** `03_LIBRARY/archive/CONCEPT-<NNN>-<slug>.md` (status `proposé (à valider)`) à partir de `03_LIBRARY/_TEMPLATE_CONCEPT.md`. Il ne passe dans `formats/` (comme `FORMAT-NN`) qu'après validation explicite de l'humain.
   Numéro = suivant dans `INDEX.md`.
4. **Remplir avec rigueur** :
   - *Mécanique* en une phrase, sans le sujet (« des inconnus doivent trancher une question gênante devant caméra »).
   - *Hook* : mot pour mot, avec la famille (`CREATIVE_FRAMEWORK.md` §2).
   - *Timeline* : seconde par seconde jusqu'au payoff.
   - *Pourquoi ça marche* : 3 raisons maximum, formulées comme des hypothèses testables.
   - *Transposabilité* : note /5 avec justification (l'app a-t-elle le même payoff naturel ?).
   - *Risques* : droit à l'image, musique commerciale, sujet sensible.
5. **Ajouter la ligne dans `03_LIBRARY/INDEX.md`** avec statut `hypothèse`.
6. Si transposabilité ≥ 3/5 → enchaîner SOP_03.

## Qualité attendue

Une autre personne (ou un autre agent) doit pouvoir tourner la vidéo d'origine à partir de la fiche,
sans l'avoir vue.
