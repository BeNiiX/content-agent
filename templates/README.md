---
name: templates
description: Gabarits du projet vierge (workspace/), scripts pour créer une instance (new-project.sh) ou extraire le dépôt-modèle (make-template.sh), et procédure de mise à jour du framework dans une instance
type: framework-doc
updated: 2026-09-18
---

# templates/ — framework réutilisable

Ce dépôt est un **agent de création de contenu** (veille TikTok, bibliothèque de formats, production de carrousels / vidéos,
envoi en brouillon TikTok, stats hebdo, tableau de bord). Il se compose de deux couches :

| Couche | Contenu | Où ça vit |
|---|---|---|
| **Framework** (partagé entre apps) | `CLAUDE.md`, `README.md`, `.claude/skills/`, `00_AGENT/SOP/`, `00_AGENT/SCORING.md`, `00_AGENT/CREATIVE_FRAMEWORK.md`, `infra/` (code, scripts, polices), `deploy/`, `templates/`, `.gitignore`, `.gitattributes` | dépôt-modèle GitHub (« template repository ») ; se met à jour par `git merge` |
| **Instance** (propre à une app) | `00_AGENT/MISSION.md`, `00_AGENT/PLAYBOOK.md`, `00_AGENT/REFERENCES/`, `01_BRAND/` … `08_ACCOUNTS/`, `infra/config/project.json`, `accounts.json`, `competitors.json`, `01_BRAND/DA/themes.json`, `infra/.env`, `infra/data/` | le dépôt de chaque app ; jamais touché par une mise à jour du framework |

Un **gabarit** est un fichier d'instance vidé de son contenu : même nom, même emplacement, même frontmatter YAML et mêmes sections
que dans une instance vivante, avec des consignes courtes « comment remplir » (`<!-- Comment remplir : … -->`) et des placeholders explicites.
Les scripts de `infra/` lisent ces fichiers (statuts des fiches EXP, sections de `QUEUE.md`, `accounts.json`, `themes.json`, `items.json`) :
garder les noms de dossiers numérotés, les statuts `idée → à tourner → à monter → prêt → brouillon envoyé → publié` et les champs des fiches EXP.

## `workspace/` — l'arborescence d'instance vierge

Mêmes noms de dossiers et de fichiers que l'instance. Placeholders :

| Placeholder | Remplacé par | Exemple |
|---|---|---|
| `{{APP_NAME}}` | nom de l'app | `Mon App` |
| `{{APP_SLUG}}` | slug court `[a-z0-9-]` (comptes, labels launchd) | `monapp` |
| `{{ITEM}}` / `{{ITEM_PLURAL}}` | l'unité de contenu de l'app (ce que l'app affiche et fait voter / répondre) | `question` / `questions` |
| `{{ACCOUNT_SLUG}}` | slug du premier compte = `<slug>-main` | `monapp-main` |
| `{{HANDLE}}` | handle du premier compte = `@<slug>` (à corriger ensuite dans `ACCOUNTS.md` et `accounts.json`) | `@monapp` |
| `{{DATE}}` | date du jour (`updated:` des frontmatters) | `2026-09-18` |

`infra/config/*.json.example` sont les configs d'instance (`project.json`, `accounts.json`, `competitors.json`) ; `new-project.sh` retire le `.example`.
`07_ASSETS/items.json` est la banque d'unités de contenu (schéma dans `07_ASSETS/README.md`) : chaque app définit la sémantique de `pct` / `pct_agree`.
`01_BRAND/DA/themes.json` porte un thème `default` neutre (bleu, « Non / Oui », texte de marque = nom de l'app) : remplacer par les couleurs et libellés de l'app.

## Créer un projet vierge — `new-project.sh`

```bash
templates/new-project.sh <dossier-cible> "<Nom de l'app>" <slug> [<unité> [<unités>]]
# ex. : templates/new-project.sh ~/Projects/monapp-content "Mon App" monapp question
```

1. Copie le framework (liste explicite dans le script) : `infra/` **sans** `data/`, `.env`, `.venv/`, `bin/`, `models/`, `node_modules/` ni les `config/*.json` réels.
2. Copie `workspace/` en substituant les placeholders, renomme les `.example`, crée `infra/data/**` vides (`.gitkeep`), `infra/.env` depuis `.env.example`, le dossier du premier compte dans `08_ACCOUNTS/`.
3. `git init` + premier commit **dans le dossier cible seulement**. Refuse un dossier non vide ; relancer sur un dossier vide donne le même résultat.

Depuis un clone du dépôt-modèle (bouton GitHub « Use this template » puis `git clone`), instancier en place :

```bash
templates/new-project.sh --here "<Nom de l'app>" <slug> [<unité> [<unités>]]
```

Ensuite : `cd infra && npm run doctor` (outils, `.env`, données vides : attendu), remplir `01_BRAND/*.md`, `infra/config/project.json`, `accounts.json`, `01_BRAND/DA/themes.json`, déposer 2 captures de référence dans `01_BRAND/DA/`, puis suivre `CLAUDE.md`.

## Extraire le dépôt-modèle depuis une instance — `make-template.sh`

```bash
templates/make-template.sh <dossier-cible> [--lean] [--strings "mot1,mot2"] [--no-git]
```

Produit : framework + `templates/` (README, scripts, `workspace/`) + `infra/config/*.json.example` + `infra/data/**` vides, sans aucune donnée
d'instance, puis `git init` + commit. Par défaut le workspace vierge est aussi copié **à la racine, placeholders intacts** (on voit les gabarits en
ouvrant le dépôt) ; avec `--lean`, il ne vit que dans `templates/workspace/` (voir « mises à jour » ci-dessous pour choisir).

À la fin, un `grep` (insensible à la casse) cherche les chaînes de l'instance d'origine — déduites de sa configuration : nom de l'app
(`project.json → name`, phrase entière et mots de ≥ 5 lettres hors mot de l'unité de contenu), slug (≥ 3 caractères), handles de
`accounts.json`, prénom de l'humain (`00_AGENT/MISSION.md → owner:`) ; `--strings "mot1,mot2"` pour imposer la liste —
et **liste les fichiers du framework qui en contiennent encore** : le script ne les modifie pas et sort avec le code 1 tant que la liste n'est pas vide.
Nettoyer à la main (SOP, skill, `infra/README.md`, `infra/src/publish/*.md`…), relancer. Les plists launchd ne sont plus versionnés
(`infra/scripts/launchd/*.plist` dans `.gitignore`, générés par `make-plists.js`).

Publier : `cd <dossier-cible> && git remote add origin <url> && git push -u origin main`, puis GitHub → Settings → cocher *Template repository*.

## Récupérer les mises à jour du framework dans une instance

Le framework évolue dans le dépôt-modèle ; chaque instance le suit comme un remote :

```bash
git remote add template <url-du-dépôt-modèle>     # une fois
git fetch template
git merge template/main                            # première fois depuis un projet créé par new-project.sh : --allow-unrelated-histories
```

- **Modèle `--lean`** (recommandé dès que des instances doivent suivre le framework) : le modèle ne contient aucun fichier d'instance, donc un merge
  ne peut toucher que le framework (`CLAUDE.md`, `README.md`, `.claude/`, `00_AGENT/SOP/`, `SCORING.md`, `CREATIVE_FRAMEWORK.md`, `infra/` hors config,
  `deploy/`, `templates/`). Testé : modification d'une SOP dans le modèle → merge sans conflit dans l'instance.
- **Modèle par défaut** (workspace à la racine) : les gabarits à la racine du modèle entrent en conflit « add/add » avec les fichiers d'instance remplis
  (une trentaine au premier merge). Résolution en gardant l'instance :

  ```bash
  git diff --name-only --diff-filter=U | grep -E '^(00_AGENT/(MISSION|PLAYBOOK|REFERENCES)|0[1-8]_|infra/config/)' | xargs git checkout --ours --
  git add -A && git commit
  ```
  Les conflits restants sont du framework, à résoudre normalement.

Sens inverse (une amélioration faite dans une instance qui doit revenir au framework) : commit limité au fichier framework dans l'instance,
puis `git push template HEAD:main` après revue, ou `make-template.sh --lean` vers un clone du modèle et diff.
