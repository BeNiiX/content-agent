// Lecture de l'état du projet pour le tableau de bord : comptes (config/accounts.json), fiches EXP (04_EXPERIMENTS),
// file (06_CALENDAR/QUEUE.md), plan du soir (data/publish/daily), assets (07_ASSETS). Aucune écriture ici.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CONTENT_ROOT, DATA, INFRA_ROOT } from "../lib/paths.js";
import { env } from "../lib/env.js";
import { readFrontmatter, fmValue } from "../lib/md.js";
import { readJson, today } from "../lib/fs.js";
import { accountsConfig, accountIdOf, backendName, jobPath } from "../publish/lib.js";
import { project, scheduledLabel } from "../lib/project.js";
import { buildJob } from "../publish/tiktok-draft.js";
import { concept as conceptOf } from "../calendar/queue-edit.js";
import { validationOf } from "../publish/validation.js";
import { parseFeedback } from "../publish/feedback.js";
import { chosenMedia, voicePath, wantsVoice } from "../lib/variants.js";
import { specOf } from "../lib/specs.js";
import * as G from "../lib/gabarits.js";
import { status as dailyDue } from "../publish/due.js";

export const EXPS = path.join(CONTENT_ROOT, "04_EXPERIMENTS");
export const ASSETS = path.join(CONTENT_ROOT, "07_ASSETS");
export const DAILY = path.join(DATA, "publish", "daily");
const QUEUE_FILE = path.join(CONTENT_ROOT, "06_CALENDAR", "QUEUE.md");
const unq = fmValue;   // lib/md.js : guillemets respectés, commentaire de fin retiré, "null" → null
const rel = (abs) => path.relative(CONTENT_ROOT, abs);
// URL de média servie par le serveur : /media/<chemin relatif à CONTENT_ROOT>, segments encodés
export const mediaUrl = (abs) => "/media/" + rel(abs).split(path.sep).map(encodeURIComponent).join("/");
const IMG = /\.(jpe?g|webp|png|heic|heif)$/i, VID = /\.(mp4|mov|webm|m4v)$/i;

// ---- Fiches EXP (cache par mtime) ----
const expCache = new Map();
// Gabarit (fiche technique) en cache par mtime : l'état gelé / pilote d'une créa en dépend
const gabCache = new Map();
export function gabarit(id) {
  const f = G.fileOf(id);
  if (!fs.existsSync(f)) return null;
  const m = fs.statSync(f).mtimeMs, h = gabCache.get(id);
  if (h && h.m === m) return h.g;
  const g = G.read(id); gabCache.set(id, { m, g }); return g;
}
const withGab = (v) => (v ? { ...v, ...G.creaState(v.fm, v.validation, v.status, gabarit) } : v);
export function experiment(id) {
  const file = path.join(EXPS, `${id}.md`);
  if (!fs.existsSync(file)) return null;
  const mtime = fs.statSync(file).mtimeMs;
  const hit = expCache.get(id);
  if (hit && hit.mtime === mtime) return withGab(hit.value);
  const raw = readFrontmatter(file);
  const fm = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, unq(v)]));
  const body = fs.readFileSync(file, "utf8").replace(/^---[\s\S]*?---/, "");
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() || id;
  const caption = body.match(/^(?!#)[^\n]*Caption\s*:\s*«\s*(.+?)\s*»/m)?.[1] || null;
  const baseRel = fm.media_file ? fm.media_file.replace(/\s*\(.*\)$/, "").replace(/\/$/, "") : null;
  // Deux versions (brute / avec voix) : les deux médias + le choix ; le média « courant » est celui choisi (sinon la brute)
  const voiceAbs = voicePath(baseRel) ? path.resolve(CONTENT_ROOT, voicePath(baseRel)) : null;
  const variants = voiceAbs && fs.existsSync(voiceAbs) ? { choice: fm.version === "voix" || fm.version === "brut" ? fm.version : null, brut: mediaInfo(path.resolve(CONTENT_ROOT, baseRel)), voix: mediaInfo(voiceAbs) } : null;
  const media = baseRel ? path.resolve(CONTENT_ROOT, variants ? chosenMedia(baseRel, fm.version) : baseRel) : null;
  const comments = parseFeedback(fs.readFileSync(file, "utf8"));
  const value = { variants, id, file: rel(file), fm, title, caption, media: mediaInfo(media), status: statusKey(fm), validation: validationOf(fm), mtime, comments };
  expCache.set(id, { mtime, value });
  return withGab(value);
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
    const v = (f) => mediaUrl(path.join(abs, f)) + "?v=" + Math.round(fs.statSync(path.join(abs, f)).mtimeMs);   // change à chaque rendu → pas d'image périmée en cache
    return { exists: true, type: "PHOTO", path: rel(abs), count: slides.length, slides: slides.map(v), cover: slides.length ? v(slides[0]) : null };
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
      order: col(cells, /^ordre/), exp: /^\d+$/.test(col(cells, /^ordre/)) ? (col(cells, /^exp/).match(/EXP-\d{3}/)?.[0] || null) : null, exp_raw: col(cells, /^exp/),
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
    const renderedQueue = queued.filter((e) => e.status === "ready" && e.fm.account === slug);
    const readyQueue = renderedQueue.filter((e) => e.validation === "validated");   // ce que l'envoi du soir peut prendre
    const readyAll = mine.filter((e) => e.status === "ready");
    const drafted = mine.filter((e) => e.status === "drafted");
    const lastSent = drafted.map((e) => e.fm.draft_sent_at).filter(Boolean).sort().at(-1) || null;
    const planItem = plan?.items?.find((i) => i.slug === slug) || null;
    return {
      slug, handle: a.handle, device: a.device, role: a.role, icp: a.icp, da: a.da, note: a.note || null,
      backend: backendName() || null, account_id: accountIdOf(a), connected: !!accountIdOf(a), connected_at: a[`${backendName()}_connected_at`] || null,
      paused: !!a.paused, production_paused: !!a.production_paused,
      stock: { ready_queue: readyQueue.length, awaiting_validation: mine.filter((e) => e.status === "ready" && e.validation === "pending" && !e.frozen && !e.pilot).length, frozen: mine.filter((e) => e.frozen).length, refused: mine.filter((e) => e.validation === "refused" && (e.status === "ready" || e.status === "todo")).length, retouch: mine.filter((e) => e.validation === "retouch").length, not_queued: readyAll.filter((e) => e.validation === "validated" && !queued.includes(e)).length, ready_total: readyAll.length, drafted: drafted.length, published: mine.filter((e) => e.status === "published").length, todo: mine.filter((e) => e.status === "todo").length, total: mine.length, queue_rows: rows.length },
      next: readyQueue[0] ? { id: readyQueue[0].id, hook: readyQueue[0].fm.hook, format: readyQueue[0].fm.format, rendition: readyQueue[0].fm.rendition, cover: readyQueue[0].media?.cover || readyQueue[0].media?.url || null, type: readyQueue[0].media?.type || null } : null,
      last_sent: lastSent, tonight: planItem ? { status: planItem.status, exp: planItem.exp || null } : null,
      will_send: !a.paused && !!accountIdOf(a) && readyQueue.length > 0,
    };
  });
}

// ---- File d'un compte : lignes de QUEUE.md enrichies + fiches hors file ----
export function accountQueue(slug) {
  const q = queue()[slug] || { rows: [], notes: [], title: "" };
  const seen = new Set();
  const rows = q.rows.map((r) => {
    const e = r.exp ? experiment(r.exp) : null; if (r.exp) seen.add(r.exp);
    const concept = e ? conceptOf({ format: e.fm.format, rendition: e.fm.rendition }) : null;
    const locked = !!(e && (e.status === "drafted" || e.status === "published"));
    return { ...r, exp_data: e ? summary(e) : null, concept, movable: !!e && !locked, wrong_account: !!(e && e.fm.account && e.fm.account !== slug) };
  });
  const others = experiments().filter((e) => e.fm.account === slug && !seen.has(e.id)).map(summary);
  // répétitions : deux lignes en attente qui se suivent avec la même famille de format (F01, F02, F03…)
  const waiting = rows.filter((r) => r.movable);
  const repeats = waiting.filter((r, i) => i > 0 && (r.concept || "").split(" ")[0] === (waiting[i - 1].concept || "").split(" ")[0]).map((r) => r.exp);
  return { slug, title: q.title, notes: q.notes, rows, others, repeats };
}
const summary = (e) => ({ id: e.id, title: e.title, gabarit: e.gabarit, gabarit_status: e.gabarit_status, gabarit_version: e.gabarit_version, crea_gabarit_version: e.fm.gabarit_version || null, frozen: e.frozen, pilot: e.pilot, frozen_reason: e.reason, two_versions: !!e.variants, variant: e.variants?.choice || null, status: e.status, status_raw: e.fm.status || null, account: e.fm.account || null,
  validation: e.validation, validated_at: e.fm.validated_at || null, validation_note: e.fm.validation_note || null, retouche_faite: e.fm.retouche_faite || null, a_valider: e.fm.a_valider || null,
  concept: conceptOf({ format: e.fm.format, rendition: e.fm.rendition }), created: e.fm.created || null, comments: e.comments.length, comments_pending: e.comments.filter((c) => !c.done).length, hook: e.fm.hook || null, angle: e.fm.angle || null, format: e.fm.format || null, rendition: e.fm.rendition || null, media: e.media, draft_sent_at: e.fm.draft_sent_at || null, published_at: e.fm.published_at || null, post_url: e.fm.post_url || null, updated: e.fm.updated || null, sound: e.fm.sound || null });

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
    job_error: error, sent: saved?.sent || null, comments_list: e.comments, carousel: carouselInfo(e),
    variants: e.variants, voice_possible: voicePossible(e),
    // Champs modifiables depuis l'onglet Validation (actions.editTexts) : valeur effective + d'où elle vient
    edit: job ? {
      tiktok_title: { value: job.in_app.tiktok_title_field || "", source: e.fm.tiktok_title ? "fiche (tiktok_title)" : "hook de la fiche", applies: job.media_type === "PHOTO" },
      front_page_text: { value: job.in_app.front_page_text || "", source: e.fm.front_page_text ? "fiche (front_page_text)" : job.in_app.posts_md ? job.in_app.posts_md : "—" },
      caption: { value: job.in_app.caption || "", source: job.caption_source },
      sound: { value: job.in_app.sound || "", source: "fiche (sound)" },
      description_sent: job.media_type === "PHOTO" ? job.title : null,
    } : null,
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
    daily: { label: process.platform === "linux" ? "content-daily-drafts" : scheduledLabel("daily-drafts"), hour: p.daily_hour, minute: p.daily_minute ?? 0, weekday: null, ...schedulerStatus("daily-drafts") },
    stats: { label: process.platform === "linux" ? "content-daily-stats" : scheduledLabel("daily-stats"), hour: p.stats_hour, minute: 0, ...schedulerStatus("daily-stats") },
    weekly: { label: process.platform === "linux" ? "content-weekly-veille" : scheduledLabel("weekly-veille"), hour: p.weekly_veille.hour, minute: 0, weekday: p.weekly_veille.weekday, ...schedulerStatus("weekly-veille") },
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
  // Extraits découpés (<thème>/clips/<id>-….mp4) rattachés à leur enregistrement via opinions.json (recordings, opinions, showcase)
  const bank = readJson(path.join(ASSETS, "opinions.json")) || {};
  const recOf = Object.fromEntries(Object.entries(bank.recordings || {}).map(([r, p]) => [path.basename(p), r]));
  const byId = Object.fromEntries([...(bank.opinions || []), ...(bank.showcase || []).map((s) => ({ ...s, showcase: true }))].map((o) => [o.id, o]));
  const clipsOf = (t, f) => {
    const rec = recOf[f]; if (!rec) return [];
    const dir = path.join(screensDir, t, "clips");
    return listDir(dir, VID).filter((c) => c.startsWith(rec.toLowerCase() + "-")).map((c) => {
      const o = byId[c.match(/^(s\d+-(?:showcase-)?\d+)/i)?.[1]] || {};
      return { name: c, url: mediaUrl(path.join(dir, c)), showcase: !!o.showcase, text: o.text || o.desc || null, verdict: o.verdict || null, vote: o.vote || null, pct_agree: o.pct_agree ?? o.pct_agree_app ?? null, icp: o.icp || null, skipped: !!o.skipped, dur: o.to != null ? Math.round((o.to - o.from) * 10) / 10 : null };
    }).sort((a, b) => (b.showcase - a.showcase) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  };
  const screens = themes(screensDir).map((t) => ({ theme: t, items: listDir(path.join(screensDir, t), VID).map((f) => { const p = path.join(screensDir, t, f); const c = screenCat[f] || {}; return { name: f, url: mediaUrl(p), bytes: fs.statSync(p).size, desc: c.desc || null, notes: c.used || null, clips: clipsOf(t, f) }; }) }));
  const rushes = listDir(rushesDir, VID).map((f) => { const p = path.join(rushesDir, f); return { name: f, url: mediaUrl(p), bytes: fs.statSync(p).size }; });
  const inboxDir = path.join(photosDir, "_inbox");
  const inbox = listDir(inboxDir, IMG).map((f) => { const p = path.join(inboxDir, f); return { name: f, url: mediaUrl(p), bytes: fs.statSync(p).size }; });
  const triage = readJson(path.join(inboxDir, "_triage.json"));
  const sheets = fs.existsSync(inboxDir) ? fs.readdirSync(inboxDir).filter((f) => /^_contact-sheet.*\.jpg$/i.test(f)).sort().map((f) => mediaUrl(path.join(inboxDir, f))) : [];
  const vidInboxDir = path.join(ASSETS, "_inbox");
  const inboxVideos = listDir(vidInboxDir, VID).map((f) => { const p = path.join(vidInboxDir, f); return { name: f, url: mediaUrl(p), bytes: fs.statSync(p).size, path: rel(p) }; });
  // « à traiter » : cases non cochées de 07_ASSETS/A_TRAITER.md (chemins relatifs au projet) + tout ce qui dort dans une boîte de dépôt
  const todoFile = path.join(ASSETS, "A_TRAITER.md");
  const todo = new Set(fs.existsSync(todoFile) ? [...fs.readFileSync(todoFile, "utf8").matchAll(/^- \[ \] .*?`([^`]+)`/gm)].map((m) => m[1]) : []);
  const mark = (dir, items) => items.forEach((i) => { i.todo = todo.has(rel(path.join(dir, i.name))); });
  photos.forEach((t) => mark(path.join(photosDir, t.theme), t.items)); screens.forEach((t) => mark(path.join(screensDir, t.theme), t.items)); mark(rushesDir, rushes);
  inbox.forEach((i) => { i.todo = true; }); inboxVideos.forEach((i) => { i.todo = true; });
  const todo_count = inbox.length + inboxVideos.length + photos.reduce((n, t) => n + t.items.filter((i) => i.todo).length, 0) + screens.reduce((n, t) => n + t.items.filter((i) => i.todo).length, 0) + rushes.filter((i) => i.todo).length;
  const screenNext = Math.max(0, ...screens.flatMap((t) => t.items.map((i) => Number(i.name.match(/-S(\d+)\./)?.[1] || 0)))) + 1;
  return { photos, screens, rushes, todo_count, inbox: { videos: inboxVideos, items: inbox, triage: triage ? Object.entries(triage.items || {}).map(([k, v]) => ({ file: k, ...v })) : null, contact_sheets: sheets }, screen_next_index: screenNext, photo_themes: themes(photosDir), screen_themes: themes(screensDir) };
}

// ---- Validation : toutes les créas avec leur place dans la file ----
export function creas() {
  const cfg = accountsConfig().accounts, q = queue();
  const pos = new Map();
  for (const [slug, sec] of Object.entries(q)) sec.rows.forEach((r, i) => r.exp && pos.set(r.exp, { slug, order: i + 1 }));
  return experiments().filter((e) => e.status !== "other").map((e) => ({
    ...summary(e), handle: cfg[e.fm.account]?.handle || null, queue: pos.get(e.id) || null, mtime: e.mtime,
  }));
}

// ---- Page compte : réglages, file ordonnée avec dates d'envoi prévues, historique ----
const DAY = 864e5;
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export function accountDetail(slug) {
  const cfg = accountsConfig().accounts[slug];
  if (!cfg) return null;
  const acc = accounts().find((a) => a.slug === slug);
  const q = accountQueue(slug);
  const due = dailyDue(), now = new Date();
  const tonight = dailyPlan().plan?.items?.find((i) => i.slug === slug) || null;
  // Une créa par soir, dans l'ordre de la file, parmi les créas rendues ET validées ; rien si le compte n'envoie pas
  const blocked = cfg.paused ? "compte en pause" : !acc.connected ? "compte non relié au fournisseur d'envoi" : !due.enabled ? "envoi du soir désactivé" : null;
  let d = due.next ? new Date(due.next) : null;
  if (d && tonight?.status === "sent" && sameDay(d, now)) d = new Date(d.getTime() + DAY);
  const rows = q.rows.map((r) => {
    const e = r.exp_data;
    const sendable = !!(e && e.status === "ready" && e.validation === "validated" && !r.wrong_account);
    let send_at = null;
    if (sendable && !blocked && d) { send_at = d.toISOString(); d = new Date(d.getTime() + DAY); }
    return { ...r, sendable, send_at };
  });
  const mine = experiments().filter((e) => e.fm.account === slug);
  const history = mine.filter((e) => e.status === "drafted" || e.status === "published").map(summary)
    .sort((a, b) => String(b.published_at || b.draft_sent_at || "").localeCompare(String(a.published_at || a.draft_sent_at || "")));
  const lf = path.join(CONTENT_ROOT, "08_ACCOUNTS", slug, "LEARNINGS.md");
  const learnings = fs.existsSync(lf) ? { file: rel(lf), updated: fmValue(readFrontmatter(lf).updated) || null, md: fs.readFileSync(lf, "utf8").replace(/^---[\s\S]*?---\n*/, "") } : { file: rel(lf), updated: null, md: null };
  const feedback_pending = mine.reduce((n, e) => n + e.comments.filter((c) => !c.done).length, 0);
  return {
    account: acc, blocked, daily: due, tonight, learnings, feedback_pending,
    settings: { handle: cfg.handle, device: cfg.device || null, role: cfg.role || null, icp: cfg.icp || null, da: cfg.da || null, carousel_description: cfg.carousel_description || "", note: cfg.note || "" },
    queue: { ...q, rows },
    history,
  };
}

// ---- Page Agent : timers systemd du dépôt (deploy/systemd), routines cloud (deploy/routines), envoi du soir ----
const DEPLOY = path.join(CONTENT_ROOT, "deploy");
const iniGet = (txt, key) => [...txt.matchAll(new RegExp(`^${key}=(.*)$`, "gm"))].map((m) => m[1].trim());
const WD = { Mon: "lundi", Tue: "mardi", Wed: "mercredi", Thu: "jeudi", Fri: "vendredi", Sat: "samedi", Sun: "dimanche" };
const WD_N = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const hhmm = (h, m = 0) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
function humanCalendar(cal) {
  if (!cal) return null;
  let m;
  if ((m = cal.match(/^\*-\*-\* \*:00\/(\d+):00/))) return `toutes les ${Number(m[1])} min`;
  if ((m = cal.match(/^\*-\*-\* \*:(\d\d):00/))) return `toutes les heures à :${m[1]}`;
  if ((m = cal.match(/^(\w{3}) \*-\*-\* (\d\d):(\d\d)/))) return `${WD[m[1]] || m[1]} à ${m[2]}:${m[3]}`;
  if ((m = cal.match(/^\*-\*-\* (\d\d):(\d\d)/))) return `tous les jours à ${m[1]}:${m[2]}`;
  return cal;
}
export function agent() {
  const p = project(), due = dailyDue();
  const dir = path.join(DEPLOY, "systemd");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const units = files.filter((f) => f.endsWith(".service")).map((f) => {
    const name = f.replace(/\.service$/, ""), task = name.replace(/^content-/, "");
    const svc = fs.readFileSync(path.join(dir, f), "utf8");
    const timerFile = path.join(dir, `${name}.timer`);
    const timer = fs.existsSync(timerFile) ? fs.readFileSync(timerFile, "utf8") : null;
    const calendar = timer ? iniGet(timer, "OnCalendar")[0] || null : null;
    // Heures réelles : install.sh réécrit les timers d'après project.json ; l'envoi du soir lit project.json à chaque passage
    let when = timer ? humanCalendar(calendar) : "service permanent";
    if (task === "daily-drafts") when = due.enabled ? `tous les jours à ${hhmm(due.hour, due.minute)}` : "désactivé";
    if (task === "daily-stats") when = `tous les jours à ${hhmm(p.stats_hour ?? 7)}`;
    if (task === "weekly-veille") when = `${WD_N[p.weekly_veille?.weekday ?? 1]} à ${hhmm(p.weekly_veille?.hour ?? 6)}`;
    const how = svc.split("\n").filter((l) => l.startsWith("# ")).map((l) => l.slice(2)).join(" ");
    const exec = [...iniGet(svc, "ExecCondition"), ...iniGet(svc, "ExecStartPre"), ...iniGet(svc, "ExecStart")]
      .map((c) => c.replace(/^-/, "").replace(/\/home\/\w+\/app\//g, "").replace(/\/usr\/bin\/flock -w \d+ \S+ /, "").replace(/\/usr\/bin\/(bash|node) /, "$1 "));
    return {
      name, task, description: iniGet(svc, "Description")[0]?.replace(/^Content - /, "") || name, how, exec, calendar, when,
      editable: task === "daily-drafts", persistent: timer ? /^Persistent=true/m.test(timer) : null,
      status: timer || task === "dashboard" ? schedulerStatus(task) : { installed: null },
    };
  });
  const rdir = path.join(DEPLOY, "routines");
  const routines = (fs.existsSync(rdir) ? fs.readdirSync(rdir) : []).filter((f) => f.endsWith(".md") && f !== "README.md").map((f) => {
    const fm = Object.fromEntries(Object.entries(readFrontmatter(path.join(rdir, f))).map(([k, v]) => [k, unq(v)]));
    return { file: `deploy/routines/${f}`, name: fm.name?.replace(/^routine-/, "") || f, description: (fm.description || "").replace(/^Prompt auto-suffisant de la routine cloud « [^»]+ » — /, ""), schedule: fm.schedule || null, model: fm.model || null, parameters: fm.parameters || null };
  });
  const feedback_pending = experiments().reduce((n, e) => n + e.comments.filter((c) => !c.done).length, 0);
  const retouch_pending = experiments().filter((e) => e.validation === "retouch").length;
  return { platform: process.platform, timezone: p.timezone, daily: due, units, routines, feedback_pending, retouch_pending, plan: dailyPlan(), notify_channel: env("NOTIFY_CHANNEL", "stdout"), dry_run: env("DAILY_DRY_RUN") === "1" };
}

// ---- Carrousel éditable depuis la validation : spec FORMAT-02 carrousel (photo de couverture + paires opinion / score) ----
// La spec (champ `spec` de la fiche) est la source ; les slides se re-rendent avec scripts/carousel.py (actions.editCarousel).
export function carouselInfo(e) {
  if (e.fm.rendition !== "carrousel") return null;
  const specRel = specOf(e.id, e.fm);
  if (!specRel) return null;
  const file = path.join(CONTENT_ROOT, specRel);
  let spec; try { spec = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
  const ok = spec.cover?.photo && Array.isArray(spec.slides) && spec.slides.every((x) => x.text && x.pct != null);
  if (!ok) return { spec: specRel, editable: false };
  const cover = path.resolve(path.dirname(file), spec.cover.photo);
  return { spec: specRel, editable: true, cover: { path: rel(cover), url: fs.existsSync(cover) ? mediaUrl(cover) : null, name: path.basename(cover) }, opinions: spec.slides.map((x, i) => ({ i, text: x.text, pct: x.pct })) };
}

// Version « avec voix » à proposer ? F01 (POV) ou F04 avec spec : "possible", "en cours" (demandée, rendu pas encore là) ou false
function voicePossible(e) {
  if (e.variants || !/FORMAT-0?[14]$/.test(e.fm.format || "") || !/\.(mp4|mov)$/i.test(e.fm.media_file || "")) return false;
  const spec = specOf(e.id, e.fm); if (!spec) return false;
  try { return wantsVoice(JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, spec), "utf8"))) ? "en cours" : "possible"; } catch { return false; }
}

// ---- Formats : matrice rendu × compte et page d'un gabarit ----
export function gabaritsMatrix() {
  // comptes actifs d'abord, comptes en pause à droite de la matrice (ordre de accounts.json conservé dans chaque groupe)
  const accs = Object.entries(accountsConfig().accounts).map(([slug, a]) => ({ slug, handle: a.handle, paused: !!a.paused })).sort((x, y) => x.paused - y.paused);
  const exps = experiments();
  const cell = (key, slug) => {
    const id = `${key}.${slug}`, g = gabarit(id), mine = exps.filter((e) => e.gabarit === id);
    return { id, exists: !!g, status: g?.status || null, version: g?.version ?? null, pilots: g?.pilots || [], comments_pending: g ? g.comments.filter((c) => !c.done).length : 0,
      creas: mine.length, frozen: mine.filter((e) => e.frozen).length, validated: mine.filter((e) => e.validation === "validated" && e.status === "ready").length };
  };
  return { accounts: accs, rendus: G.RENDUS, cells: G.RENDUS.flatMap((r) => accs.map((a) => cell(r.key, a.slug))), statuses: G.STATUSES };
}
export function gabaritDetail(id) {
  const g = gabarit(id);
  if (!g) return null;
  const creas = experiments().filter((e) => e.gabarit === id).map(summary);
  const pilots = g.pilots.map((p) => { const e = experiment(p); return e ? summary(e) : { id: p, missing: true }; });
  const learn = path.join(CONTENT_ROOT, "08_ACCOUNTS", g.fm.account || "", "LEARNINGS.md");
  return { ...g, pilots_data: pilots, creas, learnings_file: fs.existsSync(learn) ? rel(learn) : null };
}

// ---- Page d'un format (onglet Formats → FORMAT-0x) : fiche, gabarits, créas et leurs stats, sources de veille ----
const FORMATS_DIR = path.join(CONTENT_ROOT, "03_LIBRARY", "formats");
const VEILLE = path.join(CONTENT_ROOT, "02_VEILLE");
const listOf = (v) => String(v || "").replace(/^\[|\]$/g, "").split(",").map((x) => x.trim()).filter(Boolean);
// « {views: 865, likes: 3, …} » (frontmatter des fiches) → objet de nombres (null gardé)
const metricsOf = (v) => { if (!v) return null; const o = {}; for (const m of String(v).matchAll(/(\w+):\s*(null|-?[\d.]+)/g)) o[m[1]] = m[2] === "null" ? null : Number(m[2]); return Object.values(o).some((x) => x !== null) ? o : null; };
export function formats() {
  if (!fs.existsSync(FORMATS_DIR)) return [];
  return fs.readdirSync(FORMATS_DIR).filter((f) => /^FORMAT-\d+.*\.md$/.test(f)).sort().map((f) => {
    const fm = Object.fromEntries(Object.entries(readFrontmatter(path.join(FORMATS_DIR, f))).map(([k, v]) => [k, unq(v)]));
    return { id: fm.id || f.match(/^FORMAT-\d+/)[0], name: fm.name || null, title: fm.title || null, status: fm.status || null, validated_on: fm.validated_on || null, file: `03_LIBRARY/formats/${f}` };
  });
}
export function formatDetail(id) {
  const f = fs.existsSync(FORMATS_DIR) && fs.readdirSync(FORMATS_DIR).find((x) => x.startsWith(id + "-") && x.endsWith(".md"));
  if (!f) return null;
  const file = path.join(FORMATS_DIR, f), raw = readFrontmatter(file);
  const fm = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, unq(v)]));
  const body = fs.readFileSync(file, "utf8").replace(/^---[\s\S]*?---\n*/, "");
  const sources = listOf(fm.sources).map((key) => {
    const vf = path.join(VEILLE, "videos", `${key}.md`);
    const v = fs.existsSync(vf) ? Object.fromEntries(Object.entries(readFrontmatter(vf)).map(([k, x]) => [k, unq(x)])) : null;
    const thumb = ["hooks", ""].map((d) => path.join(VEILLE, "assets", d, `${key}.jpg`)).find((p) => fs.existsSync(p));
    return { key, file: v ? rel(vf) : null, url: v?.url || null, author: v?.author || null, type: v?.type || null, views: Number(v?.views) || null, likes: Number(v?.likes) || null, shares: Number(v?.shares) || null, comments: Number(v?.comments) || null, outlier: Number(v?.outlier_score) || null, posted_at: v?.posted_at || null, decision: v?.decision || null, thumb: thumb ? mediaUrl(thumb) : null };
  });
  const creas = experiments().filter((e) => e.fm.format === id).map((e) => ({ ...summary(e), rendition: e.fm.rendition || null, d3: metricsOf(e.fm.metrics_d3), d7: metricsOf(e.fm.metrics_d7), verdict: e.fm.verdict || null }));
  const m = gabaritsMatrix(), keys = G.RENDUS.filter((r) => r.format === id).map((r) => r.key);
  const views = creas.map((c) => c.d3?.views).filter((x) => typeof x === "number").sort((a, b) => a - b);
  return {
    id, file: rel(file), fm, body, sources, creas,
    rendus: G.RENDUS.filter((r) => r.format === id), accounts: m.accounts, cells: m.cells.filter((c) => keys.includes(c.id.split(".")[0])),
    stats: { total: creas.length, validated: creas.filter((c) => c.validation === "validated" && c.status === "ready").length, frozen: creas.filter((c) => c.frozen).length, sent: creas.filter((c) => c.status === "drafted").length, published: creas.filter((c) => c.status === "published").length, measured: views.length, median_views_d3: views.length ? views[Math.floor(views.length / 2)] : null, best_views_d3: views.at(-1) ?? null },
  };
}
