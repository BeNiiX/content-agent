// Validation humaine des créas : rien ne part sur un compte sans `validation: validé` dans la fiche EXP.
// Écrite depuis le tableau de bord (onglet Validation) : validation (validé | refusé | à retoucher), validated_at,
// validation_note (motif d'un refus, ou liste des changements d'une retouche, lue par l'agent). Une créa modifiée par l'agent après validation repasse à `validation: null`.
import { fmValue } from "../lib/md.js";

// fm = frontmatter brut (readFrontmatter) ou déjà nettoyé → "validated" | "refused" | "retouch" | "pending"
export function validationOf(fm = {}) {
  const v = (fmValue(fm.validation) || "").toLowerCase();
  if (v.startsWith("valid")) return "validated";
  if (v.startsWith("refus")) return "refused";
  if (v.startsWith("à retoucher") || v.startsWith("a retoucher")) return "retouch";   // bonne créa, détails à corriger par l'agent (validation_note)
  return "pending";
}
export const isValidated = (fm) => validationOf(fm) === "validated";
