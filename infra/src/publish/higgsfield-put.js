// Envoie les octets des fichiers d'un job vers les URLs présignées renvoyées par l'outil MCP `media_upload` (Higgsfield).
// Usage : node src/publish/higgsfield-put.js EXP-015 [data/publish/jobs/EXP-015.presigned.json]
// Le JSON présigné est la réponse brute de media_upload, sauvegardée par l'agent. Le script associe chaque entrée
// (upload_url + filename / media_id) au fichier du job, fait le PUT, puis écrit <EXP>.uploaded.json (media_ids à confirmer).
import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "../lib/fs.js";
import { jobPath, presignedPath, uploadedPath } from "./lib.js";

const [exp, presignedArg] = process.argv.slice(2);
if (!exp) { console.error("Usage : node src/publish/higgsfield-put.js EXP-015 [presigned.json]"); process.exit(1); }
const job = readJson(jobPath(exp));
if (!job) { console.error(`Job introuvable : lancer d'abord node src/publish/tiktok-draft.js ${exp}`); process.exit(1); }
const presigned = readJson(presignedArg ? path.resolve(presignedArg) : presignedPath(exp));
if (!presigned) { console.error(`JSON présigné introuvable (${presignedArg || presignedPath(exp)}) : coller la réponse de media_upload dedans`); process.exit(1); }

// Cherche récursivement les objets qui portent une upload_url, quelle que soit la forme de la réponse.
const entries = [];
(function walk(o) {
  if (!o || typeof o !== "object") return;
  if (Array.isArray(o)) return o.forEach(walk);
  if (o.upload_url) entries.push(o); else Object.values(o).forEach(walk);
})(presigned);
if (!entries.length) { console.error("Aucune upload_url dans le JSON présigné"); process.exit(1); }

// Appariement par nom de fichier : champs explicites, sinon le champ `instructions` (« --data-binary @EXP-015-01.jpg »).
// Jamais par index : une réponse groupée (plusieurs EXP) donnerait les mêmes URLs à deux jobs.
const pick = (file) => entries.find((e) => [e.filename, e.file_name, e.name].filter(Boolean).some((n) => String(n) === file.filename))
  || entries.find((e) => typeof e.instructions === "string" && e.instructions.includes(`@${file.filename} `) || typeof e.instructions === "string" && e.instructions.includes(`@${file.filename}'`));
const results = [];
for (const file of job.files) {
  const e = pick(file);
  if (!e) { console.error(`✗ ${file.filename} : pas d'URL présignée correspondante (nom absent de la réponse media_upload)`); process.exit(1); }
  const body = fs.readFileSync(file.path);
  const headers = { "Content-Type": file.content_type, "Content-Length": String(body.length), ...(e.headers || {}) };
  const r = await fetch(e.upload_url, { method: e.method || "PUT", headers, body });
  const ok = r.ok;
  console.log(`${ok ? "✓" : "✗"} PUT ${file.filename} (${(body.length / 1024).toFixed(0)} Ko) → HTTP ${r.status}`);
  if (!ok) { console.error(await r.text()); process.exit(1); }
  results.push({ filename: file.filename, media_id: e.media_id || e.id || null, url: e.url || e.public_url || e.media_url || null });
}
writeJson(uploadedPath(exp), { exp, media_type: job.media_type, uploaded_at: new Date().toISOString(), files: results });
console.log(`\n→ ${path.relative(process.cwd(), uploadedPath(exp))}`);
console.log(`Étape suivante : media_confirm { type: "${job.media_type === "PHOTO" ? "image" : "video"}", media_ids: ${JSON.stringify(results.map((r) => r.media_id))} } puis tiktok_prepare_publish (voir job.mcp).`);
