// Enrichit chaque URL importée (TikTok + Instagram) avec yt-dlp → data/videos/<platform>-<id>.json
// Options : --limit N  --since AAAA-MM-JJ (saved_at ≥)  --force (re-enrichir)  --platform tiktok|instagram  --url <une url>
import path from "node:path";
import fs from "node:fs";
import { TIKTOK, INSTAGRAM, VIDEOS } from "./lib/paths.js";
import { env } from "./lib/env.js";
import { readJson, writeJson, args, sleep } from "./lib/fs.js";
import { dumpJson, normalize } from "./lib/ytdlp.js";
import { parseUrl } from "./lib/urls.js";

const a = args();
const delay = Number(env("YTDLP_DELAY_MS", "1500"));
let queue = [];
if (a.url) queue = [{ url: a.url, sources: ["manual"], platform: parseUrl(a.url)?.platform }];
else queue = [...(readJson(path.join(TIKTOK, "items.json"), []) || []), ...(readJson(path.join(INSTAGRAM, "items.json"), []) || [])];
if (a.platform) queue = queue.filter((x) => x.platform === a.platform);
if (a.since) queue = queue.filter((x) => !x.saved_at || x.saved_at >= a.since);
queue.sort((x, y) => (y.saved_at || "").localeCompare(x.saved_at || ""));

const existing = new Set(fs.existsSync(VIDEOS) ? fs.readdirSync(VIDEOS) : []);
const errorsFile = path.join(VIDEOS, "_errors.json");
const errors = readJson(errorsFile, {}) || {};
let done = 0, skipped = 0, failed = 0;
const limit = a.limit ? Number(a.limit) : Infinity;

for (const item of queue) {
  if (done >= limit) break;
  const p = parseUrl(item.url);
  const guessKey = p?.id ? `${p.platform}-${p.id}.json` : null;
  if (!a.force && guessKey && existing.has(guessKey)) { skipped++; continue; }
  if (!a.force && errors[item.url] && errors[item.url].count >= 3) { skipped++; continue; }
  try {
    const j = await dumpJson(item.url);
    const v = normalize(j, { platform: p?.platform, url: item.url, source: item.sources?.[0], saved_at: item.saved_at });
    v.sources = item.sources || [];
    writeJson(path.join(VIDEOS, `${v.key}.json`), v);
    delete errors[item.url];
    done++;
    console.log(`✓ ${v.key} @${v.author.handle} ${v.stats.views ?? "?"} vues`);
  } catch (e) {
    failed++;
    errors[item.url] = { count: (errors[item.url]?.count || 0) + 1, last: new Date().toISOString(), error: String(e.message).slice(0, 200) };
    console.warn(`✗ ${item.url} — ${e.message}`);
  }
  await sleep(delay);
}
writeJson(errorsFile, errors);
console.log(`Enrichissement : ${done} ok, ${skipped} déjà faits/ignorés, ${failed} erreurs (voir data/videos/_errors.json).`);
