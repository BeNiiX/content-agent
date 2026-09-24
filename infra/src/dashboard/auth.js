// Authentification du tableau de bord : formulaire de connexion (reconnu par les gestionnaires de mots de passe :
// autocomplete=username / current-password) + cookie de session signé. Activée dès que DASHBOARD_PASSWORD est défini
// dans .env (sur le VPS) ; sans mot de passe, accès libre (usage local sur 127.0.0.1).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA } from "../lib/paths.js";
import { env } from "../lib/env.js";

const USER = env("DASHBOARD_USER", "admin");
const PASSWORD = env("DASHBOARD_PASSWORD", "");
const TTL_DAYS = Number(env("DASHBOARD_SESSION_DAYS", "30"));
const STORE = path.join(DATA, "dashboard", "sessions.json");
const COOKIE = "content_session";
export const enabled = () => PASSWORD.length > 0;

let sessions = (() => { try { return JSON.parse(fs.readFileSync(STORE, "utf8")); } catch { return {}; } })();
const save = () => { fs.mkdirSync(path.dirname(STORE), { recursive: true }); fs.writeFileSync(STORE, JSON.stringify(sessions), { mode: 0o600 }); };
const purge = () => { const now = Date.now(); let n = 0; for (const [k, v] of Object.entries(sessions)) if (v.exp < now) { delete sessions[k]; n++; } if (n) save(); };
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const cookies = (req) => Object.fromEntries((req.headers.cookie || "").split(";").map((c) => c.trim().split("=")).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
const secure = (req) => (req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";

export function sessionOf(req) {
  if (!enabled()) return { user: "local" };
  purge();
  const s = sessions[cookies(req)[COOKIE]];
  return s && s.exp > Date.now() ? s : null;
}
function login(res, req, user) {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions[token] = { user, exp: Date.now() + TTL_DAYS * 86400000, ua: String(req.headers["user-agent"] || "").slice(0, 120) };
  save();
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_DAYS * 86400}${secure(req) ? "; Secure" : ""}`);
}
function logout(req, res) {
  const t = cookies(req)[COOKIE]; if (t && sessions[t]) { delete sessions[t]; save(); }
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
const page = (error = "") => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connexion</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#111;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
form{background:#1c1c1c;padding:32px;border-radius:12px;width:min(360px,90vw);box-shadow:0 10px 40px #0008}h1{font-size:18px;margin:0 0 20px}
label{display:block;font-size:13px;color:#aaa;margin:12px 0 4px}input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #333;background:#0d0d0d;color:#fff;font-size:15px}
button{margin-top:18px;width:100%;padding:11px;border:0;border-radius:8px;background:#ffbe59;color:#111;font-weight:700;font-size:15px;cursor:pointer}.err{color:#ff6b6b;font-size:13px;margin-top:10px}</style></head>
<body><form method="post" action="/login"><h1>Tableau de bord — connexion</h1>
<label for="username">Utilisateur</label><input id="username" name="username" type="text" autocomplete="username" autocapitalize="none" autofocus required>
<label for="password">Mot de passe</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Se connecter</button>${error ? `<div class="err">${error}</div>` : ""}</form></body></html>`;

// Retourne true si la requête a été traitée (page de connexion, refus, déconnexion) ; false = laisser passer.
export async function guard(req, res, url, readBody) {
  if (!enabled()) return false;
  if (url.pathname === "/login") {
    if (req.method === "GET") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); res.end(page()); return true; }
    if (req.method === "POST") {
      const b = await readBody(req);
      if (safeEq(b.username || "", USER) && safeEq(b.password || "", PASSWORD)) { login(res, req, USER); res.writeHead(303, { Location: "/" }); res.end(); }
      else { await new Promise((r) => setTimeout(r, 800)); res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" }); res.end(page("Identifiants incorrects.")); }
      return true;
    }
  }
  if (url.pathname === "/logout") { logout(req, res); res.writeHead(303, { Location: "/login" }); res.end(); return true; }
  if (url.pathname === "/connected") return false;   // page publique de retour OAuth (backend de publication) : pas de session requise
  if (sessionOf(req)) return false;
  if (url.pathname.startsWith("/api/")) { res.writeHead(401, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "non connecté" })); return true; }
  res.writeHead(303, { Location: "/login" }); res.end(); return true;
}
