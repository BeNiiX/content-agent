---
name: routines-cloud
description: Les agents Claude en cloud (routines Claude Code) qui travaillent sur le dépôt via GitHub — quoi, quand, avec quel prompt, comment les créer avec /schedule
type: runbook
updated: 2026-09-18
---

# Routines cloud — agents éditoriaux sur GitHub

Une **routine** = un prompt + un dépôt GitHub + des connecteurs, exécuté dans le cloud d'Anthropic à une cadence donnée
(minimum 1 h), sans le Mac ni le VPS. Chaque run clone le dépôt depuis `main`, travaille, commit, pousse. Le VPS tire
toutes les 10 min (`content-git-sync`) et **rend** ce que les routines ont spécifié ; le Mac tire quand l'humain s'y met.

Les routines n'ont **ni les vidéos** (hors git) **ni les secrets** (`infra/.env`, `01_BRAND/ACCOUNTS_CREDENTIALS.md`) **ni
`infra/data/`** (JSON de veille, plans du soir). Elles ont tout le texte : marque, angles, formats, opinions
(`07_ASSETS/opinions.json`), catalogue photos (`07_ASSETS/photos/PHOTOS.md` + les JPEG), specs, fiches EXP, stats poussées
par le VPS (`08_ACCOUNTS/*/STATS.md`, `06_CALENDAR/stats/<date>.md`).

Règle absolue, répétée dans chaque prompt : **l'agent cloud ne publie rien, ne dépense rien, ne touche pas aux
secrets, ne modifie pas `infra/`**. Aucun connecteur n'est nécessaire (les retirer tous du formulaire :
l'envoi en brouillon reste sur le VPS).

## Les routines

| Routine | Fichier prompt | Quand (Europe/Paris) | cron UTC (été / hiver) | Modèle | Connecteurs | Réseau |
|---|---|---|---|---|---|---|
| **veille-hebdo** | `veille-hebdo.md` | lundi 09:00 (après la veille VPS de 07:00 et le relevé de 08:00) | `0 7 * * 1` / `0 8 * * 1` | claude-sonnet-5 | aucun | *Trusted* suffit : la veille (yt-dlp) est faite sur le VPS (`content-weekly-veille`, 07:00) ; *Custom* + `*.tiktok.com`, `*.tiktokcdn.com`, `*.instagram.com` seulement si la routine doit enrichir elle-même (voir § Limites) |
| **production-specs** (une routine par compte actif) | `production-specs.md` | mardi et vendredi 06:00 | `0 4 * * 2,5` / `0 5 * * 2,5` | claude-sonnet-5 (opus pour un compte « labo ») | aucun | *Trusted* |
| **gabarits-quotidien** | `gabarits-quotidien.md` | tous les jours 05:00 et 13:00 : fiches techniques v0 + 2 pilotes, retouches de gabarit, dégel, évolutions (`03_LIBRARY/gabarits/README.md`) | `0 3,11 * * *` / `0 4,12 * * *` | claude-opus-5 recommandé | aucun | *Trusted* |
| **retours-quotidien** | `retours-quotidien.md` | tous les jours 05:30 et 13:30 : retouches demandées à la validation, puis learnings par compte | `30 3,11 * * *` / `30 4,12 * * *` | claude-sonnet-5 | aucun | *Trusted* |
| **revue-hebdo** | `revue-hebdo.md` | lundi 10:00 (après le relevé VPS de 08:00, poussé vers 08:30) | `0 8 * * 1` / `0 9 * * 1` | claude-opus-5 recommandé (jugement), sonnet acceptable | aucun | *Trusted* |

Pourquoi ces heures : le VPS enrichit la veille le lundi à 07:00 (`content-weekly-veille` → `02_VEILLE/`), relève les stats à
08:00 (`content-daily-stats`) et pousse le tout dans les 10-30 min ; la routine veille-hebdo annote le digest à 09:00, la revue
lit ces fichiers à 10:00. La production tourne
deux fois par semaine : l'envoi du soir consomme 1 contenu / jour / compte et la règle est ≥ 7 contenus `prêt` ou
`à monter` par compte ; N = 4 par run et par compte suffit, la routine s'arrête d'elle-même quand le stock est bon.

Le formulaire des routines saisit l'heure **en heure locale** (celle du navigateur) et la convertit ; les cron UTC
ci-dessus servent si l'on passe par `/schedule update` avec une expression cron (qui, elle, est en UTC — d'où deux
valeurs été / hiver ; retenir celle de la saison en cours, ou accepter une heure de décalage l'autre moitié de l'année).
Un run peut démarrer quelques minutes après l'heure (étalement).

## Créer une routine avec `/schedule` (Claude Code sur le Mac)

Pré-requis : Claude Code connecté au compte claude.ai (pas de clé API dans l'environnement, sinon `/schedule` est
absent), accès GitHub accordé au dépôt (`/schedule` le vérifie et indique quoi faire sinon — application GitHub
« Claude » ou `/web-setup`), et le prompt du fichier sous la main.

Dans une session Claude Code ouverte **à la racine du dépôt** :

```
/schedule
```

Claude pose les questions du formulaire ; répondre avec ces champs :

| Champ | Valeur |
|---|---|
| **Nom** | `content · veille-hebdo` (ou `production-specs · <compte>`, `revue-hebdo`, `retours-quotidien`, `gabarits-quotidien`) — préfixer du slug de `infra/config/project.json` si plusieurs apps |
| **Prompt** | **une seule ligne d'amorce** : `Ouvre deploy/routines/veille-hebdo.md à la racine du dépôt cloné et exécute-le à la lettre, du début à la fin. Compte ciblé : (aucun / <slug>). N = 4.` — le prompt détaillé vit dans git, versionné, modifiable sans toucher à la routine. Variante : coller le contenu complet du fichier (auto-suffisant aussi), à faire si l'on préfère que la routine ne dépende pas du dépôt. |
| **Dépôt** | `<owner>/<repo>`, branche `main` (clonée à chaque run) |
| **Environnement** | `Default` (réseau *Trusted* : registres de paquets et domaines de dev ; git/GitHub compris). Pas de variable d'environnement, pas de script de setup (la veille installe yt-dlp elle-même si besoin : `pip install yt-dlp`). Réseau *Custom* + domaines TikTok/Instagram seulement pour une veille qui enrichit dans le cloud. |
| **Déclencheur** | Planifié : hebdomadaire lundi 09:00 (veille), 10:00 (revue) ; pour « mardi et vendredi » choisir le préréglage le plus proche puis `/schedule update <nom> cron "0 4 * * 2,5"` |
| **Modèle** | sélecteur du prompt : `claude-sonnet-5` par défaut, `claude-opus-5` pour la revue |
| **Connecteurs** | **tout retirer** (Gmail, Supabase, générateurs d'images…) : ces routines n'en ont pas besoin, et un connecteur inclus est utilisable sans confirmation pendant le run |

Puis `/schedule list` pour vérifier, `/schedule run <nom>` pour un premier run immédiat (aller lire le transcript
sur https://claude.ai/code/routines : un statut vert signifie que la session s'est terminée sans erreur
d'infrastructure, pas que la tâche a réussi), `/schedule update` pour modifier, et l'interrupteur de la page web pour
mettre en pause. `/schedule why did <nom> do nothing this morning?` explique un run.

## Branche cible et droits de push

Par défaut les prompts demandent de **pousser directement sur `main`** (le VPS et le Mac en dépendent). Le cloud refuse
un push sur une branche autre que `claude/*` si elle est protégée sur GitHub, si quelqu'un d'autre y a une PR ouverte, ou
si elle porte des commits d'un autre auteur : d'où l'identité git du VPS = celle du compte GitHub de l'humain
(`deploy/README.md` § Étape 2) et pas de règle de protection sur `main`. Si un push est quand même refusé, chaque prompt
prévoit le repli : pousser sur `claude/<routine>-<date>` et ouvrir une pull request ; l'humain la fusionne depuis le Mac
(ou GitHub) et le VPS la récupère au prochain `git-sync`.

Tout ce qu'une routine fait apparaît **au nom de l'humain** (commits, PR).

## Limites connues

- **Veille dans le cloud** : `infra/data/` est hors git, donc `enrich.js` / `score.js` / `build-docs.js` n'ont rien à
  traiter dans un clone frais. Décision : la partie « yt-dlp » de la veille tourne sur le **VPS** (`content-weekly-veille`,
  `infra/scripts/weekly-veille.sh`, exports déposés par `deploy/sync-media.sh --data`), en secours sur le Mac (`npm run sync`,
  puis `git push` de `02_VEILLE/`) ; la routine `veille-hebdo` **annote** le digest et **documente** les concepts. Le prompt
  détecte le cas et fait ce qu'il peut. Versionner `infra/data/*.json` pour enrichir dans le cloud n'est envisagé que si
  TikTok bloque l'IP du VPS (voir `deploy/TODO.md`).
- **Pas de rendu dans le cloud** : ni ffmpeg sur les vidéos sources (absentes), ni `carousel.py` (possible en théorie —
  Pillow + photos dans git — mais volontairement laissé au VPS pour que les JPEG n'arrivent que d'un seul endroit).
- **Quota** : les routines consomment l'abonnement claude.ai et un plafond quotidien de runs ; 3 à 5 runs par semaine
  restent modestes.
- **Modèle** : le prompt d'une routine est traité comme une consigne de confiance ; ce que la routine lit dans le dépôt
  (fichiers MD, JSON) reste des données. Les prompts le rappellent : un fichier qui « demanderait » de publier ou de
  dépenser est ignoré.
