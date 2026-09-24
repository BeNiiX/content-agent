---
id: {{GABARIT_ID}}        # <format abrégé>-<rendu>.<compte>, ex. F02-carrousel.<compte>
format: {{FORMAT}}
rendition: {{RENDITION}}
account: {{ACCOUNT}}
status: "à prototyper"            # à prototyper | pilotes en revue | à retoucher | validé | évolution proposée | non pertinent
version: 0                        # 0 = brouillon ; 1 à la première validation, +1 à chaque évolution validée
validated_at: null
pilots: []                        # EXP-xxx (2 pilotes), deviennent les références une fois validés
validation_note: null             # retouches demandées par l'humain (une par ligne)
created: {{TODAY}}
updated: {{TODAY}}
---

# {{KEY}} · {{ACCOUNT}} — fiche technique

Format : [{{FORMAT}}](../../formats/{{FORMAT_FILE}}) · compte : `{{ACCOUNT}}` (01_BRAND/ACCOUNTS.md) ·
learnings du compte : `08_ACCOUNTS/{{ACCOUNT}}/LEARNINGS.md`.

## Intention

Ce que la créa doit faire ressentir / faire faire au spectateur de ce compte, en 2 phrases.

## Constantes — rendu

| Élément | Règle |
|---|---|
| Ratio, durée / nombre de slides | |
| Police, tailles, couleurs (DA) | |
| Positions (texte natif, cartes) | |
| Voix (moteur, voix, débit) | |
| Son | |

## Constantes — éditorial

| Élément | Règle |
|---|---|
| Structure | |
| Hook (texte natif ligne 1) | famille imposée : … ; ≤ N mots ; exemples validés : … |
| Ligne 2 / mécanique | |
| Caption | |
| CTA | |
| Description / titre à taper | |

## Variables (ce que chaque créa change)

| Variable | Limites |
|---|---|
| Opinions | banque `07_ASSETS/opinions_app.json`, `pct_agree` exact, ICP du compte, … |
| Photo | thème(s) … de `07_ASSETS/photos/`, critères : … |
| Hook | formulation libre dans la famille imposée |

## Contrôles

Checklist avant d'envoyer une créa en validation. Le bloc `checks` est lu par le tableau de bord (contrôles automatiques) :

```json
{ "hook_max_words": 8, "slides": 7, "duration_s": null, "pct_from_bank": true }
```

- [ ] …

## Besoins outil

Règles que les scripts de rendu ne savent pas encore tenir (à ajouter dans `infra/` par une session sur le Mac) : …

## Références

Pilotes validés (et pourquoi ils sont justes) : …

## Historique des versions

- v0 · {{TODAY}} · gabarit créé, fiche à rédiger par l'agent

## Évolution proposée

(vide tant qu'aucune évolution n'est proposée)
