// Tableau de bord de l'agent content, pensé pour la validation : créas à valider (textes modifiables), page par compte
// (réglages, file réordonnable, planning des envois), agent (timers, routines, heure d'envoi, lancements), assets.
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
import { status as dailyDue } from "../publish/due.js";
import * as A from "./actions.js";
import { guard, enabled as authEnabled } from "./auth.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "public");
const a = args();
const PORT = Number(a.port || process.env.DASHBOARD_PORT || 4747);
// Dossiers servis en lecture sous /media/ (rien d'autre : pas de .env, pas de credentials)
const MEDIA_ROOTS = ["07_ASSETS", "08_ACCOUNTS", "02_VEILLE/assets", "01_BRAND/DA"].map((d) => path.join(CONTENT_ROOT, d));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic", ".gif": "image/gif", ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8" };

const json = (res, data, code = 200) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
const fail = (res, e, code = 400) => json(res, { error: e instanceof Error ? e.message : String(e) }, code);
const formBody = (req) => new Promise((resolve, reject) => { let s = ""; req.on("data", (c) => { s += c; if (s.length > 1e5) reject(new Error("corps trop long")); }); req.on("end", () => resolve(Object.fromEntries(new URLSearchParams(s)))); req.on("error", reject); });
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
  if (m === "GET" && p === "/state") return json(res, { date: today(), platform: process.platform, daily: dailyDue(), validation: { pending: S.creas().filter((e) => e.status === "ready" && e.validation === "pending" && !e.frozen && !e.pilot).length }, gabarits_review: S.gabaritsMatrix().cells.filter((c) => c.status === "pilotes en revue" || c.status === "évolution proposée").length, project: (({ name, slug, default_language, vocabulary }) => ({ name, slug, default_language, vocabulary }))(project()), accounts: S.accounts(), schedule: S.schedule(), runs: A.listRuns().slice(0, 5), scripts: Object.fromEntries(Object.entries(A.SCRIPTS).filter(([, v]) => !v.hidden).map(([k, v]) => [k, { label: v.label, desc: v.desc, confirm: !!v.confirm }])) });
  if (m === "GET" && p === "/queue") return json(res, S.accountQueue(q.get("account")));
  if (m === "GET" && p === "/creas") return json(res, S.creas());
  if (m === "GET" && p === "/gabarits") return json(res, { ...S.gabaritsMatrix(), formats: S.formats() });
  if (m === "GET" && /^\/format\/FORMAT-\d+$/.test(p)) { const d = S.formatDetail(p.split("/")[2]); return d ? json(res, d) : fail(res, "format introuvable", 404); }
  if (m === "GET" && p.startsWith("/gabarit/")) { const d = S.gabaritDetail(decodeURIComponent(p.split("/")[2])); return d ? json(res, d) : fail(res, "gabarit introuvable", 404); }
  if (m === "POST" && /^\/gabarits\/[\w.-]+\/decision$/.test(p)) { const { decision, note } = await body(req); return json(res, { ok: true, ...A.setGabaritDecision(p.split("/")[2], decision, note) }); }
  if (m === "POST" && /^\/gabarits\/[\w.-]+\/comment$/.test(p)) { const { kind, text } = await body(req); return json(res, { ok: true, ...A.addGabaritComment(p.split("/")[2], kind, text) }); }
  if (m === "POST" && /^\/gabarits\/[\w.-]+\/create$/.test(p)) return json(res, { ok: true, ...A.createGabarit(p.split("/")[2]) });
  if (m === "GET" && p.startsWith("/account/")) { const d = S.accountDetail(p.split("/")[2]); return d ? json(res, d) : fail(res, "compte inconnu", 404); }
  if (m === "GET" && p === "/agent") return json(res, { ...S.agent(), runs: A.listRuns().slice(0, 12) });
  if (m === "POST" && /^\/exp\/EXP-\d+\/validation$/.test(p)) { const { decision, note } = await body(req); return json(res, { ok: true, ...A.setValidation(p.split("/")[2], decision ?? null, note) }); }
  if (m === "POST" && /^\/exp\/EXP-\d+\/variant$/.test(p)) { const { choice } = await body(req); return json(res, { ok: true, ...A.setVariant(p.split("/")[2], choice) }); }
  if (m === "POST" && /^\/exp\/EXP-\d+\/voice$/.test(p)) return json(res, { ok: true, ...A.enableVoice(p.split("/")[2]) });
  if (m === "POST" && /^\/exp\/EXP-\d+\/carousel$/.test(p)) { const patch = await body(req); return json(res, { ok: true, ...A.editCarousel(p.split("/")[2], patch) }); }
  if (m === "POST" && /^\/exp\/EXP-\d+\/comment$/.test(p)) { const { kind, text } = await body(req); return json(res, { ok: true, ...A.addComment(p.split("/")[2], kind, text) }); }
  if (m === "POST" && /^\/exp\/EXP-\d+\/texts$/.test(p)) { const fields = await body(req); return json(res, { ok: true, ...A.editTexts(p.split("/")[2], fields) }); }
  if (m === "POST" && p === "/schedule/daily") { const patch = await body(req); return json(res, { ok: true, daily: A.setDailySchedule(patch) }); }
  if (m === "POST" && p === "/queue/order") { const { account, order } = await body(req); return json(res, { ok: true, ...A.setQueueOrder(account, order) }); }
  if (m === "POST" && p === "/queue/add") { const { account, exp } = await body(req); return json(res, { ok: true, ...A.addToQueue(account, exp) }); }
  if (m === "GET" && p.startsWith("/exp/")) { const d = S.expDetail(p.split("/")[2]); return d ? json(res, d) : fail(res, "fiche introuvable", 404); }
  if (m === "GET" && p === "/daily") return json(res, { ...S.dailyPlan(q.get("date") || today()), schedule: S.schedule() });
  if (m === "GET" && p === "/assets") return json(res, S.assets());
  if (m === "GET" && p === "/runs") return json(res, A.listRuns());
  if (m === "GET" && p.startsWith("/runs/")) { const r = A.getRun(p.split("/")[2]); return r ? json(res, r) : fail(res, "run inconnu", 404); }
  if (m === "POST" && p.startsWith("/accounts/")) { const slug = p.split("/")[2]; const patch = await body(req); return json(res, { ok: true, account: A.setAccountFlags(slug, patch) }); }
  if (m === "POST" && /^\/exp\/EXP-\d+\/posted$/.test(p)) { const exp = p.split("/")[2]; const { post_url } = await body(req); return json(res, { ok: true, output: A.markPosted(exp, post_url) }); }
  if (m === "POST" && p === "/queue/move") { const { account, exp, to } = await body(req); return json(res, { ok: true, ...A.moveQueueRow(account, exp, to) }); }
  if (m === "POST" && p === "/queue/interleave") { const { account, dry } = await body(req); return json(res, { ok: true, ...A.interleaveQueue(account, !!dry) }); }
  if (m === "POST" && p === "/run") { const { script, args: extra } = await body(req); return json(res, { ok: true, run: A.startRun(script, Array.isArray(extra) ? extra.map(String) : []) }); }
  if (m === "POST" && p === "/reveal") { const { path: rp } = await body(req); return json(res, { ok: true, path: A.reveal(rp) }); }
  if (m === "PUT" && p === "/upload") {
    const dest = A.uploadTarget({ kind: q.get("kind"), name: q.get("name"), theme: q.get("theme"), index: q.get("index") });
    const tmp = dest + ".part";
    await new Promise((resolve, reject) => { const w = fs.createWriteStream(tmp); req.pipe(w); w.on("finish", resolve); w.on("error", reject); req.on("error", reject); });
    fs.renameSync(tmp, dest);
    A.markTodo(dest, q.get("kind"), q.get("name"));   // « à traiter » jusqu'à ce que l'agent l'ait rangé
    return json(res, { ok: true, path: path.relative(CONTENT_ROOT, dest), bytes: fs.statSync(dest).size, todo: true });
  }
  fail(res, `route inconnue : ${m} ${p}`, 404);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (await guard(req, res, url, formBody)) return;   // connexion par formulaire si DASHBOARD_PASSWORD est défini
    if (url.pathname === "/connected") {   // retour OAuth du backend de publication (Post for Me → « Project Redirect URL »)
      const ok = !/error|denied/i.test(url.search);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Compte connecté</title><body style="font-family:-apple-system,system-ui,sans-serif;background:#111;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center"><div><div style="font-size:64px">${ok ? "✅" : "❌"}</div><h1 style="font-size:20px">${ok ? "Compte TikTok connecté" : "Connexion refusée"}</h1><p style="color:#aaa">${ok ? "Tu peux fermer cette page. L'agent voit le compte dès maintenant." : "Réessaie le lien depuis le bon compte TikTok."}</p></div></body></html>`);
    }
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
  console.log(`Tableau de bord : ${addr}  (Ctrl-C pour arrêter)${authEnabled() ? " · connexion par mot de passe (DASHBOARD_USER / DASHBOARD_PASSWORD)" : " · sans mot de passe (local)"}`);
  if (!a["no-open"] && process.platform === "darwin") spawn("open", [addr], { stdio: "ignore", detached: true }).unref();
});
