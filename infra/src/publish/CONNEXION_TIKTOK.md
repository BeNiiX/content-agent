---
name: connexion-tiktok
description: Relier un compte TikTok créateur au fournisseur d'envoi des brouillons (PUBLISH_BACKEND) — étapes humain + agent, multi-comptes, problèmes connus. Le registre des comptes vit dans 01_BRAND/ACCOUNTS.md et infra/config/accounts.json.
type: guide
updated: 2026-09-21
---

# Connexion d'un compte TikTok au fournisseur d'envoi

Ce qu'on connecte : le **compte TikTok créateur** (pas TikTok for Business, pas le Business Center).
L'autorisation passe par Login Kit de TikTok, avec l'app développeur du fournisseur (`PUBLISH_BACKEND`,
aujourd'hui Post for Me). Sur TikTok, ça apparaît dans *Paramètres → Sécurité → Applications connectées*
comme n'importe quelle app tierce, sans changer le type de compte.

Registre de l'instance (slug, handle, appareil, identifiant chez le fournisseur, état, dates de connexion et de
test) : **`01_BRAND/ACCOUNTS.md` § Registre** (lisible) et **`infra/config/accounts.json`** (utilisé par les
scripts). Ce fichier-ci ne contient que la procédure.

## Étapes

1. **L'humain** : sur le téléphone qui porte le compte, ouvrir TikTok et **basculer sur le compte à connecter**
   (sur un navigateur, déconnecter les autres comptes d'abord, sinon c'est le compte ouvert qui sera autorisé).
2. **Agent** : `node src/publish/daily-send.js --connect-url <slug>` → affiche un lien d'autorisation TikTok
   (le slug est passé en `external_id` chez le fournisseur, pour s'y retrouver).
3. **L'humain** : ouvrir le lien **depuis l'appareil qui porte le compte** (l'agent le dépose dans un fichier
   `.txt` facile à transférer : AirDrop, note partagée…), vérifier que le handle affiché est le bon, accepter.
4. **Agent** : `node src/publish/daily-send.js --accounts` → liste les comptes connus du fournisseur avec leur
   `id` et le slug deviné ; reporter l'identifiant dans `infra/config/accounts.json`
   (`<backend>_account_id`, ex. `postforme_account_id`, + `<backend>_connected_at`) et dans le registre de
   `01_BRAND/ACCOUNTS.md` (avec la date). Le pipeline choisit le compte d'après le champ `account` de la fiche
   EXP ; sans identifiant, le job est refusé et le compte est ignoré par le plan du soir.

   ⚠️ **Identifier les comptes par leur flux réel, pas par le lien** : sur un appareil qui porte plusieurs
   comptes, le lien autorise le compte ouvert dans l'app, pas celui qu'on croit. Le 21/09/2026, des liens avaient
   été ouverts depuis les mauvais comptes (sans conséquence, mais les identifiants étaient croisés). Vérifier le
   handle réellement rattaché à chaque `id` avant de l'écrire (Post for Me : flux
   `/v1/social-account-feeds/<id>`), et basculer sur le bon compte dans l'app TikTok **avant** d'ouvrir le lien.

   ⚠️ **Ne jamais journaliser la réponse complète de l'API** : elle contient les jetons TikTok du compte.
   `--probe` et `--accounts` n'affichent qu'un extrait ; ne pas coller une réponse brute dans un fichier suivi.

5. **Test à blanc** : envoyer une fiche `prêt` du compte en brouillon
   (`node src/publish/daily-send.js --exp EXP-0xx`, voir `README.md`), vérifier dans l'app TikTok que le média
   apparaît (notification « ton contenu est prêt » / brouillons), que les slides sont dans l'ordre, puis le
   supprimer ou le poster en privé. Noter le résultat dans `01_BRAND/ACCOUNTS.md`.
6. **Comptes suivants (multi-comptes)** : même procédure, un lien par compte, en étant connecté au bon compte
   dans le navigateur ou sur le téléphone qui ouvre le lien.

## Problèmes connus

- Compte en erreur chez le fournisseur (jeton expiré ou révoqué) → refaire `--connect-url <slug>`. Vérifier aussi côté TikTok que l'app n'a pas été retirée des applications connectées.
- Le brouillon n'apparaît pas : la livraison prend 5 à 20 min (file du fournisseur), puis vérifier que TikTok n'a pas rejeté le média (PNG, résolution, durée). Le job `data/publish/jobs/<EXP>.json` liste les contrôles faits en amont.
- Deux comptes sur le même téléphone : la notification arrive sur le compte qui a autorisé, pas forcément celui ouvert dans l'app.
- Le lien d'autorisation demande les scopes de l'app du fournisseur (dont des scopes d'insights). C'est le périmètre de leur app, pas un passage en compte Business : le type de compte TikTok ne change pas.
- Un carrousel envoyé en brouillon passe au statut TikTok `SEND_TO_USER_INBOX` ; l'ordre des slides et la conservation de la caption se vérifient dans l'app (voir `README.md` § Champs titre / description).
