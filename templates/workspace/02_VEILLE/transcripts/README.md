# Transcripts — générés par `node infra/src/extract.js`

Une fiche par vidéo téléchargée : image d'accroche pleine résolution (`../assets/hooks/<key>.jpg`), timeline du
texte à l'écran (OCR, 1 image/s, position haut/milieu/bas), transcription audio (whisper.cpp ; `audio_suspicious: true` =
musique seule, texte halluciné à ignorer), et « script reconstitué » (textes uniques dans l'ordre d'apparition).

Usage agent : lire le script reconstitué pour écrire une adaptation (SOP_03), lire l'image d'accroche pour rédiger
un prompt de génération (`03_LIBRARY/PROMPTS_IMAGES.md`). Ne jamais réutiliser les images d'origine dans une publication.

```bash
node src/extract.js                 # toutes les vidéos téléchargées, OCR + audio
node src/extract.js --key <key>     # une seule
node src/extract.js --concept CONCEPT-001   # les sources d'un concept
node src/extract.js --no-audio      # OCR seulement (rapide)
```
