// Édition de la file de publication (06_CALENDAR/QUEUE.md) : déplacer une fiche dans la section d'un compte,
// ou réordonner les fiches en attente pour alterner les concepts (jamais deux fois le même format deux jours de suite).
// Le fichier reste la source de vérité : on ne touche qu'à l'ordre des lignes et à la colonne « Ordre ».
//
// API : readQueue() · sections(md) · moveRow(slug, exp, to) · interleave(slug, opts) · applyOrder(slug, order)
//   to = "top" | "up" | "down" | "bottom" | un numéro d'ordre (1 = prochain envoi)
// Les lignes déjà envoyées ou publiées ne bougent pas : elles restent en tête, dans leur ordre d'origine.
import fs from "node:fs";
import path from "node:path";
import { CONTENT_ROOT } from "../lib/paths.js";
import { readFrontmatter, fmValue } from "../lib/md.js";

export const QUEUE_FILE = path.join(CONTENT_ROOT, "06_CALENDAR", "QUEUE.md");
const EXPS = path.join(CONTENT_ROOT, "04_EXPERIMENTS");
const unq = fmValue;   // lib/md.js : guillemets respectés, commentaire de fin retiré, "null" → null

export const read = () => fs.readFileSync(QUEUE_FILE, "utf8");
export const write = (md) => fs.writeFileSync(QUEUE_FILE, md);

// Frontmatter d'une fiche EXP (format, rendition, angle, statut, test) — sans dépendre du cache du tableau de bord
export function expMeta(id) {
  const f = path.join(EXPS, `${id}.md`);
  if (!fs.existsSync(f)) return null;
  const fm = readFrontmatter(f);
  const g = (k) => unq(fm[k]) || null;
  const status = (g("status") || "").toLowerCase();
  return {
    id, account: g("account"), format: g("format"), rendition: g("rendition"), angle: g("angle"),
    test_group: g("test_group"), variant: g("variant"), hook: g("hook"), status,
    sent: !!g("draft_sent_at") || status.startsWith("publié") || status.startsWith("brouillon"),
    published: status.startsWith("publié"),
  };
}

// Famille de format (F01, F02, F03…) : deux concepts d'une même famille se ressemblent à l'écran (camembert avec ou sans visage)
// Abréviation F01, F02… (FORMAT-02 → F02), comme les dossiers de specs et les gabarits
export const short = (format) => (String(format || "").match(/FORMAT-0?(\d+)/) ? "F" + String(String(format).match(/FORMAT-0?(\d+)/)[1]).padStart(2, "0") : format || "?");
export const family = (meta) => short(meta?.format);

// « Concept » d'une fiche = ce que le spectateur voit : F01 POV · F02 carrousel · F02 vidéo · F03 faceless · F03 reaction
export function concept(meta) {
  if (!meta?.format) return "?";
  const f = short(meta.format);
  const r = (meta.rendition || "").toLowerCase();
  if (f === "F01") return "F01 POV";
  if (f === "F02") return r === "video" ? "F02 vidéo" : "F02 carrousel";
  if (f === "F03") return r === "reaction" ? "F03 reaction" : "F03 faceless";
  return `${f}${r ? " " + r : ""}`;
}

// ---- Découpage du fichier en sections « ## <slug> … » avec leur tableau ----
// Renvoie, par slug : { start, end, lines, headerIdx, sepIdx, rowIdx: [i…], cols: {ordre, exp} }
export function sections(md = read()) {
  const lines = md.split("\n");
  const out = {};
  let cur = null;
  const close = (end) => { if (cur) { cur.end = end; out[cur.slug] = cur; cur = null; } };
  lines.forEach((l, i) => {
    const m = l.match(/^## ([\w-]+)\b/);
    if (l.startsWith("## ") || l.startsWith("# ")) close(i);
    if (m) cur = { slug: m[1], start: i, end: lines.length, rowIdx: [], headerIdx: -1, sepIdx: -1 };
    else if (cur && l.startsWith("|")) {
      if (cur.headerIdx < 0) cur.headerIdx = i;
      else if (cur.sepIdx < 0 && /^\|[\s:|-]+\|$/.test(l)) cur.sepIdx = i;
      else cur.rowIdx.push(i);
    }
  });
  close(lines.length);
  for (const s of Object.values(out)) {
    if (s.headerIdx < 0) continue;
    const header = lines[s.headerIdx].split("|").slice(1, -1).map((c) => c.trim().toLowerCase());
    s.cols = { ordre: header.findIndex((h) => /^ordre/.test(h)), exp: header.findIndex((h) => /^exp/.test(h)), statut: header.findIndex((h) => /^statut/.test(h)) };
  }
  return { lines, sections: out };
}

const cellsOf = (line) => line.split("|").slice(1, -1);
const lineOf = (cells) => "|" + cells.join("|") + "|";

// Lignes d'un compte, enrichies de la fiche EXP
export function rowsOf(slug, parsed = sections()) {
  const s = parsed.sections[slug];
  if (!s || s.headerIdx < 0) return [];
  return s.rowIdx.map((i) => {
    const cells = cellsOf(parsed.lines[i]);
    const exp = (cells[s.cols.exp] || "").trim().match(/EXP-\d{3}/)?.[0] || null;
    const statut = (cells[s.cols.statut] || "").replace(/\*\*/g, "").trim();
    const meta = exp ? expMeta(exp) : null;
    return { i, cells, exp, statut, meta, concept: concept(meta), family: family(meta), locked: !!(meta?.sent || /publié|brouillon/i.test(statut)) };
  });
}

// Réécrit la section d'un compte dans l'ordre demandé (liste de lignes rowsOf) et renumérote « Ordre »
function rewrite(slug, ordered, parsed) {
  const s = parsed.sections[slug];
  const lines = [...parsed.lines];
  ordered.forEach((r, n) => {
    const cells = [...r.cells];
    if (s.cols.ordre >= 0 && /^\s*\d+\s*$/.test(cells[s.cols.ordre])) cells[s.cols.ordre] = ` ${n + 1} `;
    lines[s.rowIdx[n]] = lineOf(cells);
  });
  return lines.join("\n");
}

// ---- Déplacer une fiche ----
export function moveRow(slug, exp, to) {
  const parsed = sections();
  const rows = rowsOf(slug, parsed);
  if (!rows.length) throw new Error(`pas de file pour ${slug}`);
  const from = rows.findIndex((r) => r.exp === exp);
  if (from < 0) throw new Error(`${exp} n'est pas dans la file de ${slug}`);
  if (rows[from].locked) throw new Error(`${exp} est déjà ${rows[from].meta?.published ? "publié" : "envoyé en brouillon"} : sa place ne change plus`);
  const firstFree = rows.findIndex((r) => !r.locked);   // les lignes envoyées restent en tête
  let target;
  if (to === "top") target = firstFree;
  else if (to === "bottom") target = rows.length - 1;
  else if (to === "up") target = Math.max(firstFree, from - 1);
  else if (to === "down") target = Math.min(rows.length - 1, from + 1);
  else {
    const n = Number(to);
    if (!Number.isFinite(n)) throw new Error(`destination inconnue : ${to}`);
    target = Math.min(rows.length - 1, Math.max(firstFree, n - 1));
  }
  if (target === from) return { slug, exp, from: from + 1, to: target + 1, changed: false };
  const next = [...rows];
  next.splice(target, 0, next.splice(from, 1)[0]);
  write(rewrite(slug, next, parsed));
  return { slug, exp, from: from + 1, to: target + 1, changed: true, order: next.map((r) => r.exp || "—") };
}

// ---- Alterner les concepts ----
// Gloutonne : à chaque place, on prend la fiche qui évite le plus de répétitions (concept, puis test, puis angle),
// en privilégiant le concept dont il reste le plus d'exemplaires — c'est ce qui empêche de finir sur un bloc homogène.
export function interleave(slug, { apply = true } = {}) {
  const parsed = sections();
  const rows = rowsOf(slug, parsed);
  if (!rows.length) throw new Error(`pas de file pour ${slug}`);
  const locked = rows.filter((r) => r.locked);
  const pool = rows.filter((r) => !r.locked);
  if (pool.length < 2) return { slug, changed: false, reason: "moins de 2 fiches à replacer", order: rows.map((r) => r.exp) };

  const left = new Map();   // concept → nombre restant
  for (const r of pool) left.set(r.concept, (left.get(r.concept) || 0) + 1);
  const out = [];
  let prev = locked.at(-1) || null, prev2 = locked.at(-2) || null;
  const rest = [...pool];
  while (rest.length) {
    let best = null, bestScore = -Infinity;
    rest.forEach((r, idx) => {
      let score = (left.get(r.concept) || 0) * 10;                                   // écouler d'abord les concepts nombreux
      if (prev && r.concept === prev.concept) score -= 1000;                         // jamais deux fois le même concept d'affilée
      if (prev && r.family === prev.family) score -= 300;                            // ni deux formats de la même famille (F03 faceless puis reaction)
      if (prev2 && r.concept === prev2.concept) score -= 60;                         // et si possible pas un jour sur deux
      if (prev && r.meta?.test_group && r.meta.test_group === prev.meta?.test_group) score -= 500;   // variantes d'un test : jamais deux jours de suite…
      if (prev2 && r.meta?.test_group && r.meta.test_group === prev2.meta?.test_group) score -= 200;  // … ni un jour sur deux (protocole : 48 h d'écart)
      if (prev && r.meta?.angle && r.meta.angle === prev.meta?.angle) score -= 120;  // varier l'angle
      score -= idx * 0.01;                                                           // à égalité, l'ordre actuel décide
      if (score > bestScore) { bestScore = score; best = idx; }
    });
    const [r] = rest.splice(best, 1);
    left.set(r.concept, left.get(r.concept) - 1);
    out.push(r); prev2 = prev; prev = r;
  }
  const ordered = [...locked, ...out];
  const changed = ordered.some((r, i) => r.exp !== rows[i].exp);
  if (apply && changed) write(rewrite(slug, ordered, parsed));
  return {
    slug, changed, moved: ordered.filter((r, i) => r.exp !== rows[i].exp).length,
    order: ordered.map((r) => ({ exp: r.exp, concept: r.concept, angle: r.meta?.angle || null, test: r.meta?.test_group || null, variant: r.meta?.variant || null, status: r.statut || null, locked: r.locked })),
    repeats: ordered.filter((r, i) => i > 0 && !r.locked && r.family === ordered[i - 1].family).map((r) => r.exp),
  };
}

// Ordre explicite (liste d'EXP) — les fiches absentes de la liste gardent leur place relative à la fin
export function applyOrder(slug, order) {
  const parsed = sections();
  const rows = rowsOf(slug, parsed);
  const locked = rows.filter((r) => r.locked);
  const free = rows.filter((r) => !r.locked);
  const wanted = order.map((e) => free.find((r) => r.exp === e)).filter(Boolean);
  const rest = free.filter((r) => !wanted.includes(r));
  const ordered = [...locked, ...wanted, ...rest];
  write(rewrite(slug, ordered, parsed));
  return { slug, order: ordered.map((r) => r.exp) };
}

// ---- Ajouter une fiche en fin de file d'un compte ----
// Construit la ligne d'après l'en-tête du tableau de la section (Ordre, Exp, Angle, Format, Fichier, Statut…) ; colonnes inconnues vides.
export function addRow(slug, exp) {
  const parsed = sections();
  const s = parsed.sections[slug];
  if (!s || s.headerIdx < 0) throw new Error(`pas de tableau pour ${slug} dans QUEUE.md (section « ## ${slug} » à créer)`);
  const rows = rowsOf(slug, parsed);
  if (rows.some((r) => r.exp === exp)) throw new Error(`${exp} est déjà dans la file de ${slug}`);
  const f = path.join(EXPS, `${exp}.md`);
  const meta = expMeta(exp);
  if (!meta) throw new Error(`${exp} : fiche introuvable`);
  if (meta.account && meta.account !== slug) throw new Error(`${exp} appartient au compte ${meta.account}, pas à ${slug}`);
  const media = (unq(readFrontmatter(f).media_file) || "").replace(/\s*\(.*\)$/, "").replace(/\/$/, "");
  const header = parsed.lines[s.headerIdx].split("|").slice(1, -1).map((c) => c.trim().toLowerCase());
  const cells = header.map((h) => {
    if (/^ordre/.test(h)) return ` ${rows.length + 1} `;
    if (/^exp/.test(h)) return ` ${exp} `;
    if (/^angle/.test(h)) return ` ${meta.angle || ""} `;
    if (/^format/.test(h)) return ` ${concept(meta)} `;
    if (/^fichier/.test(h)) return media ? ` \`${path.basename(media)}${/\.\w+$/.test(media) ? "" : "/"}\` ` : " ";
    if (/^statut/.test(h)) return ` ${meta.status || ""} `;
    return " ";
  });
  const lines = [...parsed.lines];
  const after = rows.length ? rows.at(-1).i : s.sepIdx;
  lines.splice(after + 1, 0, lineOf(cells));
  write(lines.join("\n"));
  return { slug, exp, order: rows.length + 1 };
}
