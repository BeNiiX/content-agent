// Vérifie l'environnement : yt-dlp, ffmpeg, Python (.venv + Pillow), session Claude Code, .env, config d'instance, état des données,
// specs à rendre (render-pending.js --dry-run --json). Ne modifie rien. Codes : ✓ ok, ✗ manquant (avec le remède), · information.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { env } from "./lib/env.js";
import { DATA, TIKTOK, INSTAGRAM, VIDEOS, AUTHORS, INFRA_ROOT } from "./lib/paths.js";
import { readJson, listJson } from "./lib/fs.js";
import { project, t } from "./lib/project.js";

const LINUX = process.platform === "linux";
const PATH_ENV = `${process.env.HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${INFRA_ROOT}/.venv/bin:${process.env.PATH}`;
const ok = (b, label, hint = "") => console.log(`${b ? "✓" : "✗"} ${label}${b ? "" : hint ? " — " + hint : ""}`);
const info = (label) => console.log(`· ${label}`);
const sh = (cmd, argv, opts = {}) => spawnSync(cmd, argv, { encoding: "utf8", env: { ...process.env, PATH: PATH_ENV }, ...opts });
const ver = (bin) => { const r = sh(bin, ["--version"]); return !r.error && r.status === 0 ? String(r.stdout).trim().split("\n")[0] : null; };
const install = (brew, apt) => (LINUX ? apt : brew);

// ---- Outils système ----
const y = ver(env("YTDLP_BIN", "yt-dlp")); ok(!!y, `yt-dlp ${y || ""}`, install("brew install yt-dlp", "deploy/install.sh (binaire dans /usr/local/bin) ou sudo yt-dlp -U"));
const f = (() => { const r = sh("ffmpeg", ["-version"]); return !r.error && r.status === 0 ? String(r.stdout).split("\n")[0] : null; })(); ok(!!f, `ffmpeg ${f ? f.slice(0, 30) : ""}`, install("brew install ffmpeg", "apt install ffmpeg"));

// ---- Python : .venv + Pillow (carrousels, vidéos série, camemberts) ----
const PY = path.join(INFRA_ROOT, ".venv", "bin", "python");
if (fs.existsSync(PY)) {
  const r = sh(PY, ["-c", "import PIL, sys; print(PIL.__version__)"]);
  ok(!r.error && r.status === 0, `.venv/bin/python + Pillow ${r.status === 0 ? String(r.stdout).trim() : ""}`, ".venv/bin/pip install pillow");
} else ok(false, ".venv/bin/python (rendu des carrousels / vidéos)", "python3 -m venv .venv && .venv/bin/pip install pillow");

// ---- Session Claude Code (envoi du soir : claude -p + connecteur Higgsfield) ----
const claudeBin = (sh("which", ["claude"]).stdout || "").trim();
if (!claudeBin) info("claude (CLI) introuvable : l'envoi du soir (daily-drafts.sh) et les revues headless ne peuvent pas tourner ici — installation : https://claude.ai/install.sh (VPS : deploy/install.sh)");
else {
  const r = sh("claude", ["auth", "status"], { timeout: 15000 });
  let st = null; try { st = JSON.parse(r.stdout || ""); } catch { st = null; }
  const desc = st ? `${st.loggedIn ? "connecté" : "non connecté"}${st.authMethod ? " · " + st.authMethod : ""}${st.subscriptionType ? " · " + st.subscriptionType : ""}` : `${r.stdout || ""}${r.stderr || ""}`.trim().split("\n")[0].slice(0, 80);
  if (r.error) info(`claude auth status : impossible à exécuter (${r.error.code || r.error.message})`);
  else ok(r.status === 0 && (!st || st.loggedIn !== false), `session Claude Code : ${desc}${st && st.authMethod && st.authMethod !== "claude.ai" ? " (connecteur Higgsfield indisponible hors session claude.ai : unset ANTHROPIC_API_KEY)" : ""}`, "claude auth login (VPS : sudo -iu <user> claude auth login, deploy/README.md § Étape 4)");
}

// ---- Fichiers de configuration ----
ok(fs.existsSync(path.join(INFRA_ROOT, ".env")), ".env présent", "cp .env.example .env");
ok(fs.existsSync(path.join(INFRA_ROOT, "config", "project.json")), `config/project.json (instance : ${project().name}, slug ${project().slug})`, "à créer, schéma dans config/README.md — valeurs neutres utilisées");
ok(fs.existsSync(path.join(INFRA_ROOT, "config", "accounts.json")), "config/accounts.json (comptes TikTok et connecteurs)", "à créer depuis config/accounts.json.example — aucun brouillon possible sans compte");
ok(fs.existsSync(path.join(INFRA_ROOT, "..", "01_BRAND", "DA", "themes.json")), "01_BRAND/DA/themes.json (thèmes des cartes)", "absent : thème default neutre construit depuis project.json");
for (const [k, use] of [["NOTIFY_CHANNEL", "notification de l'envoi du soir (ntfy | telegram | imessage)"], ["TIKTOK_ADS_ACCESS_TOKEN", "rapports / budgets TikTok Ads"], ["TIKTOK_ADVERTISER_ID", "rapports / budgets TikTok Ads"], ["IG_ACCESS_TOKEN", "publication Instagram"], ["IG_USER_ID", "publication Instagram"], ["SUPABASE_URL", `banque ${/^[aeiouyhéèêàâîôû]/i.test(t("item_plural")) ? "d'" : "de "}${t("item_plural")}`]]) ok(!!env(k), `${k} (${use})`, "optionnel, à remplir dans .env");

// ---- Données de veille ----
const ti = readJson(path.join(TIKTOK, "items.json"), []) || [], tf = readJson(path.join(TIKTOK, "following.json"), []) || [];
const ii = readJson(path.join(INSTAGRAM, "items.json"), []) || [];
info(`Données : TikTok ${ti.length} vidéos importées, ${tf.length} comptes suivis · Instagram ${ii.length} posts · ${listJson(VIDEOS).filter((p) => !path.basename(p).startsWith("_") && !p.endsWith("index.json")).length} vidéos enrichies · ${listJson(AUTHORS).length} comptes analysés`);
const inbox = path.join(INFRA_ROOT, "..", "07_ASSETS", "photos", "_inbox");
const pending = fs.existsSync(inbox) ? fs.readdirSync(inbox).filter((f) => /\.(jpe?g|png|heic|heif|webp)$/i.test(f) && !f.startsWith("_")).length : 0;
if (pending) info(`Photos à trier : ${pending} dans 07_ASSETS/photos/_inbox/ → .venv/bin/python scripts/photos-inbox.py`);

// ---- Brouillons TikTok ----
const jobsDir = path.join(DATA, "publish", "jobs");
const jobs = listJson(jobsDir).filter((p) => /EXP-\d+\.json$/.test(p)).map((p) => readJson(p)).filter(Boolean);
if (jobs.length) info(`Brouillons TikTok : ${jobs.length} job(s) · ${jobs.filter((j) => j.sent?.draft_sent_at).length} envoyé(s) · ${jobs.filter((j) => !j.ok).length} avec problème(s) — connexion du compte : src/publish/CONNEXION_TIKTOK.md`);

// ---- Specs à rendre (render-pending.js --dry-run --json) ----
{
  const r = sh(process.execPath, [path.join(INFRA_ROOT, "src", "produce", "render-pending.js"), "--dry-run", "--json"], { cwd: INFRA_ROOT, timeout: 120000 });
  let rp = null;
  try { rp = JSON.parse((r.stdout || "").trim().split("\n").filter(Boolean).pop() || "null"); } catch { rp = null; }
  if (!rp) info(`render-pending : résumé illisible (${(r.stderr || r.error?.message || "").trim().split("\n")[0] || "sortie vide"})`);
  else {
    info(`Specs : ${rp.specs} lue(s) · ${rp.renderable} à rendre · ${rp.blocked} bloquée(s) par un asset manquant · ${rp.adopted} sortie(s) déjà présente(s)${rp.skipped ? ` · ${rp.skipped} ignorée(s)` : ""}${rp.renderable || rp.blocked ? " — node src/produce/render-pending.js (VPS : content-render-pending toutes les heures)" : ""}`);
    for (const b of rp.blocked_items.slice(0, 5)) info(`  ⏸ ${b.spec} : ${b.missing.join(", ")} (deploy/sync-media.sh)`);
    if (rp.blocked_items.length > 5) info(`  … ${rp.blocked_items.length - 5} autre(s) bloquée(s)`);
  }
}
if (!ti.length && !ii.length) info("Prochaine étape : déposer l'export TikTok dans data/raw/tiktok/ puis `node src/tiktok/import-export.js data/raw/tiktok`");
