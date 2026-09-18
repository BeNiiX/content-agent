---
name: sop-05-campagnes-budget
description: Lire les performances TikTok Ads, appliquer les règles de budget, proposer et exécuter les réallocations après validation
type: sop
updated: 2026-09-18
---

# SOP 05 — Campagnes et budget

## Contexte (voir `01_BRAND/APP_CONTEXT.md` § Tracking et `05_CAMPAIGNS/CAMPAIGNS.md` § État / Pré-requis)

- Attribution : le MMP de l'app (`01_BRAND/APP_CONTEXT.md` § Tracking) + SKAN. Vérifier que l'événement d'achat est mappé
  côté TikTok (sinon TikTok ne voit pas les achats SKAN). TikTok conseille > 90 installs / jour / campagne pour des
  conversion values lisibles.
- Historique, cibles et état des campagnes : `05_CAMPAIGNS/CAMPAIGNS.md` (état) et `05_CAMPAIGNS/BUDGET_RULES.md` (`targets`).

## Lecture (autonome)

```bash
cd infra
node src/ads/tiktok-report.js --days 7                 # ad groups : dépense, impressions, clics, installs, achats, CPA
node src/ads/tiktok-report.js --days 7 --level ad      # par créa
node src/ads/tiktok-report.js --days 30 --json > data/ads/report-<date>.json
```

Nécessite `TIKTOK_ADS_ACCESS_TOKEN` et `TIKTOK_ADVERTISER_ID` dans `.env` (app développeur TikTok
avec Marketing API). Sans ces clés, l'agent lit les captures d'écran d'Ads Manager que l'humain fournit
et saisit les chiffres à la main dans la fiche campagne.

Croiser avec le MMP (installs et achats réels).

## Décision (règles dans `05_CAMPAIGNS/BUDGET_RULES.md`)

1. Pour chaque ad group actif, calculer CPA achat 7 j, thumbstop, hold rate, et le nombre de conversions.
2. Appliquer les règles dans l'ordre : *kill* → *scale* → *réallocation* → *nouvelle créa*.
3. Écrire la proposition dans `05_CAMPAIGNS/CAMPAIGNS.md` section *Propositions en attente* :
   tableau (ad group, action, budget actuel → proposé, justification chiffrée).
4. **Attendre la validation de l'humain** (sauf règles `auto: true`).

## Exécution (après validation)

```bash
node src/ads/tiktok-budget.js --adgroup <id> --budget 40          # € / jour
node src/ads/tiktok-budget.js --adgroup <id> --status DISABLE
node src/ads/tiktok-budget.js --adgroup <id> --status ENABLE
```

Chaque exécution est journalisée dans `05_CAMPAIGNS/CAMPAIGNS.md` section *Journal* (date, action, avant/après, qui a validé).

## Créas paid

Une créa organique `gagnant` (SOP_06) devient candidate paid : ajouter 3 variantes de hook, format
15-30 s, nom de l'app dans les 3 premières secondes, CTA de `project.json → cta`.
Test : 1 ad group par créa, budget test = 3 × CPA cible / jour pendant 3 jours (règle `test_budget`).
