// Télécharge les MP4 des vidéos (pour visionnage / transcription locale uniquement) → data/media/<key>.mp4
// Options : --min-outlier 3  --key tiktok-123  --limit 10
import path from "node:path";
import fs from "node:fs";
import { VIDEOS, MEDIA } from "./lib/paths.js";
import { env } from "./lib/env.js";
import { readJson, args, sleep } from "./lib/fs.js";
import { download } from "./lib/ytdlp.js";
import { downloadPhotoPost } from "./lib/photo.js";

const a = args();
const idx = readJson(path.join(VIDEOS, "index.json"), { rows: [] });
let list = idx.rows;
if (a.key) list = list.filter((r) => r.key === a.key);
if (a["min-outlier"]) list = list.filter((r) => (r.outlier_score ?? 0) >= Number(a["min-outlier"]));
const limit = a.limit ? Number(a.limit) : 20;
let n = 0;
fs.mkdirSync(MEDIA, { recursive: true });
for (const r of list) {
  if (n >= limit) break;
  const out = path.join(MEDIA, `${r.key}.mp4`);
  if (fs.existsSync(out)) continue;
  const photoDir = path.join(MEDIA, r.key);
  if (fs.existsSync(path.join(photoDir, "post.json"))) continue;
  try {
    if (r.kind === "photo") { const p = await downloadPhotoPost(r.url, photoDir); n++; console.log(`✓ ${photoDir}/ (${p.saved} images)`); continue; }
    await download(r.url, path.join(MEDIA, `${r.key}.%(ext)s`));
    if (fs.existsSync(out)) { n++; console.log(`✓ ${out}`); }
    else { // yt-dlp n'a produit que l'audio : c'est un carrousel photo
      const p = await downloadPhotoPost(r.url, photoDir); n++; console.log(`✓ ${photoDir}/ (${p.saved} images, carrousel photo)`);
    }
  } catch (e) { console.warn(`✗ ${r.key} — ${e.message}`); }
  await sleep(Number(env("YTDLP_DELAY_MS", "1500")));
}
console.log(`${n} vidéos téléchargées dans data/media/`);
