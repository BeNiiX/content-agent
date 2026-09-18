---
name: photos-inbox
description: Boîte de dépôt des photos — l'humain dépose ici en vrac (n'importe quel nom, JPG / PNG / HEIC), l'agent trie, renomme, range par thème et met à jour PHOTOS.md
type: assets
updated: {{DATE}}
---

# Boîte de dépôt photos (`_inbox/`)

**Humain** : dépose ici toutes les photos, dans le désordre, avec leurs noms d'origine (IMG_1234.HEIC, capture.png…).
Pas besoin de renommer ni de convertir. Sous-dossiers acceptés. Verticales de préférence (carrousels en 4:5, vidéos en 9:16).

Ce qui manque le plus : <!-- Comment remplir : liste des situations sans photo (voir PHOTOS.md), mise à jour par l'agent. -->

**Agent** : à chaque session, si `_inbox/` contient des images :

```bash
cd infra
.venv/bin/python scripts/photos-inbox.py            # 1. convertit (HEIC/PNG → JPG), normalise, planche contact numérotée + _triage.json à remplir
# 2. l'agent regarde _inbox/_contact-sheet-*.jpg, remplit theme / situation / precision / personnes / provenance dans _triage.json
.venv/bin/python scripts/photos-inbox.py --apply    # 3. renomme <theme>-<situation>-<precision>.jpg, range dans photos/<theme>/, ajoute la ligne à PHOTOS.md, garde l'original dans _backup-fichiers-origine/
```

Règles de tri (`07_ASSETS/README.md`) : ranger par ce que la photo représente, jamais par la source ; un thème inconnu = nouveau dossier.
