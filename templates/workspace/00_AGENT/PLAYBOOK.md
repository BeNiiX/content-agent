---
name: playbook
description: Rituels quotidien / hebdo / mensuel de l'agent et ordre d'exécution des SOP
type: agent-doc
updated: {{DATE}}
---

# Playbook

<!-- Comment remplir : garder la structure ; adapter les cadences (nombre de posts, jour de revue) et supprimer ce qui n'est pas en place (paid, Instagram). -->

## Quotidien (15 min agent)

1. `cd infra && npm run sync` si un nouvel export ou une extraction navigateur est arrivé dans `data/raw/`.
2. Lire le dernier `02_VEILLE/digests/<date>.md`. Pour chaque vidéo avec `outlier_score ≥ 3` : décider `documenter` / `ignorer` / `plus tard`.
3. Mettre à jour les métriques J+3 / J+7 des expériences échues (`04_EXPERIMENTS/`).
4. Vérifier `06_CALENDAR/QUEUE.md` : ce qui est `prêt` par compte, ce qui manque (média, caption). Garder ≥ 7 contenus `prêt` par compte actif si l'envoi du soir est activé.

## Hebdomadaire (lundi) — SOP_06

1. Revue des expériences de la semaine : qui a battu notre médiane de vues ? de partages ? d'installs ?
2. Mettre à jour `03_LIBRARY/INDEX.md` : statut des concepts (`hypothèse` → `testé` → `gagnant` / `abandonné`).
3. Choisir les contenus de la semaine **par compte** (`01_BRAND/ACCOUNTS.md`) : 3 à 5 posts répartis sur ses angles (`01_BRAND/ANGLES.md`), dans les formats validés. Jamais le contenu d'un ICP sur le compte d'un autre.
4. Écrire les fiches expérience *avant* production (hypothèse, hook, métrique de succès).
5. Paid : rapport 7 jours, appliquer `05_CAMPAIGNS/BUDGET_RULES.md`, proposer les réallocations.
6. Écrire le mémo hebdo en tête de `06_CALENDAR/<AAAA-MM>.md`.

## Mensuel

1. Relancer la veille élargie : nouveaux comptes à suivre (`02_VEILLE/COMPETITORS.md`), retirer les comptes morts.
2. Recalculer nos médianes (vues, partages, installs) et mettre à jour les seuils de `SCORING.md`.
3. Bilan : top 3 / flop 3 du mois, leçons dans `03_LIBRARY/INDEX.md` section *Leçons*.
4. Revoir les cibles de coût dans `05_CAMPAIGNS/BUDGET_RULES.md` avec les données du MMP.

## Ordre des SOP

| SOP | Quand | Entrée | Sortie |
|---|---|---|---|
| `SOP_01_VEILLE_TIKTOK.md` | Nouvel export / snippet navigateur / hebdo | données brutes | `02_VEILLE/` généré + digest annoté |
| `SOP_02_DOCUMENTER_CONCEPT.md` | Vidéo outlier repérée | fiche vidéo | `03_LIBRARY/archive/CONCEPT-xxx.md` (puis `formats/` après validation) |
| `SOP_03_ADAPTER_CONCEPT.md` | Concept documenté | concept | section *Adaptations* + brief de tournage |
| `SOP_04_PRODUIRE_ET_PUBLIER.md` | Média prêt dans `08_ACCOUNTS/<account>/posts/` | brief + fichier | brouillon envoyé / post publié + fiche EXP |
| `SOP_05_CAMPAGNES_BUDGET.md` | Hebdo ou alerte | rapport ads | proposition de réallocation |
| `SOP_06_REVUE_HEBDO.md` | Lundi | tout | mémo hebdo + plan de la semaine |
