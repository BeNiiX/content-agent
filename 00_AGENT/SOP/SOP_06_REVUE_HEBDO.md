---
name: sop-06-revue-hebdo
description: Revue hebdomadaire — bilan des expériences, mise à jour des statuts de concepts, plan de la semaine, mémo ; relevé et veille automatiques depuis le VPS
type: sop
updated: 2026-09-18
---

# SOP 06 — Revue hebdomadaire

1. **Collecte** : pour chaque `04_EXPERIMENTS/EXP-*.md` publiée depuis ≥ 7 jours sans `result`, demander
   ou relever les métriques (TikTok Studio, IG Insights, `tiktok-report.js`). Remplir `metrics_d7` et `verdict`.
2. **Médianes** : recalculer notre médiane de vues (10 derniers posts par plateforme), mettre à jour
   `00_AGENT/SCORING.md` frontmatter.
3. **Statuts concepts** dans `03_LIBRARY/INDEX.md` :
   `hypothèse` → `testé` (1 exp) → `gagnant` (≥ 2 exp gagnantes ou 1 exp ≥ 3× médiane) / `abandonné` (2 flops).
4. **Veille** : lire le digest produit par le VPS (voir ci-dessous) ou `npm run sync` sur le Mac, puis annoter (SOP_01). Noter 3 tendances.
5. **Plan de la semaine, compte par compte** : pour chaque compte, 3 à 5 posts répartis sur ses angles ; comparer les angles entre eux **à format et compte égaux** (jamais un compte contre un autre).
   Créer les fiches EXP avec hypothèses, remplir `06_CALENDAR/QUEUE.md`.
6. **Paid** : SOP_05, proposition de réallocation.
7. **Mémo** en tête de `06_CALENDAR/<AAAA-MM>.md` : ce qui a marché, ce qui n'a pas marché, ce qu'on
   teste, ce qu'on demande à l'humain (tournages, validations, accès).

Format du mémo (≤ 15 lignes) :

```
## Semaine du <date>
**Gagnant** : EXP-xxx (hook…) – 3,2× médiane, 1,4 % partages
**Flop** : EXP-yyy – rétention 3 s à 35 %, hook trop long
**Leçon** : …
**Cette semaine** : EXP-… / EXP-… / EXP-…
**Paid** : CPA 7 j = … € (cible BUDGET_RULES.md) → proposition …
**Besoin de l'humain** : tourner A1 du CONCEPT-xxx (2 personnes, 20 min), valider budget.
```

## Relevé et veille automatiques (VPS, `project.json → weekly_stats`)

Le relevé hebdomadaire **vient du VPS** (`deploy/README.md`), deux timers systemd le jour de `weekly_stats` :

| Heure (défaut) | Timer | Script | Produit |
|---|---|---|---|
| `weekly_stats.hour − 1` (07:00) | `content-weekly-veille` | `infra/scripts/weekly-veille.sh` (import des exports déposés par `deploy/sync-media.sh --data` → enrich → authors → score → docs) | `02_VEILLE/videos/`, `accounts/`, `digests/<date>.md` ; journal `infra/data/veille/<date>.log` |
| `weekly_stats.hour` (08:00) | `content-daily-stats` | `infra/scripts/daily-stats.sh` (pull des pages publiques → report) | `08_ACCOUNTS/<slug>/STATS.md` (par compte) et `06_CALENDAR/stats/<date>.md` (digest tous comptes, avec une liste « À faire (agent) ») |

`content-git-sync` pousse ces fichiers dans les 10 min ; la routine cloud `revue-hebdo` (`deploy/routines/`) — ou la revue
interactive — **lit ensuite les fichiers poussés** (`git pull` d'abord). La revue commence par le digest du jour : annoter sous le
marqueur `notes-agent` (conservé à la régénération), puis dérouler la liste : verdicts des fiches EXP à outlier ≥ 3, post-mortems
< 0,5 × médiane, marquage `boosted: true` des posts poussés en pub (`05_CAMPAIGNS/CAMPAIGNS.md`), relevé manuel dans TikTok
Studio (rétention 3 s, temps moyen, territoires — surtout pour les comptes hors marché principal), mise à jour des abonnés dans
`01_BRAND/ACCOUNTS.md`. Si le relevé n'a pas tourné : `journalctl -u content-daily-stats -n 50` sur le VPS, puis
`sudo systemctl start content-daily-stats` (ou, sur le Mac, `cd infra && bash scripts/daily-stats.sh`). Un profil « illisible »
dans le relevé peut venir d'un blocage de l'IP du VPS par TikTok : relancer plus tard ou relever depuis le Mac.
