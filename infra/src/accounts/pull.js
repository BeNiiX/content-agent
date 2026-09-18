// Relève hebdo des comptes TikTok (config/accounts.json) : profil (abonnés, likes, nb de posts) + N derniers posts
// avec vues / likes / commentaires / partages / sauvegardes, carrousels détectés (titre + images). Aucune API, aucun login :
// yt-dlp + lecture des pages publiques, comme la veille. Historise les vues par date pour mesurer la vélocité.
// Usage : node src/accounts/pull.js [--slug <slug>] [--n 60] [--media] [--force]
//   --media : télécharge les images des carrousels du top 10 (analyse locale seulement) → data/accounts/<slug>/media/<id>/
// Sortie : data/accounts/<slug>/posts.json (fusion), data/accounts/<slug>/snapshots/<date>.json (brut du jour)
import fs from "node:fs";
import path from "node:path";
import { DATA, CONFIG } from "../lib/paths.js";
import { env } from "../lib/env.js";
import { readJson, writeJson, args, sleep, today } from "../lib/fs.js";
import { listAuthorVideos } from "../lib/ytdlp.js";
import { fetchPhotoPost, downloadPhotoPost } from "../lib/photo.js";

const a = args();
const ACC = path.join(DATA, "accounts");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const delay = Number(env("YTDLP_DELAY_MS", "1500"));
const cfg = readJson(path.join(CONFIG, "accounts.json"), { accounts: {} });
const slugs = a.slug ? [a.slug] : Object.keys(cfg.accounts);
const N = Number(a.n || 60);

async function profile(handle) {
  const r = await fetch(`https://www.tiktok.com/@${handle}`, { headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" } });
  const html = await r.text();
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/s);
  if (!m) return { error: "profil illisible (blocage ?)" };
  const d = JSON.parse(m[1])?.__DEFAULT_SCOPE__?.["webapp.user-detail"];
  const u = d?.userInfo;
  if (d?.statusCode === 10221) return { error: "compte introuvable (handle à vérifier)" };
  if (!u?.stats) return { error: `stats absentes (statusCode ${d?.statusCode})` };
  return { followers: u.stats.followerCount ?? null, following: u.stats.followingCount ?? null, likes: u.stats.heartCount ?? u.stats.heart ?? null, posts: u.stats.videoCount ?? null, nickname: u.user?.nickname || null, bio: u.user?.signature || null, private: !!u.user?.privateAccount, verified: !!u.user?.verified };
}

for (const slug of slugs) {
  const acc = cfg.accounts[slug];
  if (!acc?.handle) { console.log(`- ${slug} : pas de handle`); continue; }
  const handle = acc.handle.replace(/^@/, "");
  const dir = path.join(ACC, slug);
  const file = path.join(dir, "posts.json");
  const prev = readJson(file, { slug, handle, posts: {}, profile_history: [] });
  const date = today();
  process.stdout.write(`${slug} (@${handle}) … `);
  let prof = {};
  try { prof = await profile(handle); } catch (e) { prof = { error: e.message }; }
  await sleep(delay);
  let entries = [];
  let note = null;
  try { entries = await listAuthorVideos("tiktok", handle, N); }
  catch (e) {
    const msg = e.message || "";
    if (/does not have any videos/i.test(msg)) note = "aucun post publié";
    else if (/private/i.test(msg)) note = "compte privé : posts non lisibles";
    else if (/secondary user ID|10221/i.test(msg)) note = acc.note || "compte introuvable : handle à vérifier (ou profil d'une autre région, non lisible d'ici)";
    else { console.log(`liste KO : ${msg}`); prev.last_error = { date, message: msg }; writeJson(file, prev); continue; }
  }
  let newCount = 0;
  for (const v of entries) {
    const id = String(v.id);
    const p = prev.posts[id] || { id, url: v.url || `https://www.tiktok.com/@${handle}/video/${id}`, first_seen: date, history: [] };
    p.title = v.title || p.title || ""; p.description = v.description || p.description || "";
    p.posted_at = v.timestamp ? new Date(v.timestamp * 1000).toISOString() : p.posted_at || null;
    p.duration_s = v.duration ?? p.duration_s ?? null;
    p.music = v.track ? `${v.track}${v.artists?.length ? " — " + v.artists.join(", ") : ""}` : p.music || null;
    const snap = { date, views: v.view_count ?? null, likes: v.like_count ?? null, comments: v.comment_count ?? null, shares: v.repost_count ?? null, saves: v.save_count ?? null };
    p.history = [...(p.history || []).filter((h) => h.date !== date), snap];
    p.stats = snap;
    if (!prev.posts[id]) newCount++;
    prev.posts[id] = p;
  }
  // Carrousels : yt-dlp ne le dit pas ; on lit la page pour les posts jamais typés (limité à 15 par relève pour rester poli).
  let typed = 0;
  for (const p of Object.values(prev.posts).sort((x, y) => (y.stats?.views || 0) - (x.stats?.views || 0))) {
    if (p.type || typed >= 15) continue;
    try { const ph = await fetchPhotoPost(p.url); p.type = "carousel"; p.slides = ph.images.length; p.carousel_title = ph.title; }
    catch (e) { p.type = /pas un carrousel/.test(e.message) ? "video" : p.type || null; if (!p.type) p.type_error = e.message; }
    typed++;
    await sleep(delay);
  }
  if (a.media) {
    const top = Object.values(prev.posts).filter((p) => p.type === "carousel").sort((x, y) => (y.stats?.views || 0) - (x.stats?.views || 0)).slice(0, 10);
    for (const p of top) {
      const mdir = path.join(dir, "media", p.id);
      if (fs.existsSync(path.join(mdir, "post.json")) && !a.force) continue;
      try { const r = await downloadPhotoPost(p.url, mdir); p.media_dir = path.relative(DATA, mdir); process.stdout.write(`[${p.id}: ${r.saved} img] `); } catch (e) { process.stdout.write(`[${p.id}: ${e.message}] `); }
      await sleep(delay);
    }
  }
  if (!prof.error) prev.profile_history = [...(prev.profile_history || []).filter((h) => h.date !== date), { date, ...prof }];
  prev.profile = prof.error ? { ...(prev.profile || {}), error: prof.error } : prof;
  prev.fetched_at = new Date().toISOString(); prev.handle = handle; delete prev.last_error; prev.note = note || prof.error || null;
  writeJson(file, prev);
  writeJson(path.join(dir, "snapshots", `${date}.json`), { date, profile: prof, posts: entries.map((v) => ({ id: v.id, views: v.view_count, likes: v.like_count, comments: v.comment_count, shares: v.repost_count, saves: v.save_count, title: v.title, timestamp: v.timestamp, duration: v.duration })) });
  console.log(`${Object.keys(prev.posts).length} posts (${newCount} nouveaux) · abonnés ${prof.followers ?? "?"} · likes ${prof.likes ?? "?"}${note ? " · " + note : ""}${prof.error ? " · profil : " + prof.error : ""}`);
  await sleep(delay);
}
