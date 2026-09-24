---
name: deploy-vps
description: Runbook du runtime VPS (Ubuntu 24.04) — installation, login Claude Code, clé de déploiement, timers systemd, Caddy, rsync des médias, maintenance — et accueil des agents Claude en cloud (routines)
type: runbook
updated: 2026-09-18
status: rédigé, pas encore exécuté sur un VPS réel (à tester par l'humain)
---

# Déploiement VPS — runtime de l'agent content

Ce dossier rend le dépôt exécutable **ailleurs que sur le Mac** : un VPS Linux devient la machine qui envoie les
brouillons du soir, relève les stats du lundi, rend les carrousels / vidéos que les agents cloud ont spécifiés, et sert
le tableau de bord + les médias derrière HTTPS. Rien ici ne dépend du nom de l'app : `{{APP}}` = le projet décrit dans
`infra/config/project.json` (`name`, `slug`).

Décisions du 18/09/2026 : le Mac n'exécute plus rien en tâche de fond (launchd échouait, Mac pas toujours allumé) ;
pas de Supabase ni de stockage tiers pour les médias (ils vivent sur le VPS, hors git, poussés par `rsync`) ; les
agents cloud (routines Claude Code) travaillent **uniquement via GitHub** et ne voient ni le Mac ni le VPS.

## Architecture

```
            ┌───────────────────────── Mac (l'humain) ─────────────────────────┐
            │ tournage, photos, montage interactif, Claude Code interactif       │
            │ git pull / commit / push          deploy/sync-media.sh (rsync)     │
            └────────────┬───────────────────────────────────┬─────────────────┘
                         │ git (texte, specs, JPEG)           │ rsync (MP4, MOV, rushs, screen-records)
                         ▼                                    │
   ┌──────────── GitHub (dépôt privé) ────────────┐           │
   │ main : 00_AGENT … 08_ACCOUNTS, infra/, deploy/│           │
   └──────┬───────────────────────────────┬────────┘           │
          │ clone à chaque run             │ pull / push (clé de déploiement RW)
          ▼                                ▼                   ▼
 ┌─ Cloud Anthropic : routines ─┐   ┌────────────────── VPS Ubuntu 24.04 (utilisateur content) ──────────────────┐
 │ veille-hebdo   (lundi 09:00)  │   │ /home/content/app = clone du dépôt      +  médias rsyncés (hors git)          │
 │ production-specs (mar/ven)    │   │ timers systemd (Europe/Paris) :                                              │
 │ revue-hebdo    (lundi 10:00)  │   │   content-git-sync        */10 min  commit d'état + pull --rebase + push      │
 │ → specs, fiches EXP, QUEUE,   │   │   content-render-pending  */1 h     specs « à monter » → JPEG / MP4 → « prêt »│
 │   concepts, verdicts, mémos   │   │   content-daily-drafts    18:00     1 brouillon TikTok / compte (Node pur,    │
 │ commit + push sur main        │   │                                     PUBLISH_BACKEND) + message ntfy          │
 │ (pas de médias, pas de secret)│   │   content-weekly-veille   lun 07:00 exports data/raw → yt-dlp → 02_VEILLE/    │
 │                               │   │   content-daily-stats    lun 08:00 yt-dlp → STATS.md, digest, fiches EXP     │
 └───────────────────────────────┘   │   content-auth-check      09:00     session Claude encore valide ?           │
                                     │ services : content-dashboard (127.0.0.1:4747) ← Caddy HTTPS + auth basique   │
                                     │            https://DOMAIN/ (tableau de bord) · /media/07_ASSETS, /media/08_ACCOUNTS │
                                     └──────────────────────────────────────────────────────────────────────────────┘
                                                        │ API TikTok créateur via le fournisseur d'envoi
                                                        ▼
                                                 brouillons TikTok → l'humain finalise dans l'app
```

Division du travail :

| Où | Quoi | Comment ça circule |
|---|---|---|
| **Mac** | tournage, photos (`07_ASSETS/photos`, dans git), montage interactif, édition, `git push`, `deploy/sync-media.sh` après un tournage ou un rendu local | git + rsync |
| **Cloud** (routines) | veille (annotation), concepts, specs + fiches EXP, revue hebdo (verdicts, post-mortems, bibliothèque) | clone GitHub → commit + push sur `main` |
| **VPS** | rendu des specs en attente, envoi du soir 18:00, veille hebdo lundi 07:00 (yt-dlp sur les exports rsyncés), relevé hebdo lundi 08:00, synchro git toutes les 10 min, tableau de bord + médias derrière Caddy | `git pull` / `git push` (clé de déploiement), rsync depuis le Mac (`sync-media.sh`, `--data` pour les exports de veille) |

Fichiers de ce dossier :

| Fichier | Rôle |
|---|---|
| `install.sh` | installation idempotente (paquets, Node 22, yt-dlp, venv Pillow, Claude Code, unités systemd, Caddy) |
| `systemd/content-*.service` / `.timer` | 6 jobs (git-sync, render-pending, daily-drafts, daily-stats, weekly-veille, auth-check) + tableau de bord |
| `Caddyfile`, `caddy.env.example` | HTTPS automatique, auth basique, `/media/*` en lecture, `/` → tableau de bord |
| `git-sync.sh` | commit d'état, `pull --rebase --autostash`, push ; conflit → abandon + notification |
| `sync-media.sh` | **depuis le Mac** : rsync des vidéos vers le VPS (`--from-vps` pour rapatrier les rendus ; `--data` ajoute `infra/data/{raw,tiktok,videos,instagram}` pour la veille) |
| `auth-check.sh` | `claude auth status` chaque matin, notification si la session a expiré |
| `routines/` | prompts auto-suffisants des agents cloud + mode d'emploi `/schedule` |
| `mac.md` | ce qui reste à faire côté Mac (désinstallation launchd, rituel git + rsync) |
| `TODO.md` | changements à faire ailleurs dans le dépôt (autres propriétaires) |
| `../infra/src/produce/render-pending.js` | le rendu des specs en attente (appelé par `content-render-pending`) |

## Pré-requis

- Un VPS **Ubuntu 24.04** (Hetzner CX22 / OVH / Scaleway : 2 vCPU, 4 Go, 40 Go suffisent ; le rendu ffmpeg est le seul
  poste lourd) avec un accès root par clé SSH.
- Un **domaine ou sous-domaine** (ex. `content.mondomaine.fr`) : enregistrement A (et AAAA si IPv6) vers l'IP du VPS.
  Sans DNS, Caddy sert `https://localhost` avec un certificat interne (test seulement).
- Le dépôt sur **GitHub, privé**, branche par défaut `main`, avec `07_ASSETS/photos/*.jpg` et les JPEG des carrousels
  dedans (déjà le cas : seuls `*.mp4`, `*.mov`, `*.wav`, `07_ASSETS/legacy/`, `08_ACCOUNTS/*/work/`, `infra/data/`,
  `infra/.env` sont ignorés — voir `.gitignore`).
- L'abonnement claude.ai de l'humain (Pro / Max) pour les revues headless du VPS (`claude auth login`, étape 4).
  L'envoi du soir, lui, est du Node pur : il n'a besoin d'aucune session Claude.
- Un compte chez le **fournisseur d'envoi des brouillons** (`PUBLISH_BACKEND`, aujourd'hui Post for Me, 10 $/mois) et
  sa clé API (`POSTFORME_API_KEY`) ; chaque compte TikTok autorise l'app du fournisseur une fois
  (`infra/src/publish/CONNEXION_TIKTOK.md`).
- Sur le Mac : `git`, `rsync` (openrsync livré avec macOS suffit), `ssh`.

Estimation : 45 min la première fois, dont 10 d'attente apt.

## Étape 1 — Utilisateur `content` et accès SSH (root)

```bash
ssh root@<IP>
adduser --disabled-password --gecos "content runtime" content
mkdir -p /home/content/.ssh && cp ~/.ssh/authorized_keys /home/content/.ssh/ \
  && chown -R content:content /home/content/.ssh && chmod 700 /home/content/.ssh && chmod 600 /home/content/.ssh/authorized_keys
apt-get update && apt-get install -y git
# pare-feu minimal (Hetzner / OVH ont aussi un pare-feu côté console)
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
```

`content` n'a pas de mot de passe ni de sudo : on y entre par `ssh content@<IP>` (même clé que root) ou `sudo -iu content`
depuis root. Tous les jobs tournent sous cet utilisateur ; root ne sert qu'à `install.sh` et à systemd.

## Étape 2 — Clé de déploiement (lecture-écriture) et clone

Le VPS pousse ses propres commits (`chore(vps): état du …` : fiches EXP passées en `brouillon envoyé` / `prêt`, STATS.md,
digests, JPEG rendus). Il lui faut donc une clé **avec écriture**.

```bash
sudo -iu content
ssh-keygen -t ed25519 -N "" -C "content-vps-{{APP}}" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub        # → GitHub : dépôt → Settings → Deploy keys → Add deploy key → cocher "Allow write access"
printf 'Host github.com\n  IdentityFile ~/.ssh/id_ed25519\n  IdentitiesOnly yes\n' >> ~/.ssh/config
ssh -T git@github.com            # "Hi <owner>/<repo>! You've successfully authenticated" (le dépôt, pas un utilisateur)
git clone git@github.com:<owner>/<repo>.git ~/app
```

Identité des commits du VPS — **utiliser le nom et l'e-mail du compte GitHub de l'humain** (ou son adresse
`<id>+<login>@users.noreply.github.com`). Ce n'est pas cosmétique : les routines cloud refusent de pousser sur une branche
« portant des commits d'un autre auteur » ; avec la même identité, `main` reste poussable par tout le monde.

```bash
git config --global user.name "<nom du compte GitHub>"
git config --global user.email "<e-mail du compte GitHub>"
```

Alternative si un jour la clé de déploiement ne suffit plus (plusieurs dépôts) : un compte machine GitHub invité en
collaborateur, ou un *fine-grained personal access token* (Contents: read/write) avec `https://` + credential helper.

## Étape 3 — `install.sh`

```bash
exit          # retour root
GIT_USER_NAME="<nom GitHub>" GIT_USER_EMAIL="<e-mail GitHub>" bash /home/content/app/deploy/install.sh
```

Ce que fait le script (relançable à volonté ; `APP_USER`, `APP_DIR`, `TIMEZONE`, `INSTALL_WHISPER=1`, `SKIP_CADDY=1`,
`SKIP_CLAUDE=1` en variables) :

1. utilisateur `content` (créé si absent), `chmod 750` du home (Caddy y lit les médias via le groupe) ;
2. paquets : `git rsync ffmpeg python3-venv flock fonts-dejavu-core …`, fuseau système `Europe/Paris` ;
3. **Node 22** via NodeSource (`/usr/bin/node`) — aucune dépendance npm, donc pas de `npm install` ;
4. **yt-dlp** : binaire autonome dans `/usr/local/bin` (mise à jour : `sudo yt-dlp -U`) ;
5. **venv** `infra/.venv` + Pillow (les polices sont dans `infra/fonts/`, rien à installer) ; `INSTALL_WHISPER=1` ajoute
   `openai-whisper` (≈ 2 Go avec torch) pour `src/transcribe.js` — voir « Ce qui ne marche pas sous Linux » ;
6. dossiers `infra/data/**`, `.env` copié depuis `.env.example` s'il manque, identité git, `core.fileMode false` ;
7. **Claude Code CLI** par l'installateur natif documenté (https://code.claude.com/docs/en/setup) :
   `curl -fsSL https://claude.ai/install.sh | bash` → `~/.local/bin/claude`, mises à jour automatiques en arrière-plan ;
8. unités **systemd** copiées depuis `deploy/systemd/` (avec substitution de `/home/content/app` si `APP_DIR` change),
   `daemon-reload`, timers activés, tableau de bord démarré ;
9. **Caddy** depuis le dépôt officiel (cloudsmith), drop-in `EnvironmentFile=/etc/caddy/env`, `/etc/caddy/env` généré
   avec un **mot de passe aléatoire affiché une seule fois** (utilisateur `DASH_USER` de `caddy.env.example`, `admin` par défaut), `DOMAIN=localhost` tant que le
   DNS n'est pas renseigné, Caddyfile validé puis Caddy redémarré.

## Étape 4 — `claude auth login` sur le VPS (flux sans navigateur)

Le VPS n'a pas de navigateur : la connexion se termine sur le Mac.

```bash
sudo -iu content
cd ~/app/infra
claude auth login          # (ou simplement `claude`, puis /login)
```

1. La commande affiche une **URL** (`https://claude.ai/oauth/authorize?…`) — si l'écran propose « press c to copy », l'URL
   est aussi copiée dans le presse-papier de la session SSH. **L'ouvrir dans le navigateur du Mac**, connecté au compte
   claude.ai de l'humain.
2. Comme le navigateur ne peut pas joindre le serveur de rappel local du VPS, la page finit sur un **code**. Le coller dans
   le terminal à l'invite `Paste code here if prompted`.
3. `Login successful`. Les identifiants sont dans `~/.claude/.credentials.json` (mode 0600) et se **rafraîchissent
   seuls** tant que la session est valide.

Puis, **une fois, en interactif** dans `~/app/infra` : lancer `claude` et accepter la question de confiance du dossier.
Quitter avec `/exit`.

À quoi sert cette session : aux **revues headless** (`daily-stats.sh` avec `WEEKLY_CLAUDE=1`, dépannage). **L'envoi du
soir n'en a pas besoin** : c'est du Node pur qui appelle l'API du fournisseur (`PUBLISH_BACKEND`). Ne jamais définir
`ANTHROPIC_API_KEY` dans `.env` sur le VPS : elle prendrait le pas sur la session claude.ai et ferait facturer l'usage.
Vérifier à tout moment : `claude auth status` (code 0 = connecté) ou `/status` en session.

Expiration : Claude Code prévient 3 jours avant (`Your login expires in 3 days · run /login to renew`) — mais un job
headless ne le voit pas. D'où `content-auth-check.timer` (09:00) : si `claude auth status` échoue, une notification
(ntfy / Telegram selon `.env`) demande de refaire `claude auth login`. Après un `/logout` ou un changement
de mot de passe claude.ai, refaire la procédure.

Options utiles dans `~/.claude/settings.json` de l'utilisateur `content` :

```json
{ "autoUpdatesChannel": "stable" }
```

(canal stable ≈ une semaine de retard, évite les régressions sur une machine sans surveillance).

## Étape 5 — `infra/.env`

`nano ~/app/infra/.env` (fichier hors git, jamais poussé). Renseigner au minimum :

| Variable | Valeur |
|---|---|
| `NOTIFY_CHANNEL` / `NTFY_TOPIC` | `ntfy` + le sujet secret de l'app iPhone (ou `telegram` + `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`). `imessage` n'existe pas sous Linux. |
| `PUBLISH_BACKEND` / `POSTFORME_API_KEY` | `postforme` + la clé API du fournisseur d'envoi (obligatoire, sinon aucun brouillon ne part) |
| `DAILY_ACCOUNTS`, `DAILY_DRY_RUN` | vides en production ; `DAILY_DRY_RUN=1` le temps des tests |
| `YTDLP_COOKIES_FROM_BROWSER` | **vide** (pas de navigateur sur le VPS) |
| `VPS_HOST`, `VPS_USER`, `VPS_PATH` | inutiles sur le VPS ; ce sont les lignes que **le Mac** lit pour `sync-media.sh` (à mettre dans le `.env` du Mac) |

Règle de syntaxe : ce fichier est aussi lu par systemd (`EnvironmentFile=`) → une valeur contenant des espaces ou un `#`
doit être entre guillemets doubles ; pas de `export`, pas de `$VAR`. Test : `node src/publish/daily-notify.js --test`.

## Étape 6 — Premier `rsync` des médias depuis le Mac

Sur le Mac, dans `infra/.env` (celui du Mac) : `VPS_HOST=<IP ou domaine>` (et `VPS_SSH_PORT` si ≠ 22). Puis :

```bash
deploy/sync-media.sh --dry-run     # liste : 07_ASSETS/screen-records (≈ 80 Mo), 07_ASSETS/rushes (≈ 250 Mo), MP4 des posts (≈ 60 Mo)
deploy/sync-media.sh               # envoi (jamais 07_ASSETS/legacy : 8 Go hors périmètre ; jamais work/ ni specs/)
```

Pas de `--delete` par défaut : le VPS produit aussi des MP4 (rendus) qui n'existent pas encore sur le Mac ; un `--delete`
Mac → VPS les effacerait. Le sens inverse : `deploy/sync-media.sh --from-vps` rapatrie les rendus du VPS (les JPEG des
carrousels et les fiches EXP, eux, arrivent par `git pull`). `--data` ajoute `infra/data/{raw,tiktok,videos,instagram}`
(exports TikTok + JSON yt-dlp) si l'on veut lancer la veille (`npm run sync`) sur le VPS.

## Étape 7 — Caddy : domaine, HTTPS, authentification

> **VPS déjà équipé de nginx + certbot** (ports 80/443 pris) : lancer `install.sh` avec `SKIP_CADDY=1` et utiliser
> `deploy/nginx/content.conf.example` (reverse proxy simple ; l'authentification est le formulaire de connexion de l'application, `DASHBOARD_USER` / `DASHBOARD_PASSWORD` dans `infra/.env`), voir les commandes en tête de ce fichier.
> Sans DNS, le tableau de bord reste accessible par tunnel SSH : `ssh -N -L 4747:127.0.0.1:4747 content@<vps>`.


```bash
sudo nano /etc/caddy/env            # DOMAIN=content.mondomaine.fr  (A/AAAA déjà pointés) ; DASH_USER / DASH_HASH générés par install.sh
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile --envfile /etc/caddy/env
sudo systemctl restart caddy && sudo journalctl -u caddy -n 20     # "certificate obtained successfully"
```

| URL | Sert | Auth |
|---|---|---|
| `https://DOMAIN/` | tableau de bord (`127.0.0.1:4747`, `npm run dashboard` équivalent) | basique (`DASH_USER` / mot de passe) |
| `https://DOMAIN/media/07_ASSETS/…` | fichiers de `07_ASSETS` (photos, screen-records, rushs ; `legacy/` et `_backup…` masqués), listing de dossier, Range OK | basique |
| `https://DOMAIN/media/08_ACCOUNTS/…` | `08_ACCOUNTS/*/posts/**` etc. (`work/` masqué) | basique |
| `https://DOMAIN/media/02_VEILLE/…`, `/media/01_BRAND/…` | via le tableau de bord (qui restreint lui-même à `02_VEILLE/assets`, `01_BRAND/DA`) | basique |
| `https://DOMAIN/public-media/<MEDIA_TOKEN>/07_ASSETS|08_ACCOUNTS/…` | **désactivé** (`MEDIA_PUBLIC=false`) | aucune |

Changer le mot de passe : `caddy hash-password --plaintext 'nouveau'` → `DASH_HASH=` dans `/etc/caddy/env` →
`sudo systemctl restart caddy`. Ajouter un utilisateur : dupliquer la ligne dans le bloc `basic_auth` du Caddyfile.

**Médias publics — à n'activer que si nécessaire.** Les photos ne sont pas publiques : `/media/` reste derrière
l'authentification. Si un outil externe doit un jour *télécharger* un fichier depuis une URL sans mot de passe (un
fournisseur qui exige une URL publique plutôt que l'upload direct utilisé aujourd'hui), mettre
`MEDIA_PUBLIC=true` et `MEDIA_TOKEN=$(openssl rand -hex 24)` dans `/etc/caddy/env`, redémarrer Caddy, et l'URL devient
`https://DOMAIN/public-media/<token>/08_ACCOUNTS/<compte>/posts/<fichier>`. Tout ce qui n'est pas sous `07_ASSETS` /
`08_ACCOUNTS`, les dossiers `work/` et les fichiers cachés restent en 404, jeton ou pas. Régénérer le jeton après usage.

Le Caddyfile a été validé et testé localement (auth 401/200, `work/` 404, traversée `../` 404, route publique 401 quand
désactivée, 200 avec le bon jeton, 401 avec un mauvais) — voir le rapport du 18/09.

## Étape 8 — Vérifications

```bash
sudo -iu content
cd ~/app/infra
node src/doctor.js                                   # yt-dlp, ffmpeg, .env, données
node src/produce/render-pending.js --dry-run         # "N spec(s) lue(s) · 0 à rendre" (tout est rendu) ou la liste des assets manquants (rsync)
bash scripts/daily-drafts.sh --dry-run               # plan du soir + message de consignes (TEST) sur le téléphone, sans envoi
node src/publish/daily-notify.js --test "VPS ok"     # canal de notification
claude auth status --text                            # session
exit
systemctl list-timers 'content-*'                    # prochaines exécutions (NEXT en heure locale du VPS, LEFT en durée)
systemctl status content-dashboard caddy             # actifs
curl -u admin:<mdp> -sI https://DOMAIN/ | head -1    # HTTP/2 200 (utilisateur DASH_USER)
journalctl -u content-git-sync -n 20                 # "rien à committer" / "push ok"
```

Premier envoi réel : attendre 18:00, ou `sudo systemctl start content-daily-drafts` puis
`journalctl -u content-daily-drafts -f` et `cat ~content/app/infra/data/publish/daily/$(date +%F).log`. Idempotent :
une relance le même jour ne renvoie pas sur un compte déjà servi.

## Timers, heures, fuseau

| Unité | Quand (Europe/Paris) | Fait | Verrou | Rattrapage si éteint |
|---|---|---|---|---|
| `content-git-sync` | toutes les 10 min | `deploy/git-sync.sh` | attend ≤ 2 min | non |
| `content-render-pending` | chaque heure à :05 | pull, `render-pending.js --limit 20`, push | oui | non |
| `content-daily-drafts` | **`daily_hour`:`daily_minute`** de `project.json` (timer toutes les 5 min + garde `src/publish/due.js`) | garde, pull, `scripts/daily-drafts.sh`, push | oui | **non** (fenêtre de 20 min, pas d'envoi à 3 h du matin) |
| `content-weekly-veille` | **lundi 06:00** (`weekly_veille`) | pull, `scripts/weekly-veille.sh --limit 60` (exports de `infra/data/raw/` → yt-dlp → `02_VEILLE/`), push | oui | oui |
| `content-daily-stats` | **lundi 08:00** | pull, `scripts/daily-stats.sh`, push | oui | oui |
| `content-auth-check` | 09:00 | `deploy/auth-check.sh` | — | oui |
| `content-dashboard` | service permanent | `node src/dashboard/server.js --no-open --port 4747`, `Restart=always` | — | — |

**Fuseau.** Un timer systemd n'a pas de champ `Timezone`, mais `OnCalendar` accepte un suffixe de fuseau IANA depuis
systemd 243 (Ubuntu 24.04 : systemd 255) : `OnCalendar=*-*-* 18:00:00 Europe/Paris`. C'est ce choix qui est fait :
l'heure d'été / d'hiver est gérée par systemd, quel que soit le fuseau de l'horloge système (les VPS sont livrés en
UTC ; `install.sh` met en plus le système en `Europe/Paris` pour que `date`, `journalctl` et les journaux des scripts
soient lisibles). Les services portent `Environment=TZ=Europe/Paris` pour les mêmes raisons (`date +%F` des scripts).
Vérifier une expression : `systemd-analyze calendar "*-*-* 18:00:00 Europe/Paris"` (affiche la prochaine occurrence en
local et en UTC). Alternative non retenue : `OnCalendar=*-*-* 16:00:00 UTC` — juste en été, faux d'une heure en hiver.

**Source des heures.** `install.sh` lit `infra/config/project.json` (`timezone`, `daily_hour`, `stats_hour`, `weekly_veille.weekday`
/ `.hour` ; 1 = lundi ; la veille hebdo prend le même jour, une heure avant) et réécrit les lignes `OnCalendar=` et `TZ=` des unités en les copiant dans `/etc/systemd/system/` :
changer l'heure du relevé ou de la veille = modifier `project.json`, commit, puis `sudo bash deploy/install.sh`
sur le VPS. **L'envoi du soir fait exception** : son timer tourne toutes les 5 min et la garde `infra/src/publish/due.js`
(`ExecCondition=`) lit `daily_hour`, `daily_minute` et `daily_enabled` à chaque passage, donc l'heure se change depuis le tableau de bord
(onglet Agent) sans root ni réinstallation ; un seul départ par jour (tampon `infra/data/scheduler/daily-drafts-<date>`). Sans `project.json`, les valeurs des fichiers `deploy/systemd/*.timer` s'appliquent (18:00, lundi 08:00,
Europe/Paris).

**Changer une heure** ponctuellement sans toucher au dépôt : `sudo systemctl edit content-daily-drafts.timer` puis

```ini
[Timer]
OnCalendar=
OnCalendar=*-*-* 19:30:00 Europe/Paris
```

(`sudo systemctl daemon-reload` est implicite avec `edit` ; le drop-in survit aux relances d'`install.sh`). Lancer un job hors horaire :
`sudo systemctl start content-render-pending` (sans `.timer`).

**Concurrence.** Les cinq jobs partagent un verrou (`flock` sur `infra/data/content.lock`) : un rendu ne commence pas
pendant l'envoi du soir, git-sync attend ou passe son tour. Le tableau de bord peut lancer les mêmes scripts (bouton
« Envoyer les brouillons maintenant ») hors verrou : `daily-plan.js` étant idempotent, un doublon ne renvoie rien deux fois.

## Flux git : qui écrit quoi, conflits

| Auteur | Fichiers | Direction |
|---|---|---|
| Mac | tout (édition interactive, photos, specs, fiches) | `git push` |
| Routines cloud | `02_VEILLE/` (annotations), `03_LIBRARY/`, `04_EXPERIMENTS/`, `06_CALENDAR/`, `08_ACCOUNTS/*/specs/`, `08_ACCOUNTS/*/POSTS.md` | clone → commit → push sur `main` (ou branche `claude/…`, voir `routines/README.md`) |
| VPS (`git-sync.sh`) | `04_EXPERIMENTS/*.md` (statuts), `06_CALENDAR/` (QUEUE, digests stats), `08_ACCOUNTS/*/STATS.md`, `POSTS.md`, `TEXTES.md`, `08_ACCOUNTS/*/posts/**/*.jpg` (carrousels rendus), `infra/config/accounts.json` (interrupteurs du tableau de bord), `02_VEILLE/`, `01_BRAND/ACCOUNTS.md` | commit `chore(vps): état du <date>` + push |

`git-sync.sh` : commit local des seuls chemins ci-dessus → `git pull --rebase --autostash` → `git push` (un second essai
après rebase si quelqu'un a poussé entre-temps). **Jamais `--force`.** En cas de conflit : `git rebase --abort`, le commit
local est conservé, une notification part (au plus une toutes les 6 h), le job sort en erreur et réessaie 10 min plus
tard. Résolution à la main :

```bash
sudo -iu content; cd ~/app
git status; git pull --rebase          # résoudre les <<<<<<< dans les fichiers
git add <fichiers> && git rebase --continue && git push
```

Les conflits sont rares par construction : le VPS ne modifie que des champs de frontmatter (`status`, `draft_sent_at`,
`metrics_d7`) et des fichiers générés ; les routines cloud créent des fichiers nouveaux et n'éditent `QUEUE.md` /
`LOG.md` qu'en **ajoutant des lignes**. Si un fichier est disputé en permanence, le mettre dans un seul camp.

Testé localement le 18/09 sur un dépôt factice : commit + push, pull d'un commit externe sans conflit, conflit →
abandon + sortie 1, relance sans double notification.

## Rendu des specs sur le VPS

`content-render-pending` lance `node src/produce/render-pending.js --limit 20` chaque heure :

- parcourt `08_ACCOUNTS/*/specs/**/*.json` ; pour chaque spec, choisit l'outil d'après `format` / `rendition` / extension de
  `out` : FORMAT-01 → `pov.js --raw` (pas de voix `say` sous Linux : le rendu brut est de toute façon celui qu'on publie,
  bulles et TTS étant ajoutés dans TikTok) ; FORMAT-02 carrousel → `carousel.py` ; FORMAT-02 vidéo → `series-video.py` ;
  FORMAT-03 → `pie-video.py` ;
- rend si la sortie manque / est incomplète, ou si le **contenu de la spec a changé** depuis le dernier rendu (empreinte
  dans `infra/data/render/state.json` ; git ne conservant pas les dates de fichiers, la comparaison de dates n'est pas
  utilisée par défaut — `--mtime` l'ajoute, `--force` rend tout) ; au premier passage, une sortie déjà présente est
  adoptée sans re-rendu ;
- un asset source absent (screen-record ou rush pas encore rsyncé) est signalé et la spec attend le prochain passage ;
- après un rendu réussi, la fiche `04_EXPERIMENTS/EXP-xxx.md` dont `media_file` = la sortie et `status: à monter` passe
  en `status: prêt` (et la ligne `QUEUE.md`), ce qui la rend éligible à l'envoi du soir. C'est le contrat avec les
  routines cloud : elles créent spec + fiche **`à monter`**, le VPS livre le `prêt` ;
- journal : `infra/data/render/<date>.log` + `journalctl -u content-render-pending`.

Test à blanc : `node src/produce/render-pending.js --dry-run [--account <slug>] [--format F02]`. Sur le dépôt du 18/09 :
« 74 spec(s) lue(s) · 0 à rendre · 74 sortie(s) adoptée(s) ».

## Abonnement, pas de facturation

La session du VPS est ouverte par `claude auth login` (compte claude.ai, plan Max) : les appels headless (revues) sont décomptés des limites de l'abonnement, comme une session interactive, et **rien n'est facturé à l'usage**. Le `total_cost_usd` affiché par `claude -p --output-format json` est un équivalent au tarif API, informatif (`costBasis: list`). Ne jamais définir `ANTHROPIC_API_KEY` (ni `CLAUDE_CODE_OAUTH_TOKEN` issu d'une clé) sur le serveur : `node src/doctor.js` le signale. L'envoi du soir, lui, ne consomme aucun jeton : son seul coût est l'abonnement au fournisseur d'envoi.

## Maintenance

| Quoi | Commande |
|---|---|
| Mettre à jour Claude Code | automatique (installateur natif) ; forcer : `sudo -iu content claude update` ; diagnostic : `claude doctor` |
| Session expirée | notification du matin → `sudo -iu content claude auth login` (étape 4) |
| yt-dlp (TikTok change souvent) | `sudo yt-dlp -U` (mensuel, ou dès que `daily-stats` remonte des erreurs) |
| Système | `sudo apt update && sudo apt upgrade` ; `sudo reboot` si noyau (les timers reprennent seuls) |
| Dépôt / unités modifiés | `sudo bash /home/content/app/deploy/install.sh` (recopie les unités, valide Caddy) |
| Journaux | `journalctl -u content-daily-drafts -n 100`, `-u content-render-pending`, `-u content-git-sync`, `-u caddy` ; scripts : `infra/data/publish/daily/<date>.log`, `data/accounts/weekly.log`, `data/render/<date>.log` |
| Espace disque | `df -h /` ; `du -sh ~content/app/08_ACCOUNTS ~content/app/07_ASSETS ~content/app/infra/data` ; purger `infra/data/media` (vidéos de veille, analyse seulement) et `data/dashboard/runs` |
| Sauvegarde | le texte est dans GitHub ; les médias existent sur le Mac **et** le VPS (deux copies) ; `infra/.env` et `/etc/caddy/env` sont à noter dans le gestionnaire de mots de passe |
| Pause d'un compte | tableau de bord → interrupteurs (`paused` / `production_paused` dans `infra/config/accounts.json`, poussés par git-sync) |
| Tout arrêter | `sudo systemctl disable --now 'content-*.timer'` ; redémarrer : `install.sh` |

## Ce qui ne marche pas (ou pas pareil) sous Linux

| Élément | État sur le VPS | Quoi faire |
|---|---|---|
| `say` (voix macOS) dans `pov.js` | absent | `render-pending` appelle `pov.js --raw` (sans bulles ni voix) : c'est la version publiée. Le montage « avec voix » reste une opération Mac. |
| `bin/ocr` (Vision) et `whisper-cpp` + `models/ggml-small.bin` dans `src/extract.js` | absents | `extract.js` dégrade proprement (image d'accroche seule, avertissement) ; l'OCR et la transcription restent une étape **Mac**. `src/transcribe.js` fonctionne avec `INSTALL_WHISPER=1` (`pip install openai-whisper`). |
| `NOTIFY_CHANNEL=imessage` (osascript) | impossible | `ntfy` (recommandé) ou `telegram` |
| `open -R` (bouton « révéler » du tableau de bord) | macOS | bouton masqué hors macOS ; l'API répond « non disponible sur ce système » |
| `YTDLP_COOKIES_FROM_BROWSER` | pas de navigateur | laisser vide. Si TikTok bloque l'IP du VPS (`pull.js` / `enrich.js` en erreur « profil illisible »), lancer la veille depuis le Mac et pousser `02_VEILLE/` par git, ou tester `--cookies` avec un export de cookies (non câblé aujourd'hui, voir « à corriger »). |
| Onglet « Ce soir » du tableau de bord | lit **systemd** sous Linux (`list-timers`, `is-active`, `show -p ExecMainStatus`) et launchd sous macOS | rien à faire ; `systemctl list-timers 'content-*'` reste la référence. |

`scripts/daily-drafts.sh` et `scripts/daily-stats.sh` ont été relus : bash, `date +%F`, `sed`, `grep`, `node`, `claude`
uniquement ; le `/opt/homebrew/bin` dans leur PATH est sans effet sous Linux. Ils tournent tels quels.

## À corriger (autres propriétaires) → `deploy/TODO.md`

Résumé de ce qui reste ouvert : `daily-plan.js` date UTC vs locale, option `--cookies` fichier pour yt-dlp, bouton « rendre les
specs » du tableau de bord, Git LFS pour les JPEG. Faits : `extract.js` dégrade sans `bin/ocr`, `reveal()` gardé par
`darwin`, tableau de bord systemd, `infra/README.md` / SOP / MISSION alignés sur le VPS, statut `à monter`, veille sur le VPS
(`content-weekly-veille`).

## Ce qui reste sur le Mac → `deploy/mac.md`

`git pull` avant de travailler, `deploy/sync-media.sh` après un tournage / rendu local (`--data` après un export TikTok),
désinstallation des deux jobs launchd (commandes dans `mac.md`), `extract.js` / OCR / whisper, montage POV avec voix.

## Dépannage

| Symptôme | Cause probable | Remède |
|---|---|---|
| `PUBLISH_BACKEND absent de .env` dans `daily/<date>.log` | fournisseur d'envoi non configuré | renseigner `PUBLISH_BACKEND` + `<BACKEND>_API_KEY` dans `infra/.env` (étape 5) |
| `aucun compte du plan n'a de <backend>_account_id` | comptes TikTok pas encore autorisés chez le fournisseur | `node src/publish/daily-send.js --connect-url <slug>` puis `--accounts` (`infra/src/publish/CONNEXION_TIKTOK.md`) |
| le post est soumis mais reste « en traitement » après 25 min | file du fournisseur lente ou média refusé par TikTok | `node src/publish/daily-send.js --probe`, vérifier le média (PNG, résolution, durée), relancer le lendemain |
| `git-sync` : « conflit git au rebase » | même fichier modifié des deux côtés | résoudre à la main (§ Flux git) |
| `git-sync` : « push impossible » | clé de déploiement sans écriture, branche protégée | Deploy key → Allow write access ; retirer la protection de `main` ou faire pousser les routines sur `claude/…` |
| `render-pending` : « asset manquant » | screen-record / rush pas rsyncé | `deploy/sync-media.sh` depuis le Mac |
| Caddy ne démarre pas | `DOMAIN` vide, `DASH_HASH` vide, DNS pas encore propagé | `caddy validate … --envfile /etc/caddy/env` ; `DOMAIN=localhost` en attendant |
| `daily-stats` / `weekly-veille` : « profil illisible (blocage ?) », erreurs yt-dlp | TikTok filtre l'IP du VPS | relancer plus tard ; sinon veille depuis le Mac (`npm run sync` + `git push` de `02_VEILLE/`) |
| `weekly-veille` : « aucun export dans data/raw/tiktok/ » | exports pas rsyncés | `deploy/sync-media.sh --data` depuis le Mac (l'enrichissement des items déjà importés tourne quand même) |
| timer « n/a » dans `list-timers` | unité désactivée | `sudo systemctl enable --now content-x.timer` |
