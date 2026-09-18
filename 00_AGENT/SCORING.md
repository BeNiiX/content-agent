---
name: scoring
description: Comment l'agent mesure et compare les contenus (veille et propres posts) et les campagnes — définitions, seuils, règles de décision
type: agent-doc
updated: 2026-09-18
thresholds:
  outlier_documenter: 3        # vues ÷ médiane du compte
  outlier_prioritaire: 10
  our_median_views_tiktok: null  # à remplir après 10 posts
  our_median_views_reels: null
  target_cpa_purchase_eur: null  # cible = 05_CAMPAIGNS/BUDGET_RULES.md → targets.cpa_purchase_eur (instance)
  target_cpi_eur: null
---

# Scoring

## 1. Veille (vidéos tierces)

Calculé par `infra/src/score.js`, écrit dans le frontmatter de `02_VEILLE/videos/*.md`.

| Métrique | Formule | Usage |
|---|---|---|
| `outlier_score` | vues ÷ médiane des vues des 30 dernières vidéos du compte | **La** métrique de veille. ≥ 3 : à documenter. ≥ 10 : prioritaire. Indépendante de la taille du compte. |
| `engagement_rate` | (likes + commentaires + partages + saves) ÷ vues | Compare des vidéos de vues similaires. > 8 % TikTok = fort. |
| `share_rate` | partages ÷ vues | Proxy de viralité et d'installs (on partage à ceux avec qui on veut vivre le contenu). > 1 % = excellent. |
| `comment_rate` | commentaires ÷ vues | Proxy de débat / réaction. > 1 % = fort. |
| `save_rate` | saves ÷ vues | Proxy « je veux rejouer ça ». |
| `velocity` | vues ÷ jours depuis publication | Pour repérer ce qui monte *maintenant*. |

Pondération suggérée pour trier un digest : `outlier_score × (1 + share_rate×50 + comment_rate×20)`.
Si la médiane du compte est inconnue (`author_median_views: null`), `outlier_score` = null et on trie par `engagement_rate`.

## 2. Nos publications (organique)

Renseigné dans chaque fiche `04_EXPERIMENTS/EXP-xxx.md` à J+3 et J+7.

| Métrique | Source | Seuil de succès (initial, à recalibrer) |
|---|---|---|
| Vues J+7 | TikTok Studio / IG Insights | ≥ 2× notre médiane glissante (10 derniers posts) |
| Rétention à 3 s (TikTok « vu > 3 s ») | TikTok Studio | ≥ 60 % |
| Temps de visionnage moyen ÷ durée | TikTok Studio | ≥ 50 % |
| Partages ÷ vues | Studio / Insights | ≥ 1 % |
| Visites de profil ÷ vues | Studio | ≥ 0,5 % |
| Clics lien bio → installs | lien bio tracké du MMP (`01_BRAND/APP_CONTEXT.md` § Tracking) | suivi, pas de seuil au début |

Décision par post (J+7) : `gagnant` (2 seuils sur 3 parmi vues, rétention, partages) → cloner ×3 ;
`neutre` → 1 variante de hook ; `flop` → archiver la leçon.

## 3. Paid (TikTok Ads)

Lecture via `infra/src/ads/tiktok-report.js`. Niveau ad group et ad.

| Métrique | Définition | Cible initiale |
|---|---|---|
| Thumbstop | vues 2 s ÷ impressions | ≥ 30 % |
| Hold rate | vues 6 s ÷ vues 2 s | ≥ 40 % |
| CTR | clics ÷ impressions | ≥ 1 % |
| CPI | dépense ÷ installs (MMP ou SKAN) | à fixer (`BUDGET_RULES.md` → `targets.cpi_eur`) |
| CPA achat | dépense ÷ achats | ≤ cible `BUDGET_RULES.md` → `targets.cpa_purchase_eur` |
| ROAS D7 | revenu D7 ÷ dépense | suivi ; un abonnement annuel fausse la lecture courte (voir `01_BRAND/APP_CONTEXT.md` § Monétisation) |

Les règles d'action (scale / kill / réallouer) sont dans `05_CAMPAIGNS/BUDGET_RULES.md`.

## 4. Confiance statistique (règle simple)

Pas de décision sur < 1 000 vues organiques ou < 20 conversions paid. En dessous, le résultat est
« inconclusif », on prolonge ou on relance.
