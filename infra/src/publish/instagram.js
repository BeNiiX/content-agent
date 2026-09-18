// Publie un Reel Instagram via Graph API (conteneur REELS → attente → publish).
// Usage : node src/publish/instagram.js --video-url https://... --caption "..." [--cover-url ...] [--share-to-feed] [--dry-run]
// La vidéo doit être accessible publiquement (MP4, 9:16, ≤ 15 min, ≤ 1 Go). Pré-requis .env : IG_USER_ID, IG_ACCESS_TOKEN.
import { env, requireEnv } from "../lib/env.js";
import { args, sleep } from "../lib/fs.js";

const a = args();
if (!a["video-url"]) { console.error("--video-url requis"); process.exit(1); }
requireEnv("IG_USER_ID", "IG_ACCESS_TOKEN");
const V = env("GRAPH_API_VERSION", "v21.0"), ID = env("IG_USER_ID"), TOKEN = env("IG_ACCESS_TOKEN");
const call = async (p, params, method = "POST") => {
  const url = new URL(`https://graph.facebook.com/${V}/${p}`);
  for (const [k, v] of Object.entries({ ...params, access_token: TOKEN })) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  const r = await fetch(url, { method });
  const j = await r.json();
  if (j.error) throw new Error(`Graph API ${p}: ${j.error.message}`);
  return j;
};
const params = { media_type: "REELS", video_url: a["video-url"], caption: a.caption || "", share_to_feed: a["share-to-feed"] ? "true" : "false", cover_url: a["cover-url"] };
if (a["dry-run"]) { console.log("[DRY-RUN]", params); process.exit(0); }
const { id: creation_id } = await call(`${ID}/media`, params);
console.log(`Conteneur ${creation_id} créé, attente du traitement…`);
for (let i = 0; i < 40; i++) {
  const s = await call(creation_id, { fields: "status_code,status" }, "GET");
  if (s.status_code === "FINISHED") break;
  if (s.status_code === "ERROR") throw new Error(`Traitement échoué : ${s.status}`);
  await sleep(5000);
}
const { id } = await call(`${ID}/media_publish`, { creation_id });
const perma = await call(id, { fields: "permalink" }, "GET");
console.log(`Publié : ${perma.permalink} (media id ${id}) → à reporter dans la fiche EXP (post_url, published_at).`);
