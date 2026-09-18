// Lecture de l'état du projet pour le tableau de bord : comptes (config/accounts.json), fiches EXP (04_EXPERIMENTS),
// file (06_CALENDAR/QUEUE.md), plan du soir (data/publish/daily), assets (07_ASSETS). Aucune écriture ici.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CONTENT_ROOT, DATA, INFRA_ROOT } from "../lib/paths.js";
import { env } from "../lib/env.js";
import { readFrontmatter } from "../lib/md.js";
import { readJson, today } from "../lib/fs.js";
import { accountsConfig, jobPath } from "../publish/lib.js";
import { project, scheduledLabel } from "../lib/project.js";
import { buildJob } from "../publish/tiktok-draft.js";

export const EXPS = path.join(CONTENT_ROOT, "04_EXPERIMENTS");
export const ASSETS = path.join(CONTENT_ROOT, "07_ASSETS");
export const DAILY = path.join(DATA, "publish", "daily");
const QUEUE_FILE = path.join(CONTENT_ROOT, "06_CALENDAR", "QUEUE.md");
const unq = (s) => { if (s === undefined) return undefined; const v = String(s).replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, ""); return v === "null" || v === "" ? null : v; };
const rel = (abs) => path.relative(CONTENT_ROOT, abs);
// URL de média servie par le serveur : /media/<chemin relatif à CONTENT_ROOT>, segments encodés
export const mediaUrl = (abs) => "/media/" + rel(abs).split(path.sep).map(encodeURIComponent).join("/");
const IMG = /\.(jpe?g|webp|png|heic|heif)$/i, VID = /\.(mp4|mov|webm|m4v)$/i;

// ---- Fiches EXP (cache par mtime) ----
const expCache = new Map();
export function experiment(id) {
  const file = path.join(EXPS, `${id}.md`);
  if (!fs.existsSync(file)) return null;
  const mtime = fs.statSync(file).mtimeMs;
  const hit = expCache.get(id);
  if (hit && hit.mtime === mtime) return hit.value;
  const raw = readFrontmatter(file);
  const fm = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, unq(v)]));
  const body = fs.readFileSync(file, "utf8").replace(/^---[\s\S]*?---/, "");
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() || id;
  const caption = body.match(/^(?!#)[^\n]*Caption\s*:\s*«\s*(.+?)\s*»/m)?.[1] || null;
  const media = fm.media_file ? path.resolve(CONTENT_ROOT, fm.media_file.replace(/\s*\(.*\)$/, "").replace(/\/$/, "")) : null;
  const value = { id, file: rel(file), fm, title, caption, media: mediaInfo(media), status: statusKey(fm) };
  expCache.set(id, { mtime, value });
  return value;
}
export function experiments() {
  return fs.readdirSync(EXPS).filter((f) => /^EXP-\d+\.md$/.test(f)).map((f) => experiment(f.replace(".md", ""))).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
}
// Statut normalisé : ready | drafted | published | todo (à tourner / à monter / idée) | other
function statusKey(fm) {
  const s = (fm.status || "").toLowerCase();
  if (s.startsWith("publié")) return "published";
  if (s.startsWith("brouillon")) return "drafted";
  if (s.startsWith("prêt")) return fm.draft_sent_at ? "drafted" : "ready";
  if (/tourner|monter|idée|idee|brief/.test(s)) return "todo";
  return "other";
}
function mediaInfo(abs) {
  if (!abs || !fs.existsSync(abs)) return abs ? { exists: false, path: rel(abs) } : null;
  if (fs.statSync(abs).isDirectory()) {
    const slides = fs.readdirSync(abs).filter((f) => IMG.test(f)).sort();
    return { exists: true, type: "PHOTO", path: rel(abs), count: slides.length, slides: slides.map((f) => mediaUrl(path.join(abs, f))), cover: slides.length ? mediaUrl(path.join(abs, slides[0])) : null };
  }
  return { exists: true, type: "VIDEO", path: rel(abs), url: mediaUrl(abs), bytes: fs.statSync(abs).size };
}

// ---- File de publication (06_CALENDAR/QUEUE.md) ----
export function queue() {
  const md = fs.existsSync(QUEUE_FILE) ? fs.readFileSync(QUEUE_FILE, "utf8") : "";
  const known = new Set(Object.keys(accountsConfig().accounts));   // une section « ## <slug> » par compte de config/accounts.json
  const out = {};
  for (const m of md.matchAll(/^## ([\w-]+)\b([^\n]*)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)) {
    const slug = m[1]; if (!known.has(slug)) continue;
    const lines = m[3].split("\n");
    const notes = lines.filter((l) => l.trim() && !l.startsWith("|")).map((l) => l.trim());
    const table = lines.filter((l) => l.startsWith("|"));
    if (table.length < 2) { out[slug] = { title: m[2].trim(), rows: [], notes }; continue; }
    const header = table[0].split("|").slice(1, -1).map((c) => c.trim().toLowerCase());
    const col = (row, re) => { const i = header.findIndex((h) => re.test(h)); return i >= 0 ? (row[i] || "").trim() : ""; };
    const rows = table.slice(2).map((l) => l.split("|").slice(1, -1)).map((cells) => ({
      order: col(cells, /^ordre/), exp: /^EXP-\d+$/.test(col(cells, /^exp/)) && /^\d+$/.test(col(cells, /^ordre/)) ? col(cells, /^exp/) : null, exp_raw: col(cells, /^exp/),
      angle: col(cells, /^angle/), format: col(cells, /^format/), file: col(cells, /^fichier/).replace(/`/g, ""),
      status: col(cells, /^statut/).replace(/\*\*/g, ""), todo: col(cells, /ajouter|bloqué/), avoid: col(cells, /même semaine/),
    }));
    out[slug] = { title: m[2].replace(/^[\s—-]+/, "").trim(), rows, notes };
  }
  return out;
}

// ---- Comptes : résumé + stock ----
export function accounts() {
  const cfg = accountsConfig();
  const q = queue();
  const all = experiments();
  const plan = dailyPlan().plan;
  return Object.entries(cfg.accounts).map(([slug, a]) => {
    const mine = all.filter((e) => e.fm.account === slug);
    const rows = q[slug]?.rows || [];
    const queued = rows.filter((r) => r.exp).map((r) => experiment(r.exp)).filter(Boolean);
    const readyQueue = queued.filter((e) => e.status === "ready" && e.fm.account === slug);
    const readyAll = mine.filter((e) => e.status === "ready");
    const drafted = mine.filter((e) => e.status === "drafted");
    const lastSent = drafted.map((e) => e.fm.draft_sent_at).filter(Boolean).sort().at(-1) || null;
    const planItem = plan?.items?.find((i) => i.slug === slug) || null;
    return {
      slug, handle: a.handle, device: a.device, role: a.role, icp: a.icp, da: a.da, note: a.note || null,
      connector_id: a.connector_id || null, connected: !!a.connector_id, connected_at: a.connected_at || null,
      paused: !!a.paused, production_paused: !!a.production_paused,
      stock: { ready_queue: readyQueue.length, ready_total: readyAll.length, drafted: drafted.length, published: mine.filter((e) => e.status === "published").length, todo: mine.filter((e) => e.status === "todo").length, total: mine.length, queue_rows: rows.length },
      next: readyQueue[0] ? { id: readyQueue[0].id, hook: readyQueue[0].fm.hook, format: readyQueue[0].fm.format, rendition: readyQueue[0].fm.rendition, cover: readyQueue[0].media?.cover || readyQueue[0].media?.url || null, type: readyQueue[0].media?.type || null } : null,
      last_sent: lastSent, tonight: planItem ? { status: planItem.status, exp: planItem.exp || null } : null,
      will_send: !a.paused && !!a.connector_id && readyQueue.length > 0,
    };
  });
}

// ---- File d'un compte : lignes de QUEUE.md enrichies + fiches hors file ----
export function accountQueue(slug) {
  const q = queue()[slug] || { rows: [], notes: [], title: "" };
  const seen = new Set();
  const rows = q.rows.map((r) => {
    const e = r.exp ? experiment(r.exp) : null; if (r.exp) seen.add(r.exp);
    return { ...r, exp_data: e ? summary(e) : null, wrong_account: !!(e && e.fm.account && e.fm.account !== slug) };
  });
  const others = experiments().filter((e) => e.fm.account === slug && !seen.has(e.id)).map(summary);
  return { slug, title: q.title, notes: q.notes, rows, others };
}
const summary = (e) => ({ id: e.id, title: e.title, status: e.status, status_raw: e.fm.status || null, hook: e.fm.hook || null, angle: e.fm.angle || null, format: e.fm.format || null, rendition: e.fm.rendition || null, media: e.media, draft_sent_at: e.fm.draft_sent_at || null, published_at: e.fm.published_at || null, post_url: e.fm.post_url || null, updated: e.fm.updated || null, sound: e.fm.sound || null });

// ---- Détail d'une fiche : job (fiche « à saisir dans l'app ») + média ----
export function expDetail(id) {
  const e = experiment(id);
  if (!e) return null;
  let job = null, error = null;
  try { job = buildJob(id); } catch (err) { error = err.message; }
  const saved = readJson(jobPath(id));
  const sheetRows = job?.in_app?.sheet ? parseSheet(job.in_app.sheet) : null;
  return {
    ...summary(e), file: e.file, caption: e.caption, fm: e.fm, account: e.fm.account || null,
    job: job ? { ok: job.ok, problems: job.problems, media_type: job.media_type, files: job.files.length, title_param: job.title, description_param: job.description ?? null, caption_source: job.caption_source, is_aigc: job.is_aigc, in_app: job.in_app, sheet_rows: sheetRows } : null,
    job_error: error, sent: saved?.sent || null,
    tiktok_publish_id: e.fm.tiktok_publish_id || null,
  };
}
// Tableau markdown (bulles POV) → lignes ; sinon null (le front affiche le markdown brut)
function parseSheet(md) {
  const lines = md.split("\n").filter((l) => l.startsWith("|"));
  if (lines.length < 3) return null;
  const header = lines[0].split("|").slice(1, -1).map((c) => c.trim());
  return { header, rows: lines.slice(2).map((l) => l.split("|").slice(1, -1).map((c) => c.trim().replace(/\*\*/g, ""))) };
}

// ---- Plan du soir ----
export function dailyPlan(date = today()) {
  const planFile = path.join(DAILY, `${date}.json`), logFile = path.join(DAILY, `${date}.log`);
  const plan = readJson(planFile);
  const log = fs.existsSync(logFile) ? tail(logFile, 60) : null;
  return { date, plan, log, plan_file: rel(planFile), log_file: rel(logFile) };
}
export function tail(file, n = 60) {
  try { const lines = fs.readFileSync(file, "utf8").split("\n"); return lines.slice(-n).join("\n"); } catch { return null; }
}
// ---- Planificateur : launchd (macOS) ou systemd (Linux, unités content-<task>.timer de deploy/systemd) ----
// Même forme dans les deux cas : { installed, state, last_exit, next, scheduler }. Sur un autre système : { installed: null, scheduler: null }.
export function launchdStatus(label) {
  const r = spawnSync("launchctl", ["print", `gui/${typeof process.getuid === "function" ? process.getuid() : 0}/${label}`], { encoding: "utf8" });
  if (r.error || r.status !== 0) return { installed: false, scheduler: "launchd" };
  const out = r.stdout || "";
  return { installed: true, scheduler: "launchd", state: out.match(/state = (\w+)/)?.[1] || null, last_exit: out.match(/last exit code = ([^\n]+)/)?.[1]?.trim() || null, next: null };
}
export function systemdStatus(unit) {
  // unit = content-daily-drafts (sans suffixe) → content-daily-drafts.timer + content-daily-drafts.service
  const sh = (argv) => { const r = spawnSync("systemctl", argv, { encoding: "utf8" }); return r.error ? null : { status: r.status, out: r.stdout || "" }; };
  const timers = sh(["list-timers", "--all", "--no-pager", "--no-legend", `${unit}.timer`]);
  if (!timers) return { installed: null, scheduler: null };   // systemctl absent
  if (!timers.out.split("\n").some((l) => l.includes(`${unit}.timer`))) return { installed: false, scheduler: "systemd" };
  const props = (u, keys) => Object.fromEntries((sh(["show", ...keys.flatMap((k) => ["-p", k]), u])?.out || "").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
  const t = props(`${unit}.timer`, ["NextElapseUSecRealtime", "LastTriggerUSec"]);
  const svc = props(`${unit}.service`, ["ExecMainStatus", "Result", "ActiveState"]);
  const active = (sh(["is-active", `${unit}.timer`])?.out || "").trim();
  const clean = (v) => (v && v !== "n/a" && v !== "0" ? v : null);
  return {
    installed: true, scheduler: "systemd",
    state: active || null,                                              // active | inactive | failed…
    next: clean(t.NextElapseUSecRealtime),                              // "Mon 2026-09-21 08:00:00 CEST"
    last_run: clean(t.LastTriggerUSec),
    last_exit: svc.ExecMainStatus !== undefined && svc.ExecMainStatus !== "" ? `${svc.ExecMainStatus}${svc.Result && svc.Result !== "success" ? " (" + svc.Result + ")" : ""}` : null,
  };
}
export function schedulerStatus(task) {
  if (process.platform === "darwin") return launchdStatus(scheduledLabel(task));
  if (process.platform === "linux") return systemdStatus(`content-${task}`);
  return { installed: null, scheduler: null };
}
export function schedule() {
  // Horaires : config/project.json (daily_hour, weekly_stats) ; les plists launchd générés (hors git) et les timers systemd en dérivent.
  const p = project();
  return {
    platform: process.platform,
    daily: { label: process.platform === "linux" ? "content-daily-drafts" : scheduledLabel("daily-drafts"), hour: p.daily_hour, minute: 0, weekday: null, ...schedulerStatus("daily-drafts") },
    weekly: { label: process.platform === "linux" ? "content-weekly-stats" : scheduledLabel("weekly-stats"), hour: p.weekly_stats.hour, minute: 0, weekday: p.weekly_stats.weekday, ...schedulerStatus("weekly-stats") },
    notify_channel: env("NOTIFY_CHANNEL", "stdout"), daily_accounts: env("DAILY_ACCOUNTS", "") || null, dry_run: env("DAILY_DRY_RUN") === "1",
    claude_cli: !!(spawnSync("which", ["claude"], { encoding: "utf8", env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` } }).stdout || "").trim(),
  };
}

// ---- Assets ----
function catalogRows(file) {
  // Tables « | `fichier` | contenu | angles | utilisée dans | » d'un catalogue MD → map fichier → {desc, angles, used}
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const l of fs.readFileSync(file, "utf8").split("\n")) {
    const m = l.match(/^\|\s*`([^`]+)`\s*\|(.*)$/); if (!m) continue;
    const cells = m[2].split("|").map((c) => c.trim());
    out[path.basename(m[1])] = { desc: cells[0] || "", angles: cells[1] || "", used: cells[2] || "" };
  }
  return out;
}
export function assets() {
  const photosDir = path.join(ASSETS, "photos"), screensDir = path.join(ASSETS, "screen-records"), rushesDir = path.join(ASSETS, "rushes");
  const photoCat = catalogRows(path.join(photosDir, "PHOTOS.md")), screenCat = catalogRows(path.join(screensDir, "SCREENS.md"));
  const listDir = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f) && !f.startsWith("_") && !f.startsWith(".")).sort() : []);
  const themes = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_")).map((d) => d.name).sort() : []);
  const photos = themes(photosDir).map((t) => ({ theme: t, items: listDir(path.join(photosDir, t), IMG).map((f) => { const p = path.join(photosDir, t, f); const c = photoCat[f] || {}; return { name: f, url: mediaUrl(p), bytes: fs.statSync(p).size, desc: c.desc || null, angles: c.angles || null, used: c.used && c.used !== "—" ? c.used : null }; }) }));
  const screens = themes(screensDir).map((t) => ({ theme: t, items: listDir(path.join(screensDir, t), VID).map((f) => { const p = path.join(screensDir, t, f); const c = screenCat[f] || {}; return { name: f, url: mediaUrl(p), bytes: fs.statSync(p).size, desc: c.desc || null, notes: c.used || null }; }) }));
  const rushes = listDir(rushesDir, VID).map((f) => { const p = path.join(rushesDir, f); return { name: f, url: mediaUrl(p), bytes: fs.statSync(p).size }; });
  const inboxDir = path.join(photosDir, "_inbox");
  const inbox = listDir(inboxDir, IMG).map((f) => { const p = path.join(inboxDir, f); return { name: f, url: mediaUrl(p), bytes: fs.statSync(p).size }; });
  const triage = readJson(path.join(inboxDir, "_triage.json"));
  const sheets = fs.existsSync(inboxDir) ? fs.readdirSync(inboxDir).filter((f) => /^_contact-sheet.*\.jpg$/i.test(f)).sort().map((f) => mediaUrl(path.join(inboxDir, f))) : [];
  const screenNext = Math.max(0, ...screens.flatMap((t) => t.items.map((i) => Number(i.name.match(/-S(\d+)\./)?.[1] || 0)))) + 1;
  return { photos, screens, rushes, inbox: { items: inbox, triage: triage ? Object.entries(triage.items || {}).map(([k, v]) => ({ file: k, ...v })) : null, contact_sheets: sheets }, screen_next_index: screenNext, photo_themes: themes(photosDir), screen_themes: themes(screensDir) };
}
