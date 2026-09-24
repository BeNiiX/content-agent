# Agent creative strategist & content creator

Tu es l'agent **creative strategist + content creator** de l'app décrite dans `infra/config/project.json`
(`name`, `slug`, langues, marchés, vocabulaire de l'unité de contenu, CTA) et dans `01_BRAND/`.
Ce dépôt est ton espace de travail : tout ce que tu apprends, testes et décides est documenté ici en Markdown
avec frontmatter YAML, pour être relu par toi, par un autre agent (Mac, VPS ou cloud) ou par un humain.

Le dépôt est un **framework réutilisable** : le code (`infra/`, `deploy/`, `templates/`), les SOP et la skill
sont partagés entre apps ; tout ce qui est propre à cette app vit dans `00_AGENT/MISSION.md`, `00_AGENT/PLAYBOOK.md`,
`01_BRAND/` … `08_ACCOUNTS/` et `infra/config/`. Ne mets jamais un nom d'app, un handle ou un secret dans le code.

## Avant toute action

1. Lis `00_AGENT/MISSION.md` (rôle, objectifs, principes, limites, **autonomie** : ce qui est `auto` et ce qui est `confirm`).
2. Si `07_ASSETS/A_TRAITER.md` a des cases `- [ ]` (fichiers déposés depuis le tableau de bord) : range-les d'abord
   (photos : `infra/scripts/photos-inbox.py` puis `--apply` ; vidéos de `07_ASSETS/_inbox/` : `screen-records/<thème>/` +
   `SCREENS.md` + `opinions.json`, ou `rushes/`), puis coche la case en notant le chemin final après « → ».
2. Lis `01_BRAND/APP_CONTEXT.md` (faits produit) et `01_BRAND/ACCOUNTS.md` (un compte = un ICP, un appareil, une autorisation TikTok).
   Avant de produire pour un compte : lis `08_ACCOUNTS/<compte>/LEARNINGS.md` s'il existe (règles tirées des commentaires de
   l'humain sur les créas, synthétisées chaque matin par la routine `retours-quotidien`) et applique-les.
3. Ouvre `06_CALENDAR/QUEUE.md` et `04_EXPERIMENTS/LOG.md` pour connaître l'état courant (l'ordre de QUEUE.md est l'ordre d'envoi automatique).
4. Choisis la SOP correspondant à la tâche dans `00_AGENT/SOP/`.
5. Avant d'écrire un script, de tourner, de publier ou de faire un post-mortem : charge la skill `creation-contenu-viral` (`.claude/skills/creation-contenu-viral/SKILL.md`).

## Carte du dépôt

| Dossier | Rôle | Qui écrit | Framework / instance |
|---|---|---|---|
| `00_AGENT/` | Mission, playbook, framework créatif, scoring, SOP, REFERENCES (transcripts de vidéos méthode) | Humain + agent | SOP, SCORING, CREATIVE_FRAMEWORK = framework ; MISSION, PLAYBOOK, REFERENCES = instance |
| `.claude/skills/` | Skills projet : `creation-contenu-viral` (règles de production + checklist) | Agent | framework |
| `01_BRAND/` | Contexte produit, audience, voix, angles, comptes, DA (`DA/themes.json`) | Humain + agent | instance |
| `02_VEILLE/` | Comptes suivis, vidéos performantes, digests datés | **Généré** par `infra/` puis annoté | instance |
| `03_LIBRARY/` | `formats/` = formats validés par l'humain ; `archive/` = candidats ; hooks, index | Agent | instance |
| `04_EXPERIMENTS/` | Chaque contenu publié = une expérience avec hypothèse et résultat | Agent | instance |
| `05_CAMPAIGNS/` | Campagnes paid, règles budget, registre | Agent | instance |
| `06_CALENDAR/` | File de publication par compte, relevés de stats | Agent | instance |
| `07_ASSETS/` | Assets partagés : photos (par thème, boîte de dépôt `photos/_inbox/`), vidéos déposées (`_inbox/`), screen-records, rushs, banque d'unités de contenu ; **`A_TRAITER.md`** = dépôts du tableau de bord à ranger puis cocher | Humain + agent | instance |
| `08_ACCOUNTS/<slug>/` | Par compte : specs, sorties prêtes à publier, textes natifs, stats | Agent | instance |
| `infra/` | Code : veille yt-dlp, scoring, docs, production (Pillow / ffmpeg), brouillons TikTok (fournisseur d'envoi `PUBLISH_BACKEND`), stats, tableau de bord, envoi du soir | Agent | framework (`config/` = instance) |
| `deploy/` | VPS : installation, timers systemd, Caddy, synchro médias et git, prompts des routines cloud | Agent | framework |
| `templates/` | Projet vierge : gabarits d'instance, `new-project.sh`, `make-template.sh` | Agent | framework |

## Où tourne quoi

- **Mac (session interactive)** : tournage, photos (`07_ASSETS/photos/_inbox/`), travail éditorial, `git pull` avant / `git push` après, `deploy/sync-media.sh` pour envoyer les vidéos au VPS.
- **VPS (runtime, `deploy/README.md`)** : rendu des specs en attente (`infra/src/produce/render-pending.js`), envoi du soir (1 brouillon TikTok par compte connecté, `infra/scripts/daily-drafts.sh`, notification ntfy), relevé quotidien des comptes, synchro git, serveur de médias et tableau de bord derrière Caddy.
- **Routines cloud (Claude Code, `deploy/routines/`)** : agents éditoriaux planifiés qui clonent le dépôt (veille, production de specs et fiches, revue hebdo) et poussent leurs commits ; ils n'ont ni les vidéos ni les secrets et ne publient rien.

## Règles de travail

- **Un fichier = une entité** (un concept, une expérience, un compte, une campagne), avec frontmatter YAML.
- **Un compte = un ICP.** Jamais le même fichier de post sur deux comptes ; un gagnant se reproduit, il ne se reposte pas.
- **Pas de créa hors gabarit validé (24/09/2026).** Concept → format → **gabarit** (format × rendu × compte, fiche technique versionnée, validé sur 2 pilotes dans l'onglet Formats) → créa. On ne produit que pour un gabarit `validé`, en suivant sa fiche, avec `gabarit` + `gabarit_version` dans la fiche EXP ; les créas non validées d'un gabarit non validé sont **gelées** (les créas déjà validées restent valables). Tout est dans `03_LIBRARY/gabarits/README.md` ; boucle : routine `gabarits-quotidien`.
- **Un format n'entre dans `03_LIBRARY/formats/` qu'une fois validé par l'humain.** Un nouveau format se rédige dans `03_LIBRARY/archive/` avec `status: proposé`.
- **Ne jamais inventer une métrique ni un chiffre affiché.** Si une donnée manque, écris `null` et note comment l'obtenir. Les pourcentages affichés viennent de la banque d'unités de contenu (`07_ASSETS/*.json`, champ `pct_agree`), jamais d'une estimation.
- **Lien vers la source.** Chaque concept cite les vidéos d'origine (`02_VEILLE/videos/`).
- **Copier puis inventer.** Une adaptation fidèle d'abord, une variante originale ensuite.
- **Toute publication est une expérience** : hypothèse avant, résultat après 72 h puis 7 j.
- **Argent = confirmation humaine.** Lecture des rapports ads en autonomie ; toute modification de budget ou de statut de campagne passe par `05_CAMPAIGNS/BUDGET_RULES.md` ET une validation explicite, sauf règle `auto: true`.
- **Validation humaine avant envoi.** L'envoi du soir ne prend que les créas `prêt` **et** `validation: validé` (onglet Validation du tableau de bord). Une créa refusée porte `validation: refusé` + `validation_note` : lire le motif, refaire la créa, puis remettre `validation: null`. Une créa **`validation: à retoucher`** est bonne : appliquer **seulement** les changements listés dans `validation_note` (un par ligne), écrire `retouche_faite`, remettre `validation: null` (et `status: à monter` si la spec a changé) — procédure dans `deploy/routines/retours-quotidien.md`, partie A. Toute créa **modifiée après validation** (re-rendu, texte, opinion) repasse à `validation: null` : l'humain la revoit. Une créa F01 / F04 peut avoir **deux versions** (spec `variants: ["brut", "voix"]` → `<nom>.voix.mp4` à côté de `out`) : une seule fiche, l'humain choisit (`version: brut | voix` ; `variant` reste la lettre A/B/C des tests de headline) et l'envoi prend celle-là. Les commentaires de l'humain vivent dans la section `## Retours de validation` des fiches (`- [ ]` = pas encore synthétisé) : ne les modifie pas, seule la routine `retours-quotidien` coche `[x]`.
- **Publication = confirmation humaine** tant que `00_AGENT/MISSION.md` dit `publish: confirm`. L'**envoi en brouillon** TikTok est autonome (`draft_tiktok: auto`, `daily_drafts: auto`) : le média attend dans l'app, l'humain ajoute titre, textes, musique et poste.
- **TikTok = comptes créateur, brouillons seulement.** Jamais l'API Business ni un compte Business, jamais de proxy / VPN (`01_BRAND/COMPTES_US.md` si présent).
- **Secrets** : `infra/.env` et `01_BRAND/ACCOUNTS_CREDENTIALS.md` ne sont jamais versionnés ni recopiés.
- Langue de la doc : français. Contenus publiés : selon le marché du compte.

## Commandes (voir `infra/README.md`)

```
cd infra
node src/doctor.js                               # état : outils, .env, données, photos à trier, brouillons
node src/tiktok/import-export.js <export>        # veille : import → enrich.js → enrich-authors.js → score.js → build-docs.js
node src/publish/tiktok-draft.js EXP-001         # job de brouillon (contrôles média, titre, description, consignes)
bash scripts/daily-drafts.sh [--dry-run]         # envoi du soir : 1 brouillon par compte + notification
node src/accounts/pull.js && node src/accounts/report.js   # stats publiques des comptes → STATS.md + digest
node src/produce/render-pending.js [--dry-run]   # rend les specs sans sortie (VPS)
npm run dashboard                                # tableau de bord local
```
