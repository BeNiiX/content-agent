// Gabarits = format × rendu × compte, avec fiche technique versionnée (03_LIBRARY/gabarits/README.md).
// Fichier : 03_LIBRARY/gabarits/<F0x-rendu>/<compte>.md ; id : F02-carrousel.<compte>.
// Une créa (fiche EXP) appartient au gabarit déduit de format + rendition + account ; elle est « gelée » tant que ce
// gabarit n'est pas validé ou que sa gabarit_version est en retard, sauf si elle est déjà validée ou envoyée.
import fs from "node:fs";
import path from "node:path";
import { CONTENT_ROOT } from "./paths.js";
import { readFrontmatter, fmValue } from "./md.js";
import { parseFeedback } from "../publish/feedback.js";

export const DIR = path.join(CONTENT_ROOT, "03_LIBRARY", "gabarits");
// Rendus connus, dans l'ordre d'affichage de la matrice
export const RENDUS = [
  { key: "F01-video", format: "FORMAT-01", rendition: "video", label: "F01 POV" },
  { key: "F02-carrousel", format: "FORMAT-02", rendition: "carrousel", label: "F02 carrousel" },
  { key: "F02-video", format: "FORMAT-02", rendition: "video", label: "F02 vidéo" },
  { key: "F03-faceless", format: "FORMAT-03", rendition: "faceless", label: "F03 faceless" },
  { key: "F03-reaction", format: "FORMAT-03", rendition: "reaction", label: "F03 reaction" },
  { key: "F04-video", format: "FORMAT-04", rendition: "video", label: "F04 test du partenaire" },
];
export const STATUSES = ["à prototyper", "pilotes en revue", "à retoucher", "validé", "évolution proposée", "non pertinent"];

const short = (format) => (String(format || "").match(/FORMAT-0?(\d+)/) ? `F0${String(format).match(/FORMAT-0?(\d+)/)[1]}` : null);
export function idOf(fm = {}) {
  const f = short(fm.format), r = String(fm.rendition || "").trim(), a = String(fm.account || "").trim();
  return f && r && a ? `${f}-${r}.${a}` : null;
}
export const fileOf = (id) => { const [k, acc] = id.split("."); return path.join(DIR, k, `${acc}.md`); };
const list = (v) => (Array.isArray(v) ? v : String(v || "").replace(/^\[|\]$/g, "").split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean));

export function read(id) {
  const file = fileOf(id);
  if (!fs.existsSync(file)) return null;
  const raw = readFrontmatter(file), fm = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, fmValue(v)]));
  const src = fs.readFileSync(file, "utf8"), body = src.replace(/^---[\s\S]*?---\n*/, "");
  let checks = null;
  const cb = body.match(/## Contrôles[\s\S]*?```json\s*([\s\S]*?)```/);
  if (cb) { try { checks = JSON.parse(cb[1]); } catch { checks = null; } }
  return {
    id, file: path.relative(CONTENT_ROOT, file), fm, status: fm.status || "à prototyper", version: Number(fm.version || 0),
    validated_at: fm.validated_at || null, pilots: list(fm.pilots), validation_note: fm.validation_note || null,
    checks, body, comments: parseFeedback(src), evolution: (body.match(/## Évolution proposée\s*\n([\s\S]*?)(?=\n## |$)/)?.[1] || "").trim().replace(/^\(vide[^)]*\)$/, ""),
  };
}
export function all() {
  if (!fs.existsSync(DIR)) return [];
  const out = [];
  for (const d of fs.readdirSync(DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(DIR, d.name))) if (f.endsWith(".md") && !f.startsWith("_")) { const g = read(`${d.name}.${f.slice(0, -3)}`); if (g) out.push(g); }
  }
  return out;
}

// État d'une créa vis-à-vis de son gabarit : { gabarit, frozen, pilot, reason }
export function creaState(fm, validation, status, getGab = read) {
  const id = idOf(fm);
  const g = id ? getGab(id) : null;
  const sent = status === "drafted" || status === "published";
  const pilot = fm.pilote === "true" || fm.pilote === true;
  const base = { gabarit: id, gabarit_status: g?.status || null, gabarit_version: g?.version ?? null, pilot: false, frozen: false, reason: null };
  if (sent || validation === "validated") return base;   // décision du 24/09 : les créas validées restent valables
  if (pilot && g && g.status !== "validé") return { ...base, pilot: true, reason: `pilote du gabarit ${id} (${g.status})` };
  // jamais validé (v0) ou abandonné → gel ; en cours d'évolution (vN validée, statut ≠ validé) → les créas conformes à vN restent valables
  if (!g || g.status === "non pertinent" || g.version < 1) return { ...base, frozen: true, reason: g ? `gabarit ${id} ${g.status}` : `pas de gabarit ${id}` };
  if (Number(fm.gabarit_version || 0) < g.version) return { ...base, frozen: true, reason: `à mettre à jour vers la fiche v${g.version}` };
  return base;
}

export function create(id, today) {
  const [k, account] = id.split(".");
  const r = RENDUS.find((x) => x.key === k);
  if (!r || !/^[\w-]+$/.test(account || "")) throw new Error(`gabarit inconnu : ${id}`);
  const file = fileOf(id);
  if (fs.existsSync(file)) return path.relative(CONTENT_ROOT, file);
  const tpl = fs.readFileSync(path.join(DIR, "_TEMPLATE_GABARIT.md"), "utf8");
  const formatFile = fs.readdirSync(path.join(CONTENT_ROOT, "03_LIBRARY", "formats")).find((f) => f.startsWith(r.format + "-")) || `${r.format}.md`;
  const vars = { GABARIT_ID: id, FORMAT: r.format, RENDITION: r.rendition, ACCOUNT: account, KEY: k, FORMAT_FILE: formatFile, TODAY: today };
  const out = tpl.replace(/\{\{(\w+)\}\}/g, (m, v) => vars[v] ?? m);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
  return path.relative(CONTENT_ROOT, file);
}
