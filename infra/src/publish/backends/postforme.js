// Backend de publication « Post for Me » (https://www.postforme.dev) — schémas pris dans https://api.postforme.dev/docs le 21/09/2026.
// Deux plateformes distinctes chez eux : `tiktok` (app développeur TikTok, Login Kit, lane CRÉATEUR — celle qu'on veut) et
// `tiktok_business` (lane Business, à ne pas utiliser). Brouillons : platform_configurations.tiktok.is_draft = true
// (« draft upload to TikTok, posting will need to be completed from within the app »). Médias par URL publique hébergée chez eux
// (create-upload-url → PUT → media_url). 10 $/mois, comptes illimités, 1 000 posts. Open source.
// .env : POSTFORME_API_KEY ; config/accounts.json : postforme_account_id par compte (node src/publish/daily-send.js --accounts).
import fs from "node:fs";
import path from "node:path";
import { env } from "../../lib/env.js";

const BASE = env("POSTFORME_API_BASE", "https://api.postforme.dev");
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".png": "image/png", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm" };
const KEY = () => { const k = env("POSTFORME_API_KEY"); if (!k) throw new Error("POSTFORME_API_KEY manquant dans .env"); return k; };

async function api(method, p, body) {
  const r = await fetch(BASE + p, { method, headers: { Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j; try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text }; }
  if (!r.ok) throw new Error(`Post for Me ${method} ${p} → HTTP ${r.status} : ${j.message || j.error?.message || j.error || text.slice(0, 300)}`);
  return j;
}

export const name = "postforme";
export async function probe() { return api("GET", "/v1/social-accounts?limit=50"); }
export async function listAccounts() {
  const j = await probe();
  return (j.data || []).map((a) => ({ id: a.id, username: a.username || a.user_name || a.display_name || null, network: a.platform || null, status: a.status || null, raw: a }));
}
// Lien d'autorisation (lane créateur `tiktok`) à ouvrir depuis l'appareil qui porte le compte ; external_id = slug pour se retrouver
export async function connectUrl({ externalId } = {}) { return api("POST", "/v1/social-accounts/auth-url", { platform: "tiktok", ...(externalId ? { external_id: externalId } : {}) }); }
export async function uploadMedia(filePath) {
  const filename = path.basename(filePath), contentType = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  const u = await api("POST", "/v1/media/create-upload-url", {});
  const put = await fetch(u.upload_url, { method: "PUT", headers: { "Content-Type": contentType }, body: fs.readFileSync(filePath) });
  if (!put.ok) throw new Error(`PUT média → HTTP ${put.status}`);
  return { url: u.media_url, filename };
}
export async function createDraft({ accountId, caption, files, mediaType, isAigc = false }) {
  const media = [];
  for (const f of files) media.push({ url: (await uploadMedia(f)).url });
  const j = await api("POST", "/v1/social-posts", {
    caption: caption || "", social_accounts: [accountId], media,
    platform_configurations: { tiktok: { is_draft: true, is_ai_generated: !!isAigc, allow_comment: true, ...(mediaType === "VIDEO" ? { allow_duet: true, allow_stitch: true } : {}) } },
  });
  const id = j.id || j.data?.id;
  if (!id) throw new Error(`réponse social-posts inattendue : ${JSON.stringify(j).slice(0, 300)}`);
  return { post_id: id, raw: j };
}
export async function status(postId) {
  const post = await api("GET", `/v1/social-posts/${postId}`);
  if (post.status !== "processed") return { state: "pending", platform_post_id: null, error: null, raw: post };
  const res = await api("GET", `/v1/social-post-results?post_id=${encodeURIComponent(postId)}&limit=5`);
  const r = (res.data || [])[0];
  if (!r) return { state: "pending", platform_post_id: null, error: null, raw: post };
  return { state: r.success ? "published" : "failed", platform_post_id: r.platform_data?.publish_id || r.platform_data?.id || null, error: r.success ? null : (typeof r.error === "string" ? r.error : JSON.stringify(r.error || {}).slice(0, 300)), raw: r };
}
