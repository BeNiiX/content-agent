---
name: connexion-tiktok
description: Connecter un compte TikTok créateur au connecteur Higgsfield pour l'envoi de brouillons — étapes humain + agent, multi-comptes, problèmes connus. Le registre des comptes et connecteurs de l'instance vit dans 01_BRAND/ACCOUNTS.md et infra/config/accounts.json.
type: guide
updated: 2026-09-18
---

# Connexion d'un compte TikTok au connecteur Higgsfield

Ce qu'on connecte : le **compte TikTok créateur** (pas TikTok for Business, pas le Business Center).
L'autorisation passe par Login Kit de TikTok, avec l'app auditée de Higgsfield. Sur TikTok, ça apparaît
dans *Paramètres → Sécurité → Applications connectées* comme n'importe quelle app tierce, sans changer le
type de compte.

Registre de l'instance (slug, handle, appareil, `name` Higgsfield, `connector_id`, état, dates de connexion et de test) :
**`01_BRAND/ACCOUNTS.md` § Registre** (lisible) et **`infra/config/accounts.json`** (utilisé par les scripts). Ce fichier-ci
ne contient que la procédure.

## Étapes

1. **L'humain** : sur le téléphone qui porte le compte, ouvrir TikTok et **basculer sur le compte à connecter**
   (sur un navigateur, déconnecter les autres comptes d'abord, sinon c'est le compte ouvert qui sera autorisé).
2. **Agent** : appeler l'outil MCP `tiktok_connect` avec un `name` distinct par compte (ex. `tiktok-main`, `tiktok-en`)
   → renvoie une `authorize_url` valable ~10 minutes. Dire « connecte TikTok » dans Claude Code pour en obtenir une nouvelle.
3. **L'humain** : ouvrir le lien (l'agent le dépose dans un fichier `.txt` facile à transférer sur le téléphone : AirDrop,
   note partagée…), vérifier que le handle affiché est le bon, accepter. Page de confirmation Higgsfield.
4. **Agent** : `tiktok_accounts` → le compte doit être `active`. Reporter le `connector_id` dans `infra/config/accounts.json`
   (clé du slug) et dans le registre de `01_BRAND/ACCOUNTS.md` (avec la date). Le pipeline choisit le connecteur d'après
   le champ `account` de la fiche EXP ; sans connecteur, le job est refusé.

   Sur un appareil qui porte plusieurs comptes, **basculer sur le bon compte dans l'app TikTok avant d'ouvrir le lien** ;
   la page d'autorisation affiche le handle, le vérifier avant d'accepter.

5. **Test à blanc** : envoyer une fiche `prêt` du compte en brouillon (`src/publish/README.md`), vérifier
   dans l'app TikTok que le média apparaît (notification « ton contenu est prêt » / brouillons), que les
   slides sont dans l'ordre, puis le supprimer ou le poster en privé. Noter le résultat dans `01_BRAND/ACCOUNTS.md`.
6. **Comptes suivants (multi-comptes)** : même procédure, un `name` par compte, en étant connecté au bon compte dans le
   navigateur ou sur le téléphone qui ouvre le lien.

## Problèmes connus

- Compte en `error` → `tiktok_reconnect` (token expiré ou révoqué). Vérifier aussi côté TikTok que l'app n'a pas été retirée des applications connectées.
- Le brouillon n'apparaît pas : attendre quelques minutes (`tiktok_publish_status`), vérifier que TikTok n'a pas rejeté le média (PNG, résolution, durée). Le job `data/publish/jobs/<EXP>.json` liste les contrôles faits en amont.
- Deux comptes sur le même téléphone : la notification arrive sur le compte qui a autorisé, pas forcément celui ouvert dans l'app.
- Le lien d'autorisation demande les scopes de l'app Higgsfield (dont `biz.spark.auth`, insights). C'est le périmètre de leur app, pas un passage en compte Business : le type de compte TikTok ne change pas.
- Un carrousel envoyé en `UPLOAD_TO_DRAFT` passe au statut TikTok `SEND_TO_USER_INBOX` en quelques secondes ; l'ordre des slides et la conservation de la caption se vérifient dans l'app (voir `src/publish/README.md` § Champs titre / description).
