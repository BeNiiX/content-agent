// Importe l'export officiel TikTok ("Télécharger tes données", format JSON) ou un JSON produit par
// browser-extract.js, ou un fichier urls.txt. Sortie : data/tiktok/items.json + following.json (fusion, sans doublon).
// Usage : node src/tiktok/import-export.js <fichier.json | dossier | urls.txt> [--source favorites]
import fs from "node:fs";
import path from "node:path";
import { TIKTOK, RAW } from "../lib/paths.js";
import { readJson, writeJson, walk, args } from "../lib/fs.js";
import { parseUrl } from "../lib/urls.js";

const a = args();
const input = a._[0] || RAW;
const ITEMS = path.join(TIKTOK, "items.json");
const FOLLOWING = path.join(TIKTOK, "following.json");

const items = new Map((readJson(ITEMS, []) || []).map((x) => [x.url, x]));
const following = new Map((readJson(FOLLOWING, []) || []).map((x) => [x.handle.toLowerCase(), x]));
let added = 0, addedFollow = 0;

const addItem = (url, source, saved_at) => {
  const p = parseUrl(url);
  if (!p || p.platform !== "tiktok") return;
  const prev = items.get(p.url);
  if (prev) { if (!prev.sources.includes(source)) prev.sources.push(source); return; }
  items.set(p.url, { url: p.url, id: p.id, handle: p.handle, platform: "tiktok", sources: [source], saved_at: saved_at || null, imported_at: new Date().toISOString() });
  added++;
};
const addFollow = (handle, followed_at) => {
  if (!handle) return;
  const h = String(handle).replace(/^@/, "").trim();
  if (!h || following.has(h.toLowerCase())) return;
  following.set(h.toLowerCase(), { handle: h, platform: "tiktok", followed_at: followed_at || null, imported_at: new Date().toISOString() });
  addedFollow++;
};
const toIso = (d) => { const t = Date.parse(d); return Number.isNaN(t) ? null : new Date(t).toISOString(); };

// Parcours tolérant de l'export officiel : les clés changent selon les versions, on cherche par nom.
function scanExport(obj, pathKeys = []) {
  if (Array.isArray(obj)) { obj.forEach((x) => scanExport(x, pathKeys)); return; }
  if (!obj || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase();
    if (Array.isArray(v) && /favoritevideolist|favorite videos/.test(key)) v.forEach((e) => addItem(e.Link || e.link || e.url, "favorites", toIso(e.Date || e.date)));
    else if (Array.isArray(v) && /itemfavoritelist|like list/.test(key)) v.forEach((e) => addItem(e.Link || e.link || e.url, "likes", toIso(e.Date || e.date)));
    else if (Array.isArray(v) && key === "videolist" && pathKeys.some((p) => /browsing|history/.test(p))) { if (a.history) v.forEach((e) => addItem(e.Link || e.link, "history", toIso(e.Date || e.date))); }
    else if (Array.isArray(v) && key === "following") v.forEach((e) => addFollow(e.UserName || e.username || e.handle, toIso(e.Date || e.date)));
    else if (Array.isArray(v) && /sharehistorylist/.test(key)) v.forEach((e) => addItem(e.Link || e.link, "shared", toIso(e.Date || e.date)));
    else if (v && typeof v === "object") scanExport(v, [...pathKeys, key]);
  }
}

// JSON produit par browser-extract.js : { kind: "favorites"|"likes"|"following"|"videos", items: [{url}|{handle}] }
function scanBrowser(j) {
  if (j.kind === "following") (j.items || []).forEach((e) => addFollow(e.handle, j.extracted_at));
  else (j.items || []).forEach((e) => addItem(e.url, a.source || j.kind || "favorites", j.extracted_at));
}

function handleFile(f) {
  if (f.endsWith(".txt")) { fs.readFileSync(f, "utf8").split(/\r?\n/).forEach((l) => addItem(l, a.source || "manual")); return; }
  if (!f.endsWith(".json")) return;
  const j = readJson(f);
  if (!j) return;
  if (j && j.kind && j.items) scanBrowser(j); else scanExport(j);
}

const stat = fs.statSync(input);
(stat.isDirectory() ? walk(input) : [input]).forEach(handleFile);

writeJson(ITEMS, [...items.values()]);
writeJson(FOLLOWING, [...following.values()]);
console.log(`TikTok import : +${added} vidéos (total ${items.size}), +${addedFollow} comptes suivis (total ${following.size}).`);
if (!a.history) console.log("Historique de visionnage ignoré (ajouter --history pour l'inclure).");
