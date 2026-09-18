import { spawn } from "node:child_process";
import { env } from "./env.js";

const BIN = env("YTDLP_BIN", "yt-dlp");

function run(argsList, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(BIN, argsList, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    const t = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("yt-dlp timeout")); }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { clearTimeout(t); reject(e); });
    child.on("close", (code) => {
      clearTimeout(t);
      if (code !== 0 && (!out.trim() || out.trim() === "null")) return reject(new Error(err.trim().split("\n").slice(-3).join(" | ") || `yt-dlp exit ${code}`));
      resolve(out);
    });
  });
}

const common = () => {
  const a = ["--no-warnings", "--no-playlist", "--skip-download"];
  const cb = env("YTDLP_COOKIES_FROM_BROWSER");
  if (cb) a.push("--cookies-from-browser", cb);
  return a;
};

/** Métadonnées complètes d'une vidéo (objet JSON yt-dlp). */
export async function dumpJson(url) {
  const out = await run([...common(), "--dump-single-json", url]);
  const j = JSON.parse(out);
  if (!j || typeof j !== "object") throw new Error("vidéo indisponible (supprimée, privée ou géobloquée)");
  return j;
}

/** Liste (rapide) des N dernières vidéos d'un compte. Retourne les entrées brutes yt-dlp. */
export async function listAuthorVideos(platform, handle, n = 30, { flat = true } = {}) {
  const url = platform === "tiktok" ? `https://www.tiktok.com/@${handle}` : `https://www.instagram.com/${handle}/reels/`;
  const a = ["--no-warnings", "--skip-download", "--playlist-end", String(n), "--dump-single-json"];
  if (flat) a.push("--flat-playlist");
  const cb = env("YTDLP_COOKIES_FROM_BROWSER");
  if (cb) a.push("--cookies-from-browser", cb);
  const out = await run([...a, url], { timeoutMs: 300000 });
  const j = JSON.parse(out);
  if (!j || typeof j !== "object") throw new Error("compte illisible (privé, vide ou introuvable)");
  return (j.entries || []).filter(Boolean);
}

/** Télécharge le fichier vidéo (mp4) dans outDir, nom = <key>.<ext>. */
export async function download(url, outTemplate) {
  const a = ["--no-warnings", "--no-playlist", "-f", "mp4/bv*+ba/b", "--merge-output-format", "mp4", "-o", outTemplate];
  const cb = env("YTDLP_COOKIES_FROM_BROWSER");
  if (cb) a.push("--cookies-from-browser", cb);
  await run([...a, url], { timeoutMs: 300000 });
}

/** Normalise un objet yt-dlp en fiche vidéo commune. */
export function normalize(j, extra = {}) {
  const platform = extra.platform || (j.extractor_key?.toLowerCase().includes("tiktok") ? "tiktok" : j.extractor_key?.toLowerCase().includes("instagram") ? "instagram" : "other");
  const handle = j.uploader || j.uploader_id || j.channel_id || extra.handle || null;
  const text = j.description || j.title || "";
  const hashtags = [...new Set((text.match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => h.toLowerCase()))];
  return {
    key: `${platform}-${j.id}`,
    id: String(j.id),
    platform,
    url: j.webpage_url || extra.url,
    author: { handle, name: j.channel || j.uploader || null, followers: j.channel_follower_count ?? null },
    description: text,
    hashtags,
    music: { title: j.track || null, artist: j.artist || null },
    duration_s: j.duration ?? null,
    stats: {
      views: j.view_count ?? null,
      likes: j.like_count ?? null,
      comments: j.comment_count ?? null,
      shares: j.repost_count ?? null,
      saves: null,
    },
    posted_at: j.timestamp ? new Date(j.timestamp * 1000).toISOString() : (j.upload_date ? `${j.upload_date.slice(0, 4)}-${j.upload_date.slice(4, 6)}-${j.upload_date.slice(6, 8)}T00:00:00.000Z` : null),
    thumbnail: j.thumbnail || null,
    kind: (j.formats || []).some((f) => f.vcodec && f.vcodec !== "none") || j.width ? "video" : "photo",
    width: j.width ?? null,
    height: j.height ?? null,
    enriched_at: new Date().toISOString(),
    source: extra.source || null,
    saved_at: extra.saved_at || null,
  };
}
