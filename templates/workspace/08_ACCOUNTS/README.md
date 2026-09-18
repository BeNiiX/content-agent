# 08_ACCOUNTS — un dossier par compte TikTok / Instagram

Chaque compte = un ICP (`01_BRAND/ACCOUNTS.md`). Rien ne passe d'un compte à l'autre. Le dossier d'un compte est créé à sa première spec.

```
<account>/
├── specs/F<NN>/F<NN>-<angle>-<nn>.json   specs de production (un sous-dossier par format validé) → scripts infra (voir 03_LIBRARY/formats/)
├── posts/                                sorties prêtes à publier : F<NN>-*.mp4, F<NN>-*/ (slides 4:5) — vidéos hors git
├── POSTS.md                              texte natif de front page + caption par post (généré : python3 infra/src/produce/posts-md.py ../08_ACCOUNTS/<account>)
├── TEXTES.md                             bulles + timings des vidéos (texte natif + synthèse vocale de la plateforme)
├── STATS.md                              relevé hebdo généré par infra/src/accounts/report.js
└── work/                                 intermédiaires (hors git)
```

Les chemins des specs pointent vers `07_ASSETS/` (photos, screen-records, items.json). Nommage des posts : `F<NN>-<angle>-<nn>`.
