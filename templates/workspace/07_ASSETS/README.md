# 07_ASSETS — assets de création partagés

Tout ce qui sert à produire, pour **tous** les comptes. L'agent pioche ici à tout moment ; rien ici n'est propre à un compte (la propriété d'un contenu se décide au moment du spec, via `account` / `angle` / `da`).

```
photos/<thème>/        photos classées par ce qu'elles représentent (une situation de 01_BRAND/AUDIENCE.md par dossier)   → PHOTOS.md
                       nom = <thème>-<situation>-<précision>.jpg (la provenance réelle / IA n'est pas un critère de rangement)
photos/_inbox/         boîte de dépôt en vrac, triée par l'agent (photos/_inbox/README.md)
photos/_backup-fichiers-origine/   fichiers d'origine (PNG / HEIC) non renommés — sauvegarde, pas une catégorie (hors git)
screen-records/<thème>/   enregistrements d'écran de l'app par thème                                             → SCREENS.md
items.json             banque de {{ITEM_PLURAL}} : texte, thème, icp, résultat, temps de coupe dans l'enregistrement
rushes/                rushs de réaction à visage (réutilisables sur plusieurs vidéos) : reaction-<qui>-<lieu>-<fichier>.MOV
legacy/                productions antérieures au projet (hors git)
```

Règles : ranger et nommer par **ce que ça représente** (thème / cible / situation), jamais par la source ni par la date seule ; mettre à jour le catalogue à chaque ajout. Pour une production d'un compte, l'agent cherche uniquement dans les thèmes autorisés pour ce compte (`01_BRAND/ACCOUNTS.md`).

## `items.json` — banque de {{ITEM_PLURAL}}

Généralisation de la banque de l'instance d'origine. Chaque app définit la **sémantique** de ses champs numériques ; le schéma reste le même pour que les scripts (carrousels, vidéos série, camemberts) fonctionnent.

| Champ | Type | Sens |
|---|---|---|
| `id` | string | identifiant stable (`<rec>-<nn>`), référencé par les specs et les fiches EXP (`items`) |
| `text` | string | le texte de l'unité de contenu tel qu'affiché dans l'app |
| `theme` | string | thème de l'app |
| `icp` | string | compte cible (`icp` de `accounts.json`) : ne jamais mélanger |
| `pct` | number \| null | **chiffre brut affiché par l'écran résultat**. Sa sémantique est propre à chaque app : dans l'instance d'origine, il était *relatif au vote du joueur* (« x % pensent comme toi ») et ne pouvait pas être affiché tel quel |
| `pct_agree` | number \| null | **le chiffre à afficher** dans les cartes, camemberts et captions (dans l'instance d'origine : % d'accord avec l'énoncé = `pct` si `vote` positif, `100 − pct` sinon). Définir la règle de calcul dans `_doc` |
| `vote` | string \| null | le choix du joueur dans l'enregistrement (libellé de `project.json → vocabulary`) |
| `rec` | string | clé de l'enregistrement d'écran dans `recordings` |
| `from`, `to` | number | temps (s) dans l'enregistrement : carte → fin du résultat, 0,2 s avant la transition |
| `excluded` | string \| absent | raison d'exclusion (sujet interdit) : jamais utilisé en production |
| `skipped` | boolean \| absent | pas de résultat (passé) |
| `verdict`, `player`, `note` | optionnels | libellé du résultat, prénom du joueur, remarque |
