# formats/ — formats validés seulement

Un fichier `FORMAT-NN-<slug>.md` par format **validé par l'humain** (modèle : `../_TEMPLATE_FORMAT.md`).
Tant qu'un format n'est pas validé, sa fiche vit dans `../archive/` avec `status: proposé` ; l'agent la propose, l'humain valide, l'agent déplace et met à jour `../INDEX.md` (tableau *Formats validés*, `next_format_id`).

Chaque format documente : structure, rendus et outils, déclinaison par compte (DA) et par angle, spec JSON type, preuves de veille, métriques, résultats, leçons.
