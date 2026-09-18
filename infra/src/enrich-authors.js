// Pour chaque compte (auteurs des vidéos enrichies + following + config/competitors.json) : récupère
// les N dernières vidéos et calcule la médiane de vues → data/tiktok/authors/<platform>-<handle>.json
// Options : --limit N comptes  --force  --ttl-days 7 (rafraîchir si plus vieux)  --handle <h> [--platform tiktok]  --only-videos (auteurs des vidéos enrichies seulement)
import path from "node:path";
import { AUTHORS, VIDEOS, TIKTOK, INSTAGRAM, CONFIG } from "./lib/paths.js";
import { env } from "./lib/env.js";
import { readJson, writeJson, listJson, args, sleep } from "./lib/fs.js";
import { listAuthorVideos } from "./lib/ytdlp.js";

const a = args();
const N = Number(env("AUTHOR_SAMPLE_SIZE", "30"));
const delay = Number(env("YTDLP_DELAY_MS", "1500"));
const ttl = Number(a["ttl-days"] || 7) * 86400000;
const median = (xs) => { const s = xs.filter((x) => typeof x === "number").sort((x, y) => x - y); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const targets = new Map(); // key platform-handle → {platform, handle, reasons[]}
const add = (platform, handle, reason) => { if (!handle) return; const k = `${platform}-${handle.toLowerCase()}`; const t = targets.get(k) || { platform, handle, reasons: [] }; if (!t.reasons.includes(reason)) t.reasons.push(reason); targets.set(k, t); };
if (a.handle) add(a.platform || "tiktok", a.handle, "manual");
else {
  for (const f of listJson(VIDEOS)) { const v = readJson(f); if (v?.author?.handle) add(v.platform, v.author.handle, "saved-video"); }
  if (!a["only-videos"]) {
    (readJson(path.join(TIKTOK, "following.json"), []) || []).forEach((x) => add("tiktok", x.handle, "following"));
    (readJson(path.join(INSTAGRAM, "following.json"), []) || []).forEach((x) => add("instagram", x.handle, "following"));
    const cfg = readJson(path.join(CONFIG, "competitors.json"), {}) || {};
    (cfg.tiktok || []).forEach((h) => add("tiktok", h, "competitor"));
    (cfg.instagram || []).forEach((h) => add("instagram", h, "competitor"));
  }
}
// Priorité : concurrents et auteurs de vidéos enregistrées d'abord, following ensuite.
const order = (t) => (t.reasons.includes("competitor") ? 0 : t.reasons.includes("saved-video") ? 1 : 2);
const list = [...targets.values()].sort((x, y) => order(x) - order(y));
const limit = a.limit ? Number(a.limit) : Infinity;
let done = 0, skipped = 0, failed = 0;

for (const t of list) {
  if (done >= limit) break;
  const file = path.join(AUTHORS, `${t.platform}-${t.handle.toLowerCase()}.json`);
  const prev = readJson(file);
  if (!a.force && prev?.fetched_at && Date.now() - Date.parse(prev.fetched_at) < ttl) { skipped++; continue; }
  if (!a.force && prev?.error_count >= 2 && Date.now() - Date.parse(prev.fetched_at || 0) < ttl * 4) { skipped++; continue; }
  try {
    let entries = await listAuthorVideos(t.platform, t.handle, N, { flat: true });
    // Certaines versions de yt-dlp ne renvoient pas view_count en mode flat : repli sur extraction complète (plus lent).
    if (entries.length && entries.every((e) => e.view_count == null)) entries = await listAuthorVideos(t.platform, t.handle, N, { flat: false });
    const videos = entries.map((e) => ({ id: String(e.id), views: e.view_count ?? null, likes: e.like_count ?? null, comments: e.comment_count ?? null, shares: e.repost_count ?? null, posted_at: e.timestamp ? new Date(e.timestamp * 1000).toISOString() : null, title: (e.title || e.description || "").slice(0, 120), url: e.webpage_url || e.url || null }));
    const views = videos.map((v) => v.views);
    const out = { platform: t.platform, handle: t.handle, reasons: t.reasons, fetched_at: new Date().toISOString(), sample_size: videos.length, median_views: median(views), mean_views: views.filter((x) => x != null).length ? Math.round(views.filter((x) => x != null).reduce((s, x) => s + x, 0) / views.filter((x) => x != null).length) : null, max_views: views.filter((x) => x != null).length ? Math.max(...views.filter((x) => x != null)) : null, followers: entries[0]?.channel_follower_count ?? prev?.followers ?? null, videos, error_count: 0 };
    writeJson(file, out);
    done++;
    console.log(`✓ @${t.handle} (${t.platform}) médiane ${out.median_views ?? "?"} sur ${out.sample_size} vidéos`);
  } catch (e) {
    failed++;
    writeJson(file, { ...(prev || {}), platform: t.platform, handle: t.handle, reasons: t.reasons, fetched_at: new Date().toISOString(), error_count: (prev?.error_count || 0) + 1, error: String(e.message).slice(0, 200) });
    console.warn(`✗ @${t.handle} — ${e.message}`);
  }
  await sleep(delay);
}
console.log(`Comptes : ${done} rafraîchis, ${skipped} à jour/ignorés, ${failed} erreurs.`);
