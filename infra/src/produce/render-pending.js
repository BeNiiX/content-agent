// Rend les specs en attente : parcourt 08_ACCOUNTS/*/specs/**/*.json et lance le bon outil de rendu pour chaque spec
// dont la sortie (`out`, relatif au dossier de la spec) manque, est incomplète, ou dont le contenu a changé depuis le
// dernier rendu. Conçu pour tourner sur le VPS (timer systemd content-render-pending, toutes les heures) après que les
// agents cloud ont poussé de nouvelles specs et que les médias sources (screen-records, rushs) ont été rsyncés.
//
// Usage : node src/produce/render-pending.js [--dry-run] [--account <slug>] [--format F01|F02|F03|F04] [--limit N]
//                                            [--force] [--mtime] [--no-mark] [--quiet] [--json]
//   --dry-run : liste ce qui serait rendu, ne lance rien, n'écrit ni état ni fiche
//   --json    : n'écrit sur stdout qu'un résumé JSON (specs, renderable, blocked, adopted, skipped, rendered, failed, items…) — pour doctor.js et le tableau de bord
//   --account : ne traite que ce compte (slug = dossier de 08_ACCOUNTS)
//   --format  : ne traite que ce format (F01 / F02 / F03 ou FORMAT-0x)
//   --limit   : au plus N rendus par passage (le reste attend le prochain timer)
//   --force   : rend même si la sortie existe et que la spec n'a pas changé
//   --mtime   : en plus de l'empreinte, considère « à rendre » une spec plus récente que sa sortie (attention : git ne
//               conserve pas les dates ; après un clone toutes les specs paraissent récentes)
//   --no-mark : ne passe pas les fiches EXP « à monter » en « prêt » après un rendu réussi
//   --only    : ne traite que cette spec (chemin relatif au projet) — lancé par le tableau de bord
//
// Deux versions (spec `variants: ["brut", "voix"]`, F01 et F04, src/lib/variants.js) : `out` = version brute, et la version
// avec voix générée est rendue à côté (<nom>.voix.mp4) ; l'humain choisit à la validation (champ `version` de la fiche).
//
// Détection du rendu (regarder les specs existantes de 08_ACCOUNTS/<slug>/specs/F01|F02|F03|F04) :
//   FORMAT-01 (ou `screen` + `segments`)              → node src/produce/pov.js <spec> --raw   (sans TTS : `say` n'existe pas sous Linux)
//   FORMAT-02 rendition carrousel (out = dossier)     → .venv/bin/python scripts/carousel.py <spec>
//   FORMAT-02 rendition video (out = .mp4, `slides`)  → .venv/bin/python scripts/series-video.py <spec>
//   FORMAT-03 (`mode` face | faceless)                → .venv/bin/python scripts/pie-video.py <spec>
//   FORMAT-04 (`countdown` ou `rule`, vidéo)          → .venv/bin/python scripts/partner-quiz-video.py <spec>   (avant F02 : même `cover` + `slides`) ; avec voix (`tts` ≠ false) : Mac seulement, ignorée ailleurs
//
// Pourquoi une empreinte plutôt que la date : git ne conserve pas les mtimes, donc après un clone ou un pull toutes les
// specs sont « plus récentes » que des sorties rsyncées. L'état (SHA-1 du contenu de chaque spec rendue) est dans
// infra/data/render/state.json. Au premier passage, une sortie déjà présente est adoptée telle quelle (empreinte
// enregistrée, pas de rendu). Journal : infra/data/render/<date>.log.
//
// Un asset source manquant (screen-record ou rush pas encore rsyncé, photo absente) est signalé et la spec est ignorée
// jusqu'au prochain passage ; ce n'est pas une erreur (code de sortie 0). Un rendu qui échoue → code de sortie 1.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { CONTENT_ROOT, INFRA_ROOT, DATA } from "../lib/paths.js";
import { args, readJson, writeJson, today } from "../lib/fs.js";
import { wantsVoice, voicePath, ttsFor } from "../lib/variants.js";

const a = args();
const DRY = !!a["dry-run"];
const JSON_OUT = !!a.json;
if (JSON_OUT) a.quiet = true;
const ACCOUNTS_DIR = path.join(CONTENT_ROOT, "08_ACCOUNTS");
const RENDER_DIR = path.join(DATA, "render");
const STATE_FILE = path.join(RENDER_DIR, "state.json");
const LOG_FILE = path.join(RENDER_DIR, `${today()}.log`);
const PY = fs.existsSync(path.join(INFRA_ROOT, ".venv", "bin", "python")) ? path.join(INFRA_ROOT, ".venv", "bin", "python") : "python3";
const SCRIPTS = path.join(INFRA_ROOT, "scripts");
const RENDER_TIMEOUT_MS = 20 * 60 * 1000;
const VIDEO_EXT = /\.(mp4|mov)$/i;

const lines = [];
function log(msg) {
  const line = `${new Date().toISOString().slice(11, 19)} ${msg}`;
  lines.push(line);
  if (!a.quiet) console.log(msg);
}
function flushLog() {
  if (DRY) return;
  fs.mkdirSync(RENDER_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, lines.join("\n") + "\n");
}

const rel = (p) => path.relative(CONTENT_ROOT, p);
const sha1 = (s) => crypto.createHash("sha1").update(s).digest("hex");
const normFormat = (f) => (f ? String(f).toUpperCase().replace(/^FORMAT-0?/, "F").replace(/^F(\d)$/, "F0$1") : null);

// ---- 1. Collecte des specs ----
function walkSpecs() {
  const out = [];
  if (!fs.existsSync(ACCOUNTS_DIR)) return out;
  for (const slug of fs.readdirSync(ACCOUNTS_DIR)) {
    if (slug.startsWith("_") || slug.startsWith(".")) continue;
    if (a.account && slug !== a.account) continue;
    const specsDir = path.join(ACCOUNTS_DIR, slug, "specs");
    if (!fs.existsSync(specsDir) || !fs.statSync(specsDir).isDirectory()) continue;
    const stack = [specsDir];
    while (stack.length) {
      const dir = stack.pop();
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (!e.name.startsWith(".") && !e.name.startsWith("_")) stack.push(p); continue; }
        if (!e.name.endsWith(".json") || e.name.endsWith(".plan.json") || e.name.startsWith("_") || e.name.startsWith(".")) continue;   // *.plan.json = sidecar des temps (F04)
        if (a.only && path.relative(CONTENT_ROOT, p) !== String(a.only).replace(/^\.\//, "")) continue;
        out.push({ slug, file: p });
      }
    }
  }
  return out.sort((x, y) => x.file.localeCompare(y.file));
}

// ---- 2. Classification : quel outil, quelle sortie, quels assets sources ----
function classify(item) {
  const raw = fs.readFileSync(item.file, "utf8");
  let spec;
  try { spec = JSON.parse(raw); } catch (e) { return { ...item, skip: `JSON invalide (${e.message})` }; }
  if (!spec || typeof spec !== "object" || !spec.out) return { ...item, skip: "pas de champ `out` : ce n'est pas une spec de rendu" };
  const base = path.dirname(item.file);
  const abs = (p) => (path.isAbsolute(p) ? p : path.resolve(base, p));
  const out = abs(spec.out);
  const fmt = normFormat(spec.format);
  const isVideoOut = VIDEO_EXT.test(spec.out);
  let kind, cmd, argv, assets = [], expectFiles = null, voice = null;

  if (fmt === "F01" || (!fmt && spec.screen && Array.isArray(spec.segments))) {
    kind = "F01 pov (--raw)";
    cmd = process.execPath; argv = [path.join(INFRA_ROOT, "src", "produce", "pov.js"), item.file, "--raw"];
    if (wantsVoice(spec)) voice = { cmd, argv: [path.join(INFRA_ROOT, "src", "produce", "pov.js"), item.file, "--voice", "--out", voicePath(out)] };
    if (spec.photo) assets.push(abs(spec.photo));
    if (spec.screen) assets.push(abs(spec.screen));
    for (const sg of spec.segments || []) if (sg.src) assets.push(abs(sg.src));
  } else if (fmt === "F04" || (!fmt && Array.isArray(spec.slides) && (spec.countdown || spec.rule))) {
    kind = "F04 test du partenaire";
    // La piste audio (voix + tic-tac) fait partie du rendu et les F04 avec voix se rendent sur le Mac (choix humain du 21/09 : voix edge-tts Denise) → deploy/sync-media.sh
    // Deux versions : `out` = sans voix (tic-tac seul), <nom>.voix.mp4 = avec voix
    if (wantsVoice(spec)) {
      cmd = PY; argv = [path.join(SCRIPTS, "partner-quiz-video.py"), item.file, "--no-tts"];
      voice = { cmd, argv: [path.join(SCRIPTS, "partner-quiz-video.py"), item.file, "--out", voicePath(out)] };
    } else {
      if (spec.tts !== false && voiceProblem(spec)) return { ...item, spec, skip: `F04 avec voix : ${voiceProblem(spec)} — rendu sur le Mac puis deploy/sync-media.sh` };
      cmd = PY; argv = [path.join(SCRIPTS, "partner-quiz-video.py"), item.file];
    }
    if (spec.cover?.photo) assets.push(abs(spec.cover.photo));
  } else if (fmt === "F02" || (Array.isArray(spec.slides) && spec.cover)) {
    const video = spec.rendition === "video" || (isVideoOut && Array.isArray(spec.slides));
    kind = video ? "F02 vidéo série" : "F02 carrousel";
    cmd = PY; argv = [path.join(SCRIPTS, video ? "series-video.py" : "carousel.py"), item.file];
    if (spec.cover?.photo) assets.push(abs(spec.cover.photo));
    if (!video) expectFiles = 1 + 2 * (spec.slides?.length || 0);
  } else if (fmt === "F03" || spec.mode === "face" || spec.mode === "faceless") {
    kind = `F03 camembert (${spec.mode || "?"})`;
    cmd = PY; argv = [path.join(SCRIPTS, "pie-video.py"), item.file];
    if (spec.mode === "face") { if (spec.rush) assets.push(abs(spec.rush)); else return { ...item, spec, skip: "F03 mode face sans `rush`" }; }
    else if (spec.photo) assets.push(abs(spec.photo));
  } else {
    return { ...item, spec, skip: `format inconnu (${spec.format || "absent"}) : rien à faire` };
  }
  if (a.format && normFormat(a.format) !== (fmt || kind.slice(0, 3))) return { ...item, spec, skip: "hors --format" };
  if (voice && voiceProblem(spec)) { log(`  · ${rel(item.file)} : version avec voix impossible ici (${voiceProblem(spec)}), seule la version brute est rendue`); voice = null; }
  return { ...item, spec, hash: sha1(raw), out, outRel: rel(out), kind, cmd, argv, assets: [...new Set(assets)], expectFiles, isDir: !isVideoOut, voice, voiceOut: voice ? voicePath(out) : null };
}
// Moteur de voix utilisable sur cette machine ? (edge-tts dans le venv, `say` sur macOS) → null ou la raison
function voiceProblem(spec) {
  const t = ttsFor(spec);
  if (t.engine === "say") return process.platform === "darwin" ? null : "`say` n'existe que sur macOS";
  if (t.engine === "edge") return fs.existsSync(path.join(INFRA_ROOT, ".venv", "bin", "edge-tts")) ? null : "edge-tts absent (.venv/bin/pip install edge-tts)";
  return null;
}

// ---- 3. État de la sortie ----
function outputStatus(c) {
  if (!fs.existsSync(c.out)) return { present: false, reason: "sortie absente" };
  const st = fs.statSync(c.out);
  if (c.isDir) {
    if (!st.isDirectory()) return { present: false, reason: "sortie attendue : dossier" };
    const jpgs = fs.readdirSync(c.out).filter((f) => /\.jpe?g$/i.test(f));
    if (!jpgs.length) return { present: false, reason: "dossier vide" };
    if (c.expectFiles && jpgs.length < c.expectFiles) return { present: false, reason: `${jpgs.length}/${c.expectFiles} slides` };
    const mtime = Math.max(...jpgs.map((f) => fs.statSync(path.join(c.out, f)).mtimeMs));
    return { present: true, mtime, detail: `${jpgs.length} slides` };
  }
  if (!st.isFile() || st.size < 1024) return { present: false, reason: "fichier vide ou tronqué" };
  if (c.voiceOut && (!fs.existsSync(c.voiceOut) || fs.statSync(c.voiceOut).size < 1024)) return { present: false, reason: "version avec voix absente" };
  return { present: true, mtime: st.mtimeMs, detail: `${(st.size / 1e6).toFixed(1)} Mo${c.voiceOut ? " + version avec voix" : ""}` };
}

// ---- 4. Après rendu : fiche EXP « à monter » → « prêt » (media_file = sortie), ligne QUEUE si présente ----
function markReady(c) {
  const expDir = path.join(CONTENT_ROOT, "04_EXPERIMENTS");
  if (!fs.existsSync(expDir)) return [];
  const target = c.outRel.replace(/\/$/, "");
  const done = [];
  for (const f of fs.readdirSync(expDir).filter((x) => /^EXP-\d+\.md$/.test(x))) {
    const file = path.join(expDir, f);
    const md = fs.readFileSync(file, "utf8");
    const m = md.match(/^---\n([\s\S]*?)\n---([\s\S]*)$/);
    if (!m) continue;
    const media = (m[1].match(/^media_file:\s*"?([^"\n#]+?)"?\s*(#.*)?$/m) || [])[1]?.trim().replace(/\/$/, "");
    if (!media || media !== target) continue;
    const statusLine = m[1].match(/^status:\s*"?(à monter|a monter|à rendre|a rendre)"?\s*(#.*)?$/m);
    if (!statusLine) continue;
    // Nouveau rendu = nouveau média : une validation ou un refus antérieur ne vaut plus, l'humain revoit la créa
    const fm = m[1].replace(/^status:.*$/m, `status: prêt${statusLine[2] ? " " + statusLine[2] : ""}`).replace(/^updated:.*$/m, `updated: ${today()}`)
      .replace(/^validation:.*$/m, "validation: null").replace(/^validated_at:.*$/m, "validated_at: null");
    fs.writeFileSync(file, `---\n${fm}\n---${m[2]}`);
    done.push(f.replace(/\.md$/, ""));
  }
  const queue = path.join(CONTENT_ROOT, "06_CALENDAR", "QUEUE.md");
  if (done.length && fs.existsSync(queue)) {
    const q = fs.readFileSync(queue, "utf8").split("\n");
    let changed = false;
    for (const exp of done) {
      const i = q.findIndex((l) => l.startsWith("|") && l.includes(`| ${exp} |`));
      if (i < 0) continue;
      let h = i; while (h > 0 && !/^\|\s*---/.test(q[h])) h--;
      const header = (q[h - 1] || "").split("|").map((x) => x.trim().toLowerCase());
      const si = header.findIndex((x) => x === "statut");
      const cells = q[i].split("|");
      if (si > 0 && /à monter|a monter|à rendre/i.test(cells[si])) { cells[si] = " prêt "; q[i] = cells.join("|"); changed = true; }
    }
    if (changed) fs.writeFileSync(queue, q.join("\n"));
  }
  return done;
}

// ---- 5. Boucle principale ----
const state = readJson(STATE_FILE, { rendered: {} }) || { rendered: {} };
const items = walkSpecs().map(classify);
const plan = [], skipped = [], adopted = [];
for (const c of items) {
  if (c.skip) { skipped.push(c); continue; }
  const st = outputStatus(c);
  const key = rel(c.file);
  const prev = state.rendered[key];
  let why = null;
  if (a.force) why = "--force";
  else if (!st.present) why = st.reason;
  else if (prev && prev.hash !== c.hash) why = "spec modifiée depuis le dernier rendu";
  else if (a.mtime && fs.statSync(c.file).mtimeMs > st.mtime + 1000) why = "spec plus récente que la sortie (--mtime)";
  if (!why) {
    if (!prev) adopted.push(c);   // sortie présente, jamais vue : on l'adopte sans re-rendre
    continue;
  }
  const missing = c.assets.filter((p) => !fs.existsSync(p));
  plan.push({ ...c, why, missing });
}

const renderable = plan.filter((p) => !p.missing.length);
const blocked = plan.filter((p) => p.missing.length);
const limit = a.limit ? Number(a.limit) : Infinity;

log(`=== render-pending ${today()} ${DRY ? "(dry-run) " : ""}: ${items.length} spec(s) lue(s)${a.account ? ` · compte ${a.account}` : ""} · ${renderable.length} à rendre · ${blocked.length} bloquée(s) par un asset manquant · ${adopted.length} sortie(s) adoptée(s) · ${skipped.length} ignorée(s)`);
for (const s of skipped) if (!/hors --format/.test(s.skip)) log(`  · ${rel(s.file)} : ${s.skip}`);
for (const b of blocked) log(`  ⏸ ${rel(b.file)} [${b.kind}] : ${b.why} — asset manquant : ${b.missing.map(rel).join(", ")} (rsync depuis le Mac : deploy/sync-media.sh)`);
for (const p of renderable) log(`  → ${rel(p.file)} [${p.kind}] → ${p.outRel} : ${p.why}`);
if (renderable.length > limit) log(`  (limite --limit ${limit} : ${renderable.length - limit} rendu(s) attendront le prochain passage)`);

if (!DRY) {
  for (const c of adopted) state.rendered[rel(c.file)] = { hash: c.hash, out: c.outRel, adopted_at: new Date().toISOString() };
  if (adopted.length) { writeJson(STATE_FILE, state); log(`  ${adopted.length} sortie(s) existante(s) enregistrée(s) dans ${rel(STATE_FILE)}`); }
}

let ok = 0, failed = 0;
if (!DRY) {
  if (renderable.length && spawnSync("ffmpeg", ["-version"]).status !== 0) { log("✗ ffmpeg introuvable : aucun rendu possible (apt install ffmpeg)"); flushLog(); process.exit(1); }
  for (const c of renderable.slice(0, limit)) {
    const t0 = Date.now();
    log(`▶ ${c.kind} : ${rel(c.file)}`);
    fs.mkdirSync(path.dirname(c.out), { recursive: true });
    let r = spawnSync(c.cmd, c.argv, { cwd: INFRA_ROOT, encoding: "utf8", maxBuffer: 1 << 26, timeout: RENDER_TIMEOUT_MS });
    if (r.status === 0 && c.voice) r = spawnSync(c.voice.cmd, c.voice.argv, { cwd: INFRA_ROOT, encoding: "utf8", maxBuffer: 1 << 26, timeout: RENDER_TIMEOUT_MS });
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    const st = r.status === 0 ? outputStatus(c) : { present: false, reason: "" };
    if (r.status === 0 && st.present) {
      ok++;
      state.rendered[rel(c.file)] = { hash: c.hash, out: c.outRel, rendered_at: new Date().toISOString(), kind: c.kind, seconds: Number(secs) };
      writeJson(STATE_FILE, state);
      const marked = a["no-mark"] ? [] : markReady(c);
      log(`  ✓ ${c.outRel} (${st.detail}, ${secs} s)${marked.length ? ` · fiche(s) ${marked.join(", ")} → prêt` : ""}`);
    } else {
      failed++;
      const err = (r.stderr || r.stdout || (r.error && r.error.message) || "").trim().split("\n").slice(-6).join("\n    ");
      log(`  ✗ échec (${secs} s${r.status !== null && r.status !== 0 ? `, code ${r.status}` : ""}${r.error?.code === "ETIMEDOUT" ? ", délai dépassé" : ""})${!st.present && r.status === 0 ? ` : sortie absente après rendu (${st.reason})` : ""}\n    ${err}`);
    }
  }
}

log(`=== fin : ${DRY ? `${Math.min(renderable.length, limit)} à rendre` : `${ok} rendu(s), ${failed} échec(s)`}${blocked.length ? `, ${blocked.length} en attente d'assets` : ""}`);
flushLog();
if (JSON_OUT) {
  const item = (c) => ({ spec: rel(c.file), account: c.slug, kind: c.kind, out: c.outRel, why: c.why || null, missing: (c.missing || []).map(rel) });
  console.log(JSON.stringify({
    date: today(), dry_run: DRY, specs: items.length, renderable: renderable.length, blocked: blocked.length, adopted: adopted.length, skipped: skipped.length,
    limit: Number.isFinite(limit) ? limit : null, rendered: ok, failed,
    renderable_items: renderable.map(item), blocked_items: blocked.map(item), skipped_items: skipped.filter((x) => !/hors --format/.test(x.skip)).map((x) => ({ spec: rel(x.file), reason: x.skip })),
  }));
}
process.exit(failed ? 1 : 0);
