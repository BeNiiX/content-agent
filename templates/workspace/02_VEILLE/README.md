# 02_VEILLE — généré par `infra/`

- `COMPETITORS.md` : registre humain/agent des comptes à surveiller (miroir `infra/config/competitors.json`).
- `digests/<date>.md` : nouvelles vidéos scorées depuis le dernier digest, à **annoter** (colonne Décision + tendances). Si un digest existe déjà pour le jour, les nouvelles vidéos sont **ajoutées** dans une section « Ajouts » sans toucher aux annotations. `--all` régénère tout et écrase les annotations du tableau.
- `transcripts/<key>.md` et `assets/hooks/<key>.jpg` : extraction (texte à l'écran, audio, image d'accroche), voir `transcripts/README.md`.
- `videos/<platform>-<id>.md` : une fiche par vidéo (métriques en frontmatter, déconstruction à remplir).
- `accounts/<platform>-<handle>.md` : une fiche par compte (médiane de vues, vidéos enregistrées, top 10 du feed).

Tout ce qui est écrit **après** le marqueur `<!-- notes-agent … -->` d'un fichier est conservé à la régénération.
Le reste est réécrit par `node src/build-docs.js`.

Première veille : déposer l'export TikTok dans `infra/data/raw/tiktok/<date>/` puis `cd infra && npm run sync` (SOP_01).
