// Tableau de bord local de l'agent content : comptes (stock, envoi, création), file d'attente avec le média et les textes
// à saisir dans l'app, plan du soir, assets (consultation + dépôt), journal des scripts.
// Usage : npm run dashboard  (ou node src/dashboard/server.js [--port 4747] [--no-open])  → http://127.0.0.1:4747
// Aucune dépendance : http natif, front vanilla dans public/. Écoute uniquement sur 127.0.0.1.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CONTENT_ROOT, INFRA_ROOT } from "../lib/paths.js";
import { args, today } from "../lib/fs.js";
import { project } from "../lib/project.js";
import * as S from "./state.js";
import * as A from "./actions.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "public");
const a = args();
const PORT = Number(a.port || process.env.DASHBOARD_PORT || 4747);
// Dossiers servis en lecture sous /media/ (rien d'autre : pas de .env, pas de credentials)
const MEDIA_ROOTS = ["07_ASSETS", "08_ACCOUNTS", "02_VEILLE/assets", "01_BRAND/DA"].map((d) => path.join(CONTENT_ROOT, d));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic", ".gif": "image/gif", ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8" };

const json = (res, data, code = 200) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
const fail = (res, e, code = 400) => json(res, { error: e instanceof Error ? e.message : String(e) }, code);
const body = (req) => new Promise((resolve, reject) => { let s = ""; req.on("data", (c) => { s += c; if (s.length > 1e6) reject(new Error("corps trop long")); }); req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } }); req.on("error", reject); });

// Fichier statique avec Range (Safari exige les réponses 206 pour lire une vidéo)
function sendFile(req, res, abs) {
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) { res.writeHead(404); return res.end("introuvable"); }
  const size = fs.statSync(abs).size, type = MIME[path.extname(abs).toLowerCase()] || "application/octet-stream";
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  const headers = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": abs.startsWith(PUBLIC) ? "no-cache" : "private, max-age=300" };
  if (range && size) {
    const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size) { res.writeHead(416, { "Content-Range": `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    return fs.createReadStream(abs, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, "Content-Length": size });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(abs).pipe(res);
}

async function api(req, res, url) {
  const p = url.pathname.replace(/^\/api/, ""), q = url.searchParams, m = req.method;
  if (m === "GET" && p === "/state") return json(res, { date: today(), platform: process.platform, project: (({ name, slug, default_language, vocabulary }) => ({ name, slug, default_language, vocabulary }))(project()), accounts: S.accounts(), schedule: S.schedule(), runs: A.listRuns().slice(0, 5), scripts: Object.fromEntries(Object.entries(A.SCRIPTS).map(([k, v]) => [k, { label: v.label, desc: v.desc, confirm: !!v.confirm }])) });
  if (m === "GET" && p === "/queue") return json(res, S.accountQueue(q.get("account")));
  if (m === "GET" && p.startsWith("/exp/")) { const d = S.expDetail(p.split("/")[2]); return d ? json(res, d) : fail(res, "fiche introuvable", 404); }
  if (m === "GET" && p === "/daily") return json(res, { ...S.dailyPlan(q.get("date") || today()), schedule: S.schedule() });
  if (m === "GET" && p === "/assets") return json(res, S.assets());
  if (m === "GET" && p === "/runs") return json(res, A.listRuns());
  if (m === "GET" && p.startsWith("/runs/")) { const r = A.getRun(p.split("/")[2]); return r ? json(res, r) : fail(res, "run inconnu", 404); }
  if (m === "POST" && p.startsWith("/accounts/")) { const slug = p.split("/")[2]; const patch = await body(req); return json(res, { ok: true, account: A.setAccountFlags(slug, patch) }); }
  if (m === "POST" && /^\/exp\/EXP-\d+\/posted$/.test(p)) { const exp = p.split("/")[2]; const { post_url } = await body(req); return json(res, { ok: true, output: A.markPosted(exp, post_url) }); }
  if (m === "POST" && p === "/run") { const { script, args: extra } = await body(req); return json(res, { ok: true, run: A.startRun(script, Array.isArray(extra) ? extra.map(String) : []) }); }
  if (m === "POST" && p === "/reveal") { const { path: rp } = await body(req); return json(res, { ok: true, path: A.reveal(rp) }); }
  if (m === "PUT" && p === "/upload") {
    const dest = A.uploadTarget({ kind: q.get("kind"), name: q.get("name"), theme: q.get("theme"), index: q.get("index") });
    const tmp = dest + ".part";
    await new Promise((resolve, reject) => { const w = fs.createWriteStream(tmp); req.pipe(w); w.on("finish", resolve); w.on("error", reject); req.on("error", reject); });
    fs.renameSync(tmp, dest);
    return json(res, { ok: true, path: path.relative(CONTENT_ROOT, dest), bytes: fs.statSync(dest).size });
  }
  fail(res, `route inconnue : ${m} ${p}`, 404);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (url.pathname.startsWith("/media/")) {
      const relPath = decodeURIComponent(url.pathname.slice("/media/".length));
      const abs = path.resolve(CONTENT_ROOT, relPath);
      if (!MEDIA_ROOTS.some((r) => abs === r || abs.startsWith(r + path.sep))) { res.writeHead(403); return res.end("hors des dossiers servis"); }
      return sendFile(req, res, abs);
    }
    if (url.pathname.startsWith("/fonts/")) return sendFile(req, res, path.join(INFRA_ROOT, "fonts", path.basename(url.pathname)));
    const file = url.pathname === "/" ? "index.html" : path.basename(url.pathname);
    return sendFile(req, res, path.join(PUBLIC, file));
  } catch (e) { console.error(e); if (!res.headersSent) fail(res, e, 500); else res.end(); }
});
server.listen(PORT, "127.0.0.1", () => {
  const addr = `http://127.0.0.1:${PORT}`;
  console.log(`Tableau de bord : ${addr}  (Ctrl-C pour arrêter)`);
  if (!a["no-open"] && process.platform === "darwin") spawn("open", [addr], { stdio: "ignore", detached: true }).unref();
});
