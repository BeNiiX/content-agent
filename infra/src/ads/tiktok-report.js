// Rapport TikTok Ads (Marketing API v1.3, report/integrated) par ad group ou par ad.
// Usage : node src/ads/tiktok-report.js [--days 7 | --start 2026-09-01 --end 2026-09-07] [--level adgroup|ad|campaign] [--json] [--save]
import path from "node:path";
import { client } from "./tiktok-api.js";
import { args, writeJson, today } from "../lib/fs.js";
import { ADS } from "../lib/paths.js";

const a = args();
const api = client();
const days = Number(a.days || 7);
const end = a.end || today();
const start = a.start || new Date(Date.parse(end) - (days - 1) * 86400000).toISOString().slice(0, 10);
const level = a.level || "adgroup";
const data_level = { campaign: "AUCTION_CAMPAIGN", adgroup: "AUCTION_ADGROUP", ad: "AUCTION_AD" }[level];
const dim = { campaign: "campaign_id", adgroup: "adgroup_id", ad: "ad_id" }[level];
const names = { campaign: ["campaign_name"], adgroup: ["campaign_name", "adgroup_name", "budget"], ad: ["campaign_name", "adgroup_name", "ad_name"] }[level];
const metrics = [...names, "spend", "impressions", "clicks", "ctr", "cpc", "cpm", "video_play_actions", "video_watched_2s", "video_watched_6s", "average_video_play", "app_install", "cost_per_app_install", "conversion", "cost_per_conversion", "conversion_rate", "purchase", "cost_per_purchase", "total_purchase_value", "real_time_app_install", "real_time_conversion"];
let page = 1, rows = [];
for (;;) {
  const d = await api.get("/report/integrated/get/", { report_type: "BASIC", data_level, dimensions: [dim], metrics, start_date: start, end_date: end, page, page_size: 200 });
  rows.push(...(d.list || []).map((x) => ({ ...x.dimensions, ...x.metrics })));
  if (!d.page_info || page >= d.page_info.total_page) break; page++;
}
const n = (x) => (x == null || x === "" ? null : Number(x));
const out = rows.map((r) => {
  const imp = n(r.impressions), v2 = n(r.video_watched_2s), v6 = n(r.video_watched_6s), spend = n(r.spend), inst = n(r.app_install) ?? n(r.conversion), pur = n(r.purchase);
  return { ...r, spend, impressions: imp, installs: inst, purchases: pur, thumbstop: imp ? +(v2 / imp).toFixed(3) : null, hold_rate: v2 ? +(v6 / v2).toFixed(3) : null, cpi: inst ? +(spend / inst).toFixed(2) : null, cpa_purchase: pur ? +(spend / pur).toFixed(2) : null, ctr: n(r.ctr) };
}).sort((x, y) => (y.spend ?? 0) - (x.spend ?? 0));
if (a.save || a.json) writeJson(path.join(ADS, `report-${level}-${start}_${end}.json`), { start, end, level, rows: out });
if (a.json) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
console.log(`TikTok Ads — ${level} — ${start} → ${end}\n`);
console.log("| Nom | Budget | Dépense | Impr. | Thumbstop | Hold | CTR | Installs | CPI | Achats | CPA |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const r of out) console.log(`| ${(r.adgroup_name || r.ad_name || r.campaign_name || r[dim]).slice(0, 40)} | ${r.budget ?? "—"} | ${r.spend?.toFixed(2) ?? "—"} | ${r.impressions ?? "—"} | ${r.thumbstop != null ? (r.thumbstop * 100).toFixed(0) + " %" : "—"} | ${r.hold_rate != null ? (r.hold_rate * 100).toFixed(0) + " %" : "—"} | ${r.ctr != null ? (r.ctr * 100).toFixed(2) + " %" : "—"} | ${r.installs ?? "—"} | ${r.cpi ?? "—"} | ${r.purchases ?? "—"} | ${r.cpa_purchase ?? "—"} |`);
const tot = out.reduce((s, r) => ({ spend: s.spend + (r.spend || 0), installs: s.installs + (r.installs || 0), purchases: s.purchases + (r.purchases || 0) }), { spend: 0, installs: 0, purchases: 0 });
console.log(`\nTotal : ${tot.spend.toFixed(2)} € · ${tot.installs} installs (CPI ${tot.installs ? (tot.spend / tot.installs).toFixed(2) : "—"}) · ${tot.purchases} achats (CPA ${tot.purchases ? (tot.spend / tot.purchases).toFixed(2) : "—"})`);
