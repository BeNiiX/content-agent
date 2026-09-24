---
name: creation-contenu-viral
description: Règles de création de contenu court viral (TikTok / Reels) pour l'app de cette instance — à charger avant d'écrire un script, de préparer un tournage, de publier, ou de faire le post-mortem d'une vidéo. Sources : 00_AGENT/REFERENCES/ (transcripts de méthode) + leçons de 03_LIBRARY/INDEX.md.
---

# Création de contenu viral — règles de travail

Charge cette skill quand tu : écris ou relis un script (`03_LIBRARY/SCRIPTS/`), prépares un brief de tournage,
valides une vidéo avant publication (SOP_04), ou analyses pourquoi une vidéo a marché ou non (SOP_06).
Sources détaillées : les fiches de `00_AGENT/REFERENCES/` (transcripts des vidéos de méthode dont ces règles sont tirées).
Nos propres données : `03_LIBRARY/INDEX.md` (leçons transverses) et `03_LIBRARY/HOOKS.md` (hooks, hashtags, sons).

## 1. Distribution

| Règle | Ce qu'on en fait ici |
|---|---|
| Les hashtags ne servent à rien | 3-4 hashtags max, pour la lisibilité de la niche, jamais comme levier (cœur : `project.json → hashtags_core`, rotation : `03_LIBRARY/HOOKS.md` § Hashtags). |
| Republie tes vidéos en Reels d'essai | Chaque TikTok est republié sur Instagram en **Reel d'essai** (trial reel : diffusé à des non-abonnés, sans polluer le profil). Étape de SOP_04. |
| Copie les Américains | C'est SOP_01 : la veille cherche les formats qui marchent déjà (sur les marchés de `project.json → markets` et aux US, où les formats naissent), on copie fidèlement d'abord (A1), on invente ensuite (A2). |
| Publie au moins 1 fois par jour | Cadence cible : 1 TikTok / jour et par compte actif. Les formats à effort 1 (`03_LIBRARY/FORMATS.md`, colonne *Effort*) existent pour tenir ce rythme sans tournage quotidien. |
| L'heure de publication, on s'en fout | Ne pas optimiser l'heure. Publier quand c'est prêt (l'envoi du soir a une heure fixe pour la routine, pas pour l'algorithme). |
| Refais les formats qui ont marché, change ceux qui n'ont pas marché | Règle de SOP_06 : `gagnant` → cloner ×3 ; `flop` → changer de format, pas retoucher le montage. |
| Bloque ceux qui te bloquent | Ne pas répondre aux trolls en commentaire, bloquer. Répondre aux désaccords avec une autre unité de contenu de l'app (règle de réponse dans `01_BRAND/VOICE.md`). |
| Collabs avec d'autres créateurs | Cibles : les créateurs de `02_VEILLE/COMPETITORS.md` (section *Créateurs*) — duet / stitch d'abord, collab ensuite. |
| Rebondis sur l'actualité | Un contenu d'actualité par semaine dans un format à effort 1 (sujet chaud → unité de contenu → chiffre de l'app). |
| Montre ta vie pour qu'on s'attache | Pas prioritaire tant qu'on est faceless. Option : une série « coulisses » (technique *Meta* de `CREATIVE_FRAMEWORK.md` §6). |

## 2. Technique de tournage (quand quelqu'un est à l'image)

- Éclairage > caméra. **Jamais la lumière du plafond, toujours une lumière en face**. Pour les UGC canapé / soirée : une lampe ou ring light face aux visages, le plafonnier éteint.
- Micro proche de la bouche (cravate ou enregistreur externe).
- Vêtements sombres, pas de mur blanc derrière, de l'espace entre la personne et le décor (profondeur).
- 1080p, 30 i/s. Nos exports : `infra/scripts/normalize.sh` sort exactement ça.
- Parle avec les mains. Si le montage n'est pas ton fort, travaille l'oral.
- Sous-titres en police grasse lisible (celle de `infra/fonts/`, voir `01_BRAND/DA/README.md`), placés **sous le menton** (pas au centre du visage, pas en bas de l'écran où l'UI TikTok les cache).

Pour nos formats faceless (photo + screen-record, séries texte), la traduction est : lisibilité du texte (bandeau
noir, police grasse), pas de texte dans la zone basse de l'interface, une idée par bulle, image d'accroche avec
de la profondeur et de la lumière chaude (voir `03_LIBRARY/PROMPTS_IMAGES.md`).

## 3. Hook et format

- **Le hook, c'est 90 % du succès.** Un hook **visuel** bat un hook auditif : l'image des 2 premières secondes doit
  raconter la promesse seule (photo vivante + texte lisible). Vérifier ce que dit la veille de l'instance (`03_LIBRARY/INDEX.md` § Leçons).
- **Le format est plus important que le montage.** Ne pas passer du temps à peaufiner une vidéo dont le format n'a pas
  prouvé qu'il marche. D'abord copier un format gagnant, ensuite seulement soigner.
- Musique : si musique, une musique **trend** — sauf si la veille montre qu'un son signature marche dans la niche
  (noter dans `03_LIBRARY/HOOKS.md` § Sons) ; tester les deux.
- Dis des choses qu'on n'a jamais entendues, montre des choses qu'on n'a jamais vues : notre matière première, c'est
  ce que l'app révèle (`01_BRAND/APP_CONTEXT.md` § Mécanique, ligne « payoff »). Si l'app produit un chiffre, toujours
  montrer un chiffre surprenant (seuils dans `APP_CONTEXT.md` § Banque).
- Pertinence > beauté : un sujet qui touche le spectateur (taguable, son quotidien) bat une belle image.

## 3 bis. Se faire comprendre par quelqu'un qui ne connaît pas l'app

Le spectateur n'a jamais ouvert l'app et ne connaît pas le vocabulaire de l'unité de contenu (voir `vocabulary` de `infra/config/project.json` : nom de l'unité, catégories propres à l'app). Trois règles :

- **Le hook ne repose jamais sur un mot interne.** Une question qui utilise un mot propre à l'app (le nom d'une catégorie, d'un mode de jeu) ne veut rien dire hors de l'app. Dire ce qu'on voit : « Laquelle a le moins de gens d'accord ? », « 3 avis que presque personne ne partage ». Le mot de marque reste sur les visuels de l'app et dans les hashtags.
- **La mécanique est expliquée dans le contenu, en une phrase, dès le début.** Carrousel : une 2e ligne de texte natif sous le hook (« D'accord ou pas ? Le vrai % des joueurs est sur la slide d'après »). Vidéo : la bulle 2 cite **l'unité de contenu en toutes lettres** puis donne la règle (« “X” : d'accord ou pas, chacun swipe »), et la bulle verdict donne le chiffre **et** de quel côté est la personne filmée (« 61 % sont d'accord. Lui, il est dans les 39 % »).
- **Le hook POV nomme une situation ou une personne, pas le produit.** « Pov : tu dis que le tennis c'est long et chiant », « Tague le pote qui se dit sportif », « Pov : la mi-temps s'éternise, tu sors ça » — pas « Pov : tu as trouvé le jeu ultime de X ». Un même hook produit répété sur toutes les vidéos ne raconte rien et ne se partage pas.

Test à faire avant de rendre : **couper le son et lire les 6 premières secondes comme si on ne connaissait rien** — sait-on ce qui se passe, ce qu'on attend de nous, et pourquoi c'est drôle ou clivant ?

## 4. CTA

- **Un CTA à la fin de chaque vidéo** (dernière bulle : « Dis-le en commentaire », « Tague ton pote qui… »).
- **Le CTA répété en description**, avec le nom de l'app : le CTA de `infra/config/project.json → cta` (ex. « C'est l'app <nom> sur l'App Store »).
- Le CTA se déguise en jeu quand c'est possible (ex. : une slide de choix « partage à… OU … »).

## 5. Checklist avant publication (à cocher dans la fiche EXP)

- [ ] Hook visuel lisible sans le son en 1 s (bandeau noir, ≤ 8 mots, image qui raconte la promesse)
- [ ] Compréhensible sans connaître l'app : aucun mot interne dans le hook, mécanique expliquée en une phrase dès le début (§ 3 bis)
- [ ] La promesse du hook est tenue par le contenu (famille de hook ↔ contrainte sur les chiffres, cf. doc d'instance)
- [ ] Format déjà validé (format `gagnant` ou source à outlier ≥ 3) ou test assumé dans la fiche EXP
- [ ] Une idée par vidéo, un chiffre surprenant
- [ ] Texte hors zone d'interface (pas dans les 15 % du bas), police grasse ; si visage : sous-titres sous le menton
- [ ] Si quelqu'un est à l'image : lumière frontale, vêtements sombres, profondeur, micro proche
- [ ] 1080×1920, 30 i/s (`normalize.sh`)
- [ ] Voix TTS native sur les bulles si format screen-record
- [ ] CTA en dernière bulle + CTA et nom de l'app en description, 3-4 hashtags max
- [ ] Republication en Reel d'essai sur Instagram planifiée
- [ ] Fiche EXP créée avec hypothèse et métrique de succès

## 6. Post-mortem (SOP_06)

Quand une vidéo flop, vérifier dans cet ordre : le hook (image + texte), le format (a-t-il une preuve ailleurs ?),
la pertinence du sujet (taguable ? quotidien ?), puis seulement la technique (lumière, son, montage).
Quand une vidéo marche : la refaire trois fois en ne changeant que le sujet, avant de changer quoi que ce soit d'autre.

## 7. Exemples de l'instance

Cette skill ne contient aucun exemple propre à l'app. Les preuves et les exemples concrets vivent dans les docs d'instance,
à lire avant d'appliquer une règle :

- `03_LIBRARY/INDEX.md` § *Leçons transverses* : ce que la veille a confirmé ou nuancé (hashtags des concurrents, hook visuel, sons signature, chiffres qui marchent).
- `03_LIBRARY/HOOKS.md` : banque de hooks par famille, hashtags par marché, sons observés chez les outliers.
- `01_BRAND/APP_CONTEXT.md` : payoff de l'app, règles d'une unité de contenu valide, seuils du chiffre à montrer.
- `01_BRAND/VOICE.md` : ton, règle de réponse aux commentaires.
