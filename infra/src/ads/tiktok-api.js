import { env, requireEnv } from "../lib/env.js";
const BASE = "https://business-api.tiktok.com/open_api/v1.3";
export function client() {
  requireEnv("TIKTOK_ADS_ACCESS_TOKEN", "TIKTOK_ADVERTISER_ID");
  const token = env("TIKTOK_ADS_ACCESS_TOKEN"), advertiser_id = env("TIKTOK_ADVERTISER_ID");
  const call = async (method, p, payload) => {
    const url = new URL(BASE + p);
    let body;
    if (method === "GET") { for (const [k, v] of Object.entries(payload || {})) url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v)); }
    else body = JSON.stringify(payload);
    const r = await fetch(url, { method, headers: { "Access-Token": token, "Content-Type": "application/json" }, body });
    const j = await r.json();
    if (j.code !== 0) throw new Error(`TikTok API ${p}: ${j.code} ${j.message}`);
    return j.data;
  };
  return { advertiser_id, get: (p, q) => call("GET", p, { advertiser_id, ...q }), post: (p, b) => call("POST", p, { advertiser_id, ...b }) };
}
