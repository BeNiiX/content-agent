// Créas vidéo en deux versions (une seule créa, une seule fiche EXP) : la version brute (`out` de la spec, = media_file)
// et la version avec voix générée, rendue à côté sous le nom <nom>.voix.mp4. L'humain choisit à la validation :
// champ `version: brut | voix` de la fiche (pas `variant`, déjà pris par les tests de headline A/B/C) ; l'envoi prend le fichier choisi. Spec : `variants: ["brut", "voix"]`.
export const VARIANTS = { brut: "Brute", voix: "Avec voix" };
// Seule une vidéo a une version avec voix : un carrousel (dossier) ou une image → null
export const voicePath = (p) => (p && /\.(mp4|mov|webm|m4v)$/i.test(String(p)) ? String(p).replace(/(\.[a-z0-9]+)$/i, ".voix$1") : null);
export const wantsVoice = (spec) => Array.isArray(spec?.variants) && spec.variants.includes("voix");
// Chemin du média effectivement envoyé : media_file, ou sa version .voix si c'est celle qui a été choisie
export const chosenMedia = (mediaRel, variant) => (variant === "voix" && voicePath(mediaRel)) || mediaRel;
// Voix par défaut d'une spec : `tts` de la spec (objet) sinon edge-tts (voix choisie à l'écoute le 21/09 ; anglais pour un compte EN)
export function ttsFor(spec) {
  if (spec?.tts && typeof spec.tts === "object") return { engine: "edge", ...spec.tts };
  const en = spec?.lang === "en" || /(^|[-_/])en([-_/.]|$)/.test(String(spec?.account || spec?.out || ""));
  return { engine: "edge", voice: en ? "en-GB-SoniaNeural" : "fr-FR-DeniseNeural" };
}
