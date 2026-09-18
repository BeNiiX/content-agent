// Actions du tableau de bord : flags des comptes (config/accounts.json), marquage « posté », lancement des scripts
// existants en arrière-plan (journal dans data/dashboard/runs/), dépôt d'assets dans 07_ASSETS.
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { CONTENT_ROOT, DATA, INFRA_ROOT, CONFIG } from "../lib/paths.js";
import { readJson, writeJson, today } from "../lib/fs.js";
import { ASSETS } from "./state.js";

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

// ---- Scripts lançables (liste fermée) ----
export const SCRIPTS = {
  "daily-plan": { label: "Recalculer le plan du soir", cmd: process.execPath, args: ["src/publish/daily-plan.js"], desc: "Relit QUEUE.md et les fiches, réécrit data/publish/daily/<date>.json (les envois déjà faits sont conservés)" },
  "daily-drafts-dry": { label: "Envoi du soir — test à blanc", cmd: "/bin/bash", args: ["scripts/daily-drafts.sh", "--dry-run"], desc: "Plan + message de consignes, sans rien envoyer" },
  "daily-drafts": { label: "Envoyer les brouillons maintenant", cmd: "/bin/bash", args: ["scripts/daily-drafts.sh"], desc: "1 brouillon TikTok par compte actif (claude -p + connecteur Higgsfield), puis message", confirm: true },
  "daily-notify": { label: "Renvoyer le message de consignes", cmd: process.execPath, args: ["src/publish/daily-notify.js"], desc: "Recompose le message du soir depuis le plan du jour et l'envoie (NOTIFY_CHANNEL)" },
  "photos-inbox": { label: "Préparer les photos déposées", cmd: path.join(INFRA_ROOT, ".venv", "bin", "python"), args: ["scripts/photos-inbox.py"], desc: "HEIC/PNG → JPG, planche contact, _triage.json à compléter par l'agent" },
  "photos-inbox-apply": { label: "Ranger les photos triées", cmd: path.join(INFRA_ROOT, ".venv", "bin", "python"), args: ["scripts/photos-inbox.py", "--apply"], desc: "Renomme et range par thème selon _triage.json, met à jour PHOTOS.md" },
  "weekly-stats": { label: "Relevé des comptes", cmd: "/bin/bash", args: ["scripts/weekly-stats.sh"], desc: "Stats publiques de chaque compte (yt-dlp) → STATS.md, digest" },
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
  delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT;   // comme daily-drafts.sh : claude -p refuse de tourner dans une session Claude Code
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
  else if (kind === "screen") {
    if (!isVid) throw new Error(`${safe} : vidéo attendue (mp4, mov)`);
    const t = String(theme || "").toLowerCase().replace(/[^a-z0-9-]/g, ""); if (!t) throw new Error("thème requis (societe, couple, sport…)");
    dir = path.join(ASSETS, "screen-records", t); file = `${t}-${today()}-S${Number(index) || 1}${ext}`;
  } else if (kind === "rush") { if (!isVid) throw new Error(`${safe} : vidéo attendue`); dir = path.join(ASSETS, "rushes"); file = safe; }
  else throw new Error("kind = photo | screen | rush");
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
