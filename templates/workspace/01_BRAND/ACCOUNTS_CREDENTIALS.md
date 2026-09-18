---
name: accounts-credentials
description: Identifiants des comptes (e-mail, mot de passe, numéro, 2FA, récupération). FICHIER SECRET — ignoré par git, ne jamais copier ailleurs, ne jamais coller dans une fiche ou un message.
type: secret
updated: {{DATE}}
---

# Identifiants des comptes

**Ce fichier est dans `.gitignore`** (`01_BRAND/ACCOUNTS_CREDENTIALS.md`). Il ne quitte jamais cette machine ; si le dossier est synchronisé (Drive, iCloud), le remplacer par un pointeur vers le gestionnaire de mots de passe.

L'agent lit ce fichier uniquement pour indiquer quel e-mail / numéro sert à un compte ; il ne recopie jamais un mot de passe dans un autre fichier, un job, un message ou un outil.

<!-- Comment remplir : une ligne par compte, même slug que `ACCOUNTS.md`. -->

| Slug | Handle | E-mail de connexion | Mot de passe | Numéro | 2FA (méthode, où sont les codes de secours) | E-mail de récupération | Appareil | Notes |
|---|---|---|---|---|---|---|---|---|
| `{{ACCOUNT_SLUG}}` | {{HANDLE}} | `null` | `null` | `null` | `null` | `null` | | |

## Hygiène
- Un e-mail distinct par compte (alias `+tiktok-<slug>` acceptés), jamais l'e-mail perso principal.
- Mots de passe uniques, générés ; 2FA activée partout ; codes de secours notés ici ou dans le gestionnaire de mots de passe.
