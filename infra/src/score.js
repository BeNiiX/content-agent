// Calcule outlier_score, engagement_rate, share_rate, comment_rate, velocity, priority → data/videos/index.json
// Ajoute aussi les vidéos des comptes surveillés (authors/*.json) non enregistrées, marquées source "author-feed", si --include-feeds.
import path from "node:path";
import { VIDEOS, AUTHORS } from "./lib/paths.js";
import { readJson, writeJson, listJson, args } from "./lib/fs.js";

const a = args();
const authors = new Map();
for (const f of listJson(AUTHORS)) { const j = readJson(f); if (j?.handle) authors.set(`${j.platform}-${j.handle.toLowerCase()}`, j); }
const rows = [];
const safeDiv = (x, y) => (x == null || !y ? null : x / y);

export function scoreVideo(v, author) {
  const s = v.stats || {};
  const views = s.views ?? null;
  const inter = ["likes", "comments", "shares", "saves"].reduce((acc, k) => acc + (s[k] ?? 0), 0);
  const days = v.posted_at ? Math.max(1, (Date.now() - Date.parse(v.posted_at)) / 86400000) : null;
  const outlier = author?.median_views ? safeDiv(views, author.median_views) : null;
  const share_rate = safeDiv(s.shares, views), comment_rate = safeDiv(s.comments, views);
  const engagement_rate = views ? inter / views : null;
  const priority = outlier != null ? outlier * (1 + (share_rate ?? 0) * 50 + (comment_rate ?? 0) * 20) : engagement_rate != null ? engagement_rate * 10 : 0;
  return { outlier_score: outlier != null ? +outlier.toFixed(2) : null, engagement_rate: engagement_rate != null ? +engagement_rate.toFixed(4) : null, share_rate: share_rate != null ? +share_rate.toFixed(4) : null, comment_rate: comment_rate != null ? +comment_rate.toFixed(4) : null, velocity: days && views != null ? Math.round(views / days) : null, priority: +priority.toFixed(2), author_median_views: author?.median_views ?? null, author_followers: author?.followers ?? v.author?.followers ?? null };
}

for (const f of listJson(VIDEOS)) {
  if (path.basename(f).startsWith("_") || path.basename(f) === "index.json") continue;
  const v = readJson(f); if (!v?.key) continue;
  const author = authors.get(`${v.platform}-${String(v.author?.handle || "").toLowerCase()}`);
  const sc = scoreVideo(v, author);
  Object.assign(v, sc);
  writeJson(f, v);
  rows.push({ key: v.key, platform: v.platform, kind: v.kind || "video", url: v.url, handle: v.author?.handle, description: (v.description || "").slice(0, 160), hashtags: v.hashtags, music: v.music?.title, duration_s: v.duration_s, views: v.stats?.views, likes: v.stats?.likes, comments: v.stats?.comments, shares: v.stats?.shares, posted_at: v.posted_at, saved_at: v.saved_at, sources: v.sources, ...sc });
}
if (a["include-feeds"]) {
  const have = new Set(rows.map((r) => r.key));
  for (const au of authors.values()) for (const x of au.videos || []) {
    const key = `${au.platform}-${x.id}`; if (have.has(key) || x.views == null) continue;
    const sc = scoreVideo({ stats: { views: x.views, likes: x.likes, comments: x.comments, shares: x.shares }, posted_at: x.posted_at, author: { handle: au.handle } }, au);
    rows.push({ key, platform: au.platform, url: x.url, handle: au.handle, description: x.title, hashtags: [], music: null, duration_s: null, views: x.views, likes: x.likes, comments: x.comments, shares: x.shares, posted_at: x.posted_at, saved_at: null, sources: ["author-feed"], ...sc });
  }
}
rows.sort((x, y) => y.priority - x.priority);
writeJson(path.join(VIDEOS, "index.json"), { generated_at: new Date().toISOString(), count: rows.length, rows });
const withOutlier = rows.filter((r) => r.outlier_score != null);
console.log(`Scoring : ${rows.length} vidéos, ${withOutlier.length} avec outlier_score, ${withOutlier.filter((r) => r.outlier_score >= 3).length} outliers ≥ 3.`);
