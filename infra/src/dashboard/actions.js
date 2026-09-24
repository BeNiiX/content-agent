// Actions du tableau de bord : flags des comptes (config/accounts.json), marquage « posté », lancement des scripts
// existants en arrière-plan (journal dans data/dashboard/runs/), dépôt d'assets dans 07_ASSETS.
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { CONTENT_ROOT, DATA, INFRA_ROOT, CONFIG } from "../lib/paths.js";
import { readJson, writeJson, today } from "../lib/fs.js";
import { ASSETS, EXPS } from "./state.js";
import { setFrontmatter, fmValue } from "../lib/md.js";
import { appendFeedback } from "../publish/feedback.js";
import { voicePath, VARIANTS } from "../lib/variants.js";
import { specOf } from "../lib/specs.js";
import * as G from "../lib/gabarits.js";
import { experiment } from "./state.js";
import { PROJECT_FILE } from "../lib/project.js";
import * as Q from "../calendar/queue-edit.js";

const RUNS_DIR = path.join(DATA, "dashboard", "runs");
const PATH_ENV = `${process.env.HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`;

// ---- Flags des comptes ----
// paused            : plus aucun envoi de brouillon (daily-plan.js et tiktok-draft.js le respectent déjà : « compte en pause »)
// production_paused : l'agent ne produit plus de contenu pour ce compte (lu par l'agent, règle dans CLAUDE.md)
export function setAccountFlags(slug, patch) {
  const file = path.join(CONFIG, "accounts.json");
  const cfg = readJson(file);
  if (!cfg?.accounts?.[slug]) throw new Error(`compte ${slug} inconnu`);
  const a = cfg.accounts[slug];
  const stamp = new Date().toISOString();
  if (typeof patch.paused === "boolean") { a.paused = patch.paused; a.paused_at = patch.paused ? stamp : null; }
  if (typeof patch.production_paused === "boolean") { a.production_paused = patch.production_paused; a.production_paused_at = patch.production_paused ? stamp : null; }
  // Réglages texte de la page compte (description fixe des carrousels, note libre)
  if (typeof patch.carousel_description === "string") a.carousel_description = patch.carousel_description.trim().slice(0, 150);
  if (typeof patch.note === "string") a.note = patch.note.trim() || null;
  writeJson(file, cfg);
  return a;
}

// ---- Marquer une fiche comme postée (l'humain a publié depuis l'app) ----
export function markPosted(exp, postUrl) {
  if (!/^EXP-\d+$/.test(exp)) throw new Error("identifiant EXP invalide");
  const args = [path.join(INFRA_ROOT, "src", "publish", "mark-draft.js"), exp, "--posted"];
  if (postUrl) args.push("--post-url", postUrl);
  const r = spawnSync(process.execPath, args, { cwd: INFRA_ROOT, encoding: "utf8" });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || "échec de mark-draft.js").trim());
  return r.stdout.trim();
}

// ---- Validation des créas (fiche EXP) ----
// decision : "validé" | "refusé" | null (remise en attente). Un refus exige un motif : l'agent le lit pour refaire la créa.
const expFile = (exp) => { if (!/^EXP-\d+$/.test(exp || "")) throw new Error("identifiant EXP invalide"); const f = path.join(EXPS, `${exp}.md`); if (!fs.existsSync(f)) throw new Error(`${exp} : fiche introuvable`); return f; };
export function setValidation(exp, decision, note) {
  const file = expFile(exp);
  if (!["validé", "refusé", "à retoucher", null].includes(decision)) throw new Error("décision = validé | refusé | à retoucher | null");
  const clean = typeof note === "string" ? note.trim() : "";
  if (decision === "à retoucher" && !clean) throw new Error("une retouche a besoin de la liste des changements à faire");
  const cur = experiment(exp);   // gel (03_LIBRARY/gabarits/README.md) : on ne décide pas d'une créa gelée ou d'un pilote ici
  if (decision && cur?.frozen) throw new Error(`créa gelée (${cur.reason}) : elle sera mise à jour selon la fiche du gabarit puis reviendra à valider`);
  if (decision && cur?.pilot) throw new Error(`pilote du gabarit ${cur.gabarit} : il se juge dans l'onglet Formats, avec la fiche`);
  if (decision === "validé") {   // deux versions : il faut d'abord choisir celle qui part
    const fm = readFrontmatterRaw(file), base = (fm.media_file || "").replace(/\s*\(.*\)$/, "").replace(/\/$/, "");
    if (voicePath(base) && fs.existsSync(path.resolve(CONTENT_ROOT, voicePath(base))) && !VARIANTS[fm.version]) throw new Error("choisis d'abord la version (brute ou avec voix)");
  }
  if (decision === "refusé" && !clean) throw new Error("un refus a besoin d'un motif (ce que l'agent doit corriger)");
  setFrontmatter(file, { validation: decision, validated_at: decision ? new Date().toISOString() : null, validation_note: clean || null, ...(decision === "à retoucher" ? { retouche_faite: null } : {}), updated: today() });
  if (decision === "refusé") appendFeedback(file, "avoid", `refus : ${clean}`);   // un refus est aussi un learning pour l'agent
  if (decision === "à retoucher") appendFeedback(file, "note", `retouche demandée : ${clean.replace(/\s*\n\s*/g, " ; ")}`);
  return { exp, validation: decision, note: clean || null };
}

// ---- Commentaire libre sur une créa (ce qui est bien / pas bien), synthétisé chaque jour en learnings par compte ----
export function addComment(exp, kind, text) { return { exp, comment: appendFeedback(expFile(exp), kind, text) }; }

// ---- Carrousel : photo de couverture (prise dans 07_ASSETS/photos) et ordre des opinions, puis nouveau rendu ----
// order = indices des opinions de la spec dans le nouvel ordre ; cover = chemin relatif au projet d'une photo rangée.
// Le rendu est immédiat (scripts/carousel.py, Pillow, ~2 s) et enregistré dans data/render/state.json pour que
// render-pending.js (VPS) ne le refasse pas. La validation de la créa n'est pas remise à zéro : c'est l'humain qui modifie.
export function editCarousel(exp, { order, cover } = {}) {
  const file = expFile(exp);
  const fm = Object.fromEntries(Object.entries(readFrontmatterRaw(file)));
  const specRel = fm.rendition === "carrousel" ? specOf(exp, fm) : null;
  if (!specRel) throw new Error(`${exp} n'est pas un carrousel avec spec`);
  const specFile = path.join(CONTENT_ROOT, specRel);
  const spec = JSON.parse(fs.readFileSync(specFile, "utf8"));
  if (Array.isArray(order)) {
    const n = spec.slides.length;
    if (order.length !== n || [...order].sort((a, b) => a - b).some((v, i) => v !== i)) throw new Error("ordre invalide (permutation des opinions attendue)");
    spec.slides = order.map((i) => spec.slides[i]);
  }
  let photoName = null;
  if (cover) {
    const abs = path.resolve(CONTENT_ROOT, cover), root = path.join(ASSETS, "photos") + path.sep;
    if (!abs.startsWith(root) || abs.includes(`${path.sep}_`) || !/\.(jpe?g|png|webp)$/i.test(abs) || !fs.existsSync(abs)) throw new Error("photo : choisir une photo rangée de 07_ASSETS/photos/<thème>/");
    spec.cover = { ...spec.cover, photo: path.relative(path.dirname(specFile), abs) };
    photoName = path.basename(abs);
  }
  const raw = JSON.stringify(spec, null, 2) + "\n";
  const before = fs.readFileSync(specFile, "utf8");
  fs.writeFileSync(specFile, raw);
  const py = fs.existsSync(path.join(INFRA_ROOT, ".venv", "bin", "python")) ? path.join(INFRA_ROOT, ".venv", "bin", "python") : "python3";
  const r = spawnSync(py, [path.join(INFRA_ROOT, "scripts", "carousel.py"), specFile], { cwd: INFRA_ROOT, encoding: "utf8", timeout: 120_000 });
  if (r.status !== 0) { fs.writeFileSync(specFile, before); throw new Error(`rendu impossible, spec restaurée : ${(r.stderr || r.stdout || "").trim().split("\n").pop()}`); }
  const stateFile = path.join(DATA, "render", "state.json");
  const st = readJson(stateFile, { rendered: {} }) || { rendered: {} };
  st.rendered[path.relative(CONTENT_ROOT, specFile)] = { hash: crypto.createHash("sha1").update(raw).digest("hex"), out: path.relative(CONTENT_ROOT, path.resolve(path.dirname(specFile), spec.out)), rendered_at: new Date().toISOString(), kind: "carousel", by: "dashboard" };
  writeJson(stateFile, st);
  const patch = { updated: today() };
  if (photoName) patch.photo = photoName;
  if (Array.isArray(order)) { patch.pct_agree = spec.slides.map((x) => x.pct_agree ?? x.pct); if (spec.slides.every((x) => x.opinion_id)) patch.opinion_ids = spec.slides.map((x) => x.opinion_id); }
  setFrontmatter(file, patch);
  return { exp, rendered: r.stdout.trim(), cover: photoName, order: spec.slides.map((x) => x.text) };
}
const readFrontmatterRaw = (file) => { const m = fs.readFileSync(file, "utf8").match(/^---\n([\s\S]*?)\n---/); const out = {}; for (const l of (m?.[1] || "").split("\n")) { const k = l.match(/^([\w-]+):\s*(.*)$/); if (k) out[k[1]] = fmValue(k[2]); } return out; };

// ---- Créas à deux versions (brute / avec voix) ----
export function setVariant(exp, choice) {
  if (!VARIANTS[choice]) throw new Error("version = brut | voix");
  setFrontmatter(expFile(exp), { version: choice, updated: today() });
  return { exp, version: choice };
}
// Demande la version avec voix : `variants` dans la spec, puis rendu en arrière-plan (render-pending --only, ~10-60 s).
// La validation repasse en attente : il y a une nouvelle version à écouter et à choisir.
export function enableVoice(exp) {
  const file = expFile(exp), fm = readFrontmatterRaw(file), specRel = specOf(exp, fm);
  if (!specRel) throw new Error(`${exp} : spec de rendu introuvable, impossible de générer une autre version`);
  if (!/FORMAT-0?[14]$/.test(fm.format || "")) throw new Error("version avec voix : formats F01 (POV) et F04 seulement");
  const specFile = path.join(CONTENT_ROOT, specRel), spec = JSON.parse(fs.readFileSync(specFile, "utf8"));
  if (!spec.variants?.includes("voix")) { spec.variants = ["brut", "voix"]; fs.writeFileSync(specFile, JSON.stringify(spec, null, 2) + "\n"); }
  setFrontmatter(file, { validation: null, validated_at: null, version: null, updated: today() });
  return { exp, run: startRun("render-spec", ["--only", specRel]) };
}

// ---- Textes de la créa modifiables avant envoi ----
// tiktok_title (titre tapé dans l'app pour un carrousel), front_page_text (texte natif), sound → frontmatter ;
// caption → ligne « Caption : « … » » du corps de la fiche (source prioritaire de tiktok-draft.js).
export function editTexts(exp, fields = {}) {
  const file = expFile(exp);
  const fm = {};
  for (const k of ["tiktok_title", "front_page_text", "sound"]) if (typeof fields[k] === "string") fm[k] = fields[k].trim() || null;
  if (typeof fields.caption === "string") {
    const text = fields.caption.trim().replace(/\s*\n\s*/g, " ");
    const src = fs.readFileSync(file, "utf8");
    const i = src.indexOf("\n---", 4) + 4;   // fin du frontmatter
    const head = src.slice(0, i), body = src.slice(i);
    const re = /^((?!#)[^\n]*Caption\s*:\s*«\s*)(.+?)(\s*»)/m;
    const next = !text ? body.replace(re, "") : re.test(body) ? body.replace(re, (_, a, _b, c) => a + text + c) : body.replace(/^(#\s+.+)$/m, `$1\n\nCaption : « ${text} »`);
    fs.writeFileSync(file, head + next);
  }
  if (Object.keys(fm).length || typeof fields.caption === "string") setFrontmatter(file, { ...fm, updated: today() });
  return { exp, updated: Object.keys(fields) };
}

// ---- Heure de l'envoi du soir (config/project.json, lue par src/publish/due.js à chaque passage du timer) ----
export function setDailySchedule({ hour, minute, enabled } = {}) {
  const p = readJson(PROJECT_FILE) || {};
  if (hour !== undefined) { const h = Number(hour); if (!Number.isInteger(h) || h < 0 || h > 23) throw new Error("heure entre 0 et 23"); p.daily_hour = h; }
  if (minute !== undefined) { const m = Number(minute); if (!Number.isInteger(m) || m < 0 || m > 55 || m % 5) throw new Error("minutes par pas de 5 (le timer passe toutes les 5 min)"); p.daily_minute = m; }
  if (typeof enabled === "boolean") p.daily_enabled = enabled;
  writeJson(PROJECT_FILE, p);
  return { daily_hour: p.daily_hour, daily_minute: p.daily_minute ?? 0, daily_enabled: p.daily_enabled !== false };
}

// ---- File d'attente : ordre d'envoi (06_CALENDAR/QUEUE.md) ----
// moveQueueRow : « passer en tête », « monter », « descendre », « mettre à la fin » ou une place précise.
// interleaveQueue : réordonne les fiches en attente pour alterner les concepts (pas deux fois le même format d'affilée).
// Les lignes déjà envoyées ou publiées ne bougent jamais.
export function moveQueueRow(account, exp, to) {
  if (!/^EXP-\d+$/.test(exp || "")) throw new Error("identifiant EXP invalide");
  return Q.moveRow(account, exp, to);
}
// Ordre complet après un glisser-déposer (liste des EXP non verrouillées, dans l'ordre voulu)
export function setQueueOrder(account, order) {
  if (!Array.isArray(order) || order.some((e) => !/^EXP-\d+$/.test(e))) throw new Error("ordre = liste d'identifiants EXP");
  return Q.applyOrder(account, order);
}
export function addToQueue(account, exp) {
  expFile(exp);
  return Q.addRow(account, exp);
}
export function interleaveQueue(account, dry = false) {
  return Q.interleave(account, { apply: !dry });
}

// ---- Scripts lançables (liste fermée) ----
export const SCRIPTS = {
  "daily-plan": { label: "Recalculer le plan du soir", cmd: process.execPath, args: ["src/publish/daily-plan.js"], desc: "Relit QUEUE.md et les fiches, réécrit data/publish/daily/<date>.json (les envois déjà faits sont conservés)" },
  "daily-drafts-dry": { label: "Envoi du soir — test à blanc", cmd: "/bin/bash", args: ["scripts/daily-drafts.sh", "--dry-run"], desc: "Plan + message de consignes, sans rien envoyer" },
  "daily-drafts": { label: "Envoyer les brouillons maintenant", cmd: "/bin/bash", args: ["scripts/daily-drafts.sh"], desc: "1 brouillon TikTok par compte actif (plan + envoi via PUBLISH_BACKEND), puis message", confirm: true },
  "daily-notify": { label: "Renvoyer le message de consignes", cmd: process.execPath, args: ["src/publish/daily-notify.js"], desc: "Recompose le message du soir depuis le plan du jour et l'envoie (NOTIFY_CHANNEL)" },
  "photos-inbox": { label: "Préparer les photos déposées", cmd: path.join(INFRA_ROOT, ".venv", "bin", "python"), args: ["scripts/photos-inbox.py"], desc: "HEIC/PNG → JPG, planche contact, _triage.json à compléter par l'agent" },
  "photos-inbox-apply": { label: "Ranger les photos triées", cmd: path.join(INFRA_ROOT, ".venv", "bin", "python"), args: ["scripts/photos-inbox.py", "--apply"], desc: "Renomme et range par thème selon _triage.json, met à jour PHOTOS.md" },
  "daily-stats": { label: "Relevé des comptes", cmd: "/bin/bash", args: ["scripts/daily-stats.sh"], desc: "Stats publiques de chaque compte (yt-dlp) → STATS.md, digest" },
  "queue-order": { label: "Alterner les concepts dans toutes les files", cmd: process.execPath, args: ["src/calendar/queue-order.js", "--interleave"], desc: "Réordonne les fiches en attente de chaque compte pour ne pas envoyer deux fois le même format d'affilée (QUEUE.md)" },
  "render-spec": { label: "Rendre une créa", cmd: process.execPath, args: ["src/produce/render-pending.js"], desc: "Rend une spec précise (lancé depuis la validation : version avec voix)", hidden: true },
  "doctor": { label: "Vérifier l'environnement", cmd: process.execPath, args: ["src/doctor.js"], desc: "Outils, .env, état des données" },
};

const runs = new Map();
let seq = 0;
export function listRuns() { return [...runs.values()].map(pub).sort((a, b) => b.started_at.localeCompare(a.started_at)); }
export function getRun(id) { const r = runs.get(id); return r ? { ...pub(r), log: r.log } : null; }
const pub = (r) => ({ id: r.id, script: r.script, label: r.label, started_at: r.started_at, finished_at: r.finished_at, code: r.code, running: r.code === null, log_tail: r.log.slice(-1500), log_file: path.relative(CONTENT_ROOT, r.log_file) });

export function startRun(script, extraArgs = []) {
  const def = SCRIPTS[script];
  if (!def) throw new Error(`script inconnu : ${script}`);
  const busy = [...runs.values()].find((r) => r.script === script && r.code === null);
  if (busy) throw new Error(`${def.label} est déjà en cours (${busy.id})`);
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const id = `${today()}-${String(++seq).padStart(3, "0")}-${script}`;
  const log_file = path.join(RUNS_DIR, `${id}.log`);
  const env = { ...process.env, PATH: PATH_ENV };
  delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT;   // un `claude -p` lancé par un script (daily-stats.sh, WEEKLY_CLAUDE=1) refuse de tourner dans une session Claude Code
  const child = spawn(def.cmd, [...def.args, ...extraArgs], { cwd: INFRA_ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  const run = { id, script, label: def.label, started_at: new Date().toISOString(), finished_at: null, code: null, log: "", log_file, child };
  const append = (chunk) => { run.log = (run.log + chunk).slice(-200_000); fs.appendFileSync(log_file, chunk); };
  fs.writeFileSync(log_file, `$ ${[def.cmd, ...def.args, ...extraArgs].join(" ")}\n`);
  child.stdout.on("data", append); child.stderr.on("data", append);
  child.on("close", (code) => { run.code = code ?? -1; run.finished_at = new Date().toISOString(); append(`\n[fin, code ${run.code}]\n`); });
  child.on("error", (e) => { append(`\n[erreur : ${e.message}]\n`); run.code = -1; run.finished_at = new Date().toISOString(); });
  runs.set(id, run);
  return pub(run);
}

// ---- Dépôt d'assets ----
// Tout fichier déposé est inscrit « à traiter » dans 07_ASSETS/A_TRAITER.md (une case par fichier) : l'agent le range,
// le catalogue (PHOTOS.md, SCREENS.md, opinions.json) puis coche la case. Le tableau de bord affiche « à traiter » d'ici là.
export const TODO_FILE = path.join(ASSETS, "A_TRAITER.md");
export function markTodo(absPath, kind, originalName) {
  if (!fs.existsSync(TODO_FILE)) fs.writeFileSync(TODO_FILE, `---\nname: assets-a-traiter\ndescription: Fichiers déposés depuis le tableau de bord, à ranger et cataloguer par l'agent (cocher [x] une fois fait, avec le chemin final)\ntype: index\n---\n\n# Assets à traiter\n\nUne ligne par dépôt. L'agent range le fichier (photos : \`scripts/photos-inbox.py\` ; vidéos de \`07_ASSETS/_inbox/\` : \`screen-records/<thème>/\` + SCREENS.md + opinions.json, ou \`rushes/\`), puis coche la case et note le chemin final après « → ».\n\n`);
  const d = new Date(), pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const type = /\.(mp4|mov|webm|m4v)$/i.test(absPath) ? "vidéo" : "image";
  fs.appendFileSync(TODO_FILE, `- [ ] ${stamp} · ${type} (${kind}) · \`${path.relative(CONTENT_ROOT, absPath)}\`${originalName && originalName !== path.basename(absPath) ? ` · déposé sous le nom ${originalName}` : ""}\n`);
}
// photo  → 07_ASSETS/photos/_inbox/<nom>          (puis « Préparer les photos déposées » → tri par l'agent)
// screen → 07_ASSETS/screen-records/<theme>/<theme>-<date>-S<n>.<ext>   (l'agent complète SCREENS.md + opinions.json)
// rush   → 07_ASSETS/rushes/<nom>                (l'agent renomme reaction-<qui>-<lieu>-<fichier>)
export function uploadTarget({ kind, name, theme, index }) {
  const safe = String(name || "").split(/[\\/]/).pop().replace(/[^\w.\-]+/g, "_").replace(/^_+/, "");
  if (!safe || safe.startsWith(".")) throw new Error("nom de fichier invalide");
  const ext = path.extname(safe).toLowerCase();
  const isImg = /\.(jpe?g|png|webp|heic|heif|tiff?)$/.test(ext), isVid = /\.(mp4|mov|webm|m4v)$/.test(ext);
  let dir, file;
  if (kind === "photo") { if (!isImg) throw new Error(`${safe} : image attendue (jpg, png, heic, webp)`); dir = path.join(ASSETS, "photos", "_inbox"); file = safe; }
  // boîte de dépôt : images → photos/_inbox (tri par photos-inbox.py), vidéos → 07_ASSETS/_inbox (l'agent les range en screen-record ou rush)
  else if (kind === "inbox") { if (!isImg && !isVid) throw new Error(`${safe} : image ou vidéo attendue`); dir = isImg ? path.join(ASSETS, "photos", "_inbox") : path.join(ASSETS, "_inbox"); file = safe; }
  else if (kind === "screen") {
    if (!isVid) throw new Error(`${safe} : vidéo attendue (mp4, mov)`);
    const t = String(theme || "").toLowerCase().replace(/[^a-z0-9-]/g, ""); if (!t) throw new Error("thème requis (societe, couple, sport…)");
    dir = path.join(ASSETS, "screen-records", t); file = `${t}-${today()}-S${Number(index) || 1}${ext}`;
  } else if (kind === "rush") { if (!isVid) throw new Error(`${safe} : vidéo attendue`); dir = path.join(ASSETS, "rushes"); file = safe; }
  else throw new Error("kind = photo | inbox | screen | rush");
  fs.mkdirSync(dir, { recursive: true });
  let dest = path.join(dir, file), n = 2;
  while (fs.existsSync(dest)) { dest = path.join(dir, file.replace(/(\.[^.]+)$/, `-${String(n++).padStart(2, "0")}$1`)); }
  return dest;
}

// ---- Révéler un fichier dans le Finder (macOS seulement ; le front masque le bouton ailleurs via /api/state → platform) ----
export function reveal(relPath) {
  if (process.platform !== "darwin") throw new Error("révéler dans le Finder : non disponible sur ce système (macOS seulement)");
  const abs = path.resolve(CONTENT_ROOT, relPath);
  if (!abs.startsWith(CONTENT_ROOT + path.sep) || !fs.existsSync(abs)) throw new Error("chemin hors projet ou introuvable");
  const child = spawn("open", ["-R", abs], { stdio: "ignore", detached: true });
  child.on("error", () => {});   // jamais d'exception non rattrapée qui ferait tomber le serveur
  child.unref();
  return abs;
}

// ---- Gabarits (onglet Formats) ----
// décision : "validé" (fiche figée en vN, pilotes → à valider en vN), "à retoucher" (liste des changements, un par ligne),
// "non pertinent", "à prototyper" (réactiver). Les retours alimentent la routine gabarits-quotidien.
export function setGabaritDecision(id, decision, note) {
  const g = G.read(id);
  if (!g) throw new Error(`gabarit ${id} introuvable`);
  const clean = typeof note === "string" ? note.trim() : "";
  const file = G.fileOf(id), stamp = today();
  if (decision === "validé") {
    if (!["pilotes en revue", "évolution proposée", "à retoucher"].includes(g.status)) throw new Error(`gabarit ${g.status} : rien à valider (il faut une fiche et des pilotes en revue)`);
    if (g.status !== "évolution proposée" && g.pilots.length < 1) throw new Error("pas de pilote à juger : la fiche doit être prototypée d'abord");
    const version = g.status === "évolution proposée" ? g.version + 1 : Math.max(1, g.version + (g.version ? 1 : 0));
    setFrontmatter(file, { status: "validé", version, validated_at: new Date().toISOString(), validation_note: null, updated: stamp });
    let src = fs.readFileSync(file, "utf8");
    src = src.replace(/(## Historique des versions\s*\n)/, `$1\n- v${version} · ${stamp} · validé par l'humain${g.status === "évolution proposée" ? " (évolution)" : ""}${g.pilots.length ? ` · références : ${g.pilots.join(", ")}` : ""}\n`);
    if (g.status === "évolution proposée") src = src.replace(/(## Évolution proposée\s*\n)[\s\S]*?(?=\n## |$)/, `$1\n(vide tant qu'aucune évolution n'est proposée)\n`);
    fs.writeFileSync(file, src);
    // les pilotes deviennent des créas conformes vN, à valider (une décision déjà prise sur l'un d'eux est conservée)
    for (const p of g.pilots) { try { const f = expFile(p), done = /^valid/i.test(readFrontmatterRaw(f).validation || ""); setFrontmatter(f, { gabarit_version: version, ...(done ? {} : { validation: null, validated_at: null }), updated: stamp }); } catch { } }
    return { id, status: "validé", version };
  }
  if (decision === "à retoucher") {
    if (!clean) throw new Error("liste les changements à faire sur la fiche ou les pilotes, un par ligne");
    setFrontmatter(file, { status: "à retoucher", validation_note: clean, updated: stamp });
    appendFeedback(file, "note", `retouche demandée : ${clean.replace(/\s*\n\s*/g, " ; ")}`);
    return { id, status: "à retoucher" };
  }
  if (decision === "non pertinent" || decision === "à prototyper") { setFrontmatter(file, { status: decision, updated: stamp }); return { id, status: decision }; }
  throw new Error("décision = validé | à retoucher | non pertinent | à prototyper");
}
export function addGabaritComment(id, kind, text) {
  if (!G.read(id)) throw new Error(`gabarit ${id} introuvable`);
  return { id, comment: appendFeedback(G.fileOf(id), kind, text) };
}
export function createGabarit(id) { return { id, file: G.create(id, today()) }; }
