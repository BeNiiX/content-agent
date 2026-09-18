// Importe l'export Instagram (JSON) : saved/saved_posts.json, likes/liked_posts.json, followers_and_following/following.json
// Usage : node src/instagram/import-export.js <dossier export | fichier.json | urls.txt>
import fs from "node:fs";
import path from "node:path";
import { INSTAGRAM, RAW } from "../lib/paths.js";
import { readJson, writeJson, walk, args } from "../lib/fs.js";
import { parseUrl } from "../lib/urls.js";

const a = args();
const input = a._[0] || path.join(RAW, "instagram");
const ITEMS = path.join(INSTAGRAM, "items.json");
const FOLLOWING = path.join(INSTAGRAM, "following.json");
const items = new Map((readJson(ITEMS, []) || []).map((x) => [x.url, x]));
const following = new Map((readJson(FOLLOWING, []) || []).map((x) => [x.handle.toLowerCase(), x]));
let added = 0, addedFollow = 0;
const ts = (t) => (t ? new Date(t * 1000).toISOString() : null);

const addItem = (url, source, saved_at) => {
  const p = parseUrl(url);
  if (!p || p.platform !== "instagram") return;
  const prev = items.get(p.url);
  if (prev) { if (!prev.sources.includes(source)) prev.sources.push(source); return; }
  items.set(p.url, { url: p.url, id: p.id, handle: null, platform: "instagram", sources: [source], saved_at, imported_at: new Date().toISOString() });
  added++;
};
const addFollow = (handle, followed_at) => {
  const h = String(handle || "").replace(/^@/, "").trim();
  if (!h || following.has(h.toLowerCase())) return;
  following.set(h.toLowerCase(), { handle: h, platform: "instagram", followed_at, imported_at: new Date().toISOString() });
  addedFollow++;
};

function scan(j, file) {
  const f = file.toLowerCase();
  if (Array.isArray(j.saved_saved_media)) j.saved_saved_media.forEach((e) => { const d = e.string_map_data?.["Saved on"] || Object.values(e.string_map_data || {})[0]; addItem(d?.href, "saved", ts(d?.timestamp)); });
  else if (Array.isArray(j.likes_media_likes)) j.likes_media_likes.forEach((e) => { const d = e.string_list_data?.[0]; addItem(d?.href, "likes", ts(d?.timestamp)); });
  else if (Array.isArray(j.relationships_following)) j.relationships_following.forEach((e) => { const d = e.string_list_data?.[0]; addFollow(d?.value || e.title, ts(d?.timestamp)); });
  else if (j.kind && j.items) (j.items || []).forEach((e) => (j.kind === "following" ? addFollow(e.handle, j.extracted_at) : addItem(e.url, j.kind, j.extracted_at)));
  else if (f.includes("following") && Array.isArray(j)) j.forEach((e) => addFollow(e.string_list_data?.[0]?.value || e.title, ts(e.string_list_data?.[0]?.timestamp)));
}
const files = fs.statSync(input).isDirectory() ? walk(input) : [input];
for (const f of files) {
  if (f.endsWith(".txt")) { fs.readFileSync(f, "utf8").split(/\r?\n/).forEach((l) => addItem(l, "manual", null)); continue; }
  if (!f.endsWith(".json")) continue;
  const j = readJson(f); if (j) scan(j, f);
}
writeJson(ITEMS, [...items.values()]);
writeJson(FOLLOWING, [...following.values()]);
console.log(`Instagram import : +${added} posts (total ${items.size}), +${addedFollow} comptes suivis (total ${following.size}).`);
