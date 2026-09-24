// Plan du jour : pour chaque compte relié au fournisseur d'envoi (PUBLISH_BACKEND), le prochain contenu `prêt` dans l'ordre de 06_CALENDAR/QUEUE.md,
// le stock restant, et les consignes pour l'app (titre à taper, texte natif, bulles, son).
// Usage : node src/publish/daily-plan.js [--date AAAA-MM-JJ] [--accounts <slug>,<slug>] [--json]
// Sortie : data/publish/daily/<date>.json (idempotent : si le plan du jour existe déjà, il est relu, pas recréé)
import fs from "node:fs";
import path from "node:path";
import { CONTENT_ROOT, DATA } from "../lib/paths.js";
import { env } from "../lib/env.js";
import { readFrontmatter, fmValue } from "../lib/md.js";
import { args, readJson, writeJson, today } from "../lib/fs.js";
import { accountsConfig, accountIdOf, backendName, jobPath } from "./lib.js";
import { buildJob } from "./tiktok-draft.js";
import { isValidated } from "./validation.js";

const a = args();
const date = a.date || today();
const DAILY = path.join(DATA, "publish", "daily");
const planFile = path.join(DAILY, `${date}.json`);
// Idempotent et fusionnant : les items déjà `sent` du jour sont conservés ; les comptes absents, `planned`, `error`
// ou `no_stock` sont replanifiés (une relance le même jour n'envoie jamais deux fois sur un compte).
const existing = (!a.force && readJson(planFile)) || null;
const keep = existing ? existing.items.filter((x) => x.status === "sent" || x.status === "failed") : [];
const keepSlugs = new Set(keep.map((x) => x.slug));

const cfg = accountsConfig();
const wanted = (a.accounts || env("DAILY_ACCOUNTS", "")).split(",").map((s) => s.trim()).filter(Boolean);
const slugs = Object.keys(cfg.accounts).filter((s) => (wanted.length ? wanted.includes(s) : true) && !keepSlugs.has(s));
const queue = fs.readFileSync(path.join(CONTENT_ROOT, "06_CALENDAR", "QUEUE.md"), "utf8");
const unq = fmValue;   // lib/md.js : guillemets respectés, commentaire de fin retiré, "null" → null
const fiche = (exp) => { const f = path.join(CONTENT_ROOT, "04_EXPERIMENTS", `${exp}.md`); return fs.existsSync(f) ? Object.fromEntries(Object.entries(readFrontmatter(f)).map(([k, v]) => [k, unq(v)])) : null; };

// Lignes de la section QUEUE d'un compte, dans l'ordre du tableau
function queueRows(slug) {
  const m = queue.match(new RegExp(`^## ${slug}\\b[\\s\\S]*?(?=^## |\\Z)`, "m"));
  if (!m) return [];
  // l'identifiant peut être en gras dans le tableau (| 4 | **EXP-086** | …) : on le lit sans le balisage
  return [...m[0].matchAll(/^\|\s*(\d+)\s*\|\s*\*{0,2}(EXP-\d+)\*{0,2}\s*\|/gm)].map((x) => ({ order: Number(x[1]), exp: x[2] }));
}
const items = [...keep], skipped = [];
for (const slug of slugs) {
  const acc = cfg.accounts[slug];
  if (acc.paused || !accountIdOf(acc)) { skipped.push({ slug, handle: acc.handle, reason: acc.paused ? "en pause" : `pas de ${backendName() || "<backend>"}_account_id` }); continue; }
  const rows = queueRows(slug);
  // Prêt = rendu ET validé par l'humain (tableau de bord → Validation) ; les créas prêtes non validées attendent sans bloquer la file
  const rendered = rows.filter((r) => { const fm = fiche(r.exp); return fm && fm.account === slug && /^prêt/.test(fm.status || "") && !fm.draft_sent_at; });
  const ready = rendered.filter((r) => isValidated(fiche(r.exp)));
  const awaiting = rendered.filter((r) => !isValidated(fiche(r.exp))).map((r) => r.exp);
  if (!ready.length) { items.push({ slug, handle: acc.handle, device: acc.device, status: "no_stock", stock_after: 0, queue_rows: rows.length, awaiting_validation: awaiting }); continue; }
  const next = ready[0];
  let job;
  try { job = buildJob(next.exp); writeJson(jobPath(next.exp), { ...(readJson(jobPath(next.exp)) || {}), ...job }); }
  catch (e) { items.push({ slug, handle: acc.handle, exp: next.exp, status: "error", error: e.message, stock_after: ready.length - 1 }); continue; }
  if (!job.ok) { items.push({ slug, handle: acc.handle, exp: next.exp, status: "error", error: job.problems.join(" ; "), stock_after: ready.length - 1 }); continue; }
  const fm = fiche(next.exp);
  items.push({
    slug, handle: acc.handle, device: acc.device, backend: backendName() || null, account_id: accountIdOf(acc), exp: next.exp, status: "planned",
    media_type: job.media_type, files: job.files.length, format: fm.format || null, rendition: fm.rendition || null, hook: fm.hook || null,
    title_param: job.title, description_param: job.description ?? null, is_aigc: job.is_aigc,
    in_app: { title_to_type: job.in_app.tiktok_title_field || null, front_page_text: /selon la variante/i.test(job.in_app.front_page_text || "") ? job.in_app.tiktok_title_field : job.in_app.front_page_text, caption: job.in_app.caption, sound: job.in_app.sound, textes_md: job.in_app.textes_md, bubbles: job.in_app.sheet ? job.in_app.sheet.split("\n").filter((l) => l.startsWith("|") && !/^\|\s*(Début|---)/.test(l)).map((l) => { const c = l.split("|").slice(1, -1).map((x) => x.trim()); return { start: c[0]?.replace(/\s*s$/, ""), end: c[1]?.replace(/\s*s$/, ""), text: c[c.length - 1] }; }).filter((b) => b.text).slice(0, 8) : null },
    stock_after: ready.length - 1, stock_next: ready.slice(1, 4).map((r) => r.exp), awaiting_validation: awaiting,
  });
}
const plan = { date, created_at: existing?.created_at || new Date().toISOString(), updated_at: new Date().toISOString(), items, skipped, mode: env("DAILY_DRY_RUN") === "1" ? "dry-run" : "live" };
writeJson(planFile, plan);
if (a.json) console.log(JSON.stringify(plan, null, 2));
else {
  for (const it of items) console.log(`${it.status === "planned" ? "→" : it.status === "sent" ? "✓" : it.status === "no_stock" ? "∅" : "✗"} ${it.slug} (${it.handle}) : ${it.exp || "—"} ${it.status === "planned" ? `${it.media_type} · stock après : ${it.stock_after}` : it.status === "sent" ? `déjà envoyé aujourd'hui (${it.publish_id || "—"})` : it.status === "no_stock" ? `PLUS DE STOCK VALIDÉ${it.awaiting_validation?.length ? ` (${it.awaiting_validation.length} prête(s) en attente de validation)` : ""}` : "erreur : " + (it.error || it.reason || "?")}`);
  for (const s of skipped) console.log(`- ${s.slug} (${s.handle}) : ${s.reason}`);
  console.log(`Plan : ${path.relative(process.cwd(), planFile)}`);
}
