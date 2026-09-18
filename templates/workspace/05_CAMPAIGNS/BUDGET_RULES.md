---
name: budget-rules
description: Règles de décision paid (kill / scale / réallocation / test) appliquées par l'agent, avec ce qui est automatique et ce qui exige une validation
type: rules
updated: {{DATE}}
targets:
  cpa_purchase_eur: null       # coût cible par achat (à fixer avec l'historique ads)
  cpi_eur: null                # coût cible par install
  daily_budget_total_eur: null # plafond global fixé par l'humain
  min_conversions_decision: 20
  min_spend_before_kill_multiple: 3   # dépenser ≥ 3 × CPA cible avant de tuer
lookback_days: 7
---

# Règles budget

Toutes les règles sont évaluées sur `lookback_days` (7 j), au niveau **ad group**, puis **ad** pour les créas.
`auto: false` = proposition écrite dans `CAMPAIGNS.md`, exécutée après validation humaine.

<!-- Comment remplir : fixer les cibles du frontmatter ; garder les règles, ajuster les multiples si l'app a un autre modèle (install vs achat). -->

| # | Règle | Condition | Action | auto |
|---|---|---|---|---|
| R1 | **Kill créa** | dépense ≥ 3 × CPA cible ET 0 conversion | mettre l'ad en pause | false |
| R2 | **Kill ad group** | ≥ 20 conversions ET CPA > 1,5 × cible sur 7 j | pause ad group | false |
| R3 | **Scale doux** | ≥ 20 conversions ET CPA ≤ cible | budget +20 % / jour, max 1 hausse / 48 h | false |
| R4 | **Scale fort** | ≥ 40 conversions ET CPA ≤ 0,7 × cible | budget +50 %, dupliquer l'ad group avec audience élargie | false |
| R5 | **Réallocation hebdo** | plusieurs ad groups actifs | déplacer 20 % du budget du quartile pire CPA vers le meilleur, sans dépasser le plafond | false |
| R6 | **Test créa** | créa organique `gagnant` (SOP_06) | nouvel ad group, budget test = 3 × CPA cible / jour, 3 jours, 3 hooks | false |
| R7 | **Learning** | ad group < 3 jours ou < 20 conversions | ne rien toucher | true |
| R8 | **Signal creative** | thumbstop < 20 % après 2 000 impressions | remplacer le hook (nouvelle ad, même vidéo) | false |
| R9 | **Alerte** | dépense jour > 1,5 × budget prévu, ou CPA jour > 3 × cible | notifier l'humain immédiatement | true |
| R10 | **SKAN** | campagne iOS dédiée < 90 installs / jour | ne pas lire les conversions SKAN comme fiables ; juger sur installs + MMP | true |

## Ordre d'évaluation
R9 → R7 → R1 → R2 → R8 → R3 → R4 → R5 → R6.

## Format d'une proposition

```
### Proposition <date>
| Ad group | Règle | Métriques 7 j | Action | Budget avant → après |
|---|---|---|---|---|
Total après : … € / j (plafond … €). Validé par : ___ le ___
```
