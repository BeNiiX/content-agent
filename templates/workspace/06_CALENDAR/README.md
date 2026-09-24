# 06_CALENDAR

- `QUEUE.md` : file de publication par compte (ordre = ordre d'envoi de l'automate du soir).
- `<AAAA-MM>.md` : un fichier par mois, mémo hebdo en tête (SOP_06) + grille des jours.
- `stats/<date>.md` : relevé hebdo généré par `infra/src/accounts/report.js` (jour et heure de `weekly_stats`, timer systemd `content-daily-stats` sur le VPS), à annoter sous le marqueur `notes-agent`.

Modèle de mémo hebdo (≤ 15 lignes) :

```
## Semaine du <date>
**Gagnant** : EXP-xxx (hook…) – 3,2× médiane, 1,4 % partages
**Flop** : EXP-yyy – rétention 3 s à 35 %, hook trop long
**Leçon** : …
**Cette semaine** : EXP-… / EXP-… / EXP-…
**Paid** : CPA 7 j = … € (cible … €) → proposition …
**Besoin de l'humain** : tournages, validations, accès.
```
