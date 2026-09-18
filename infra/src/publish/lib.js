import fs from "node:fs";
import path from "node:path";
import { DATA, CONFIG } from "../lib/paths.js";
export const PUBLISH = path.join(DATA, "publish");
export const JOBS = path.join(PUBLISH, "jobs");
export const jobPath = (exp) => path.join(JOBS, `${exp}.json`);
export const presignedPath = (exp) => path.join(JOBS, `${exp}.presigned.json`);
export const uploadedPath = (exp) => path.join(JOBS, `${exp}.uploaded.json`);

// Comptes TikTok connectés (config/accounts.json) : slug → { handle, connector_id, role }.
export const accountsConfig = () => {
  try { return JSON.parse(fs.readFileSync(path.join(CONFIG, "accounts.json"), "utf8")); } catch { return { accounts: {}, default: null }; }
};
export const resolveAccount = (slug) => {
  const cfg = accountsConfig();
  const key = slug && cfg.accounts[slug] ? slug : cfg.default;
  const a = (key && cfg.accounts[key]) || {};
  return { slug: key || slug || null, handle: a.handle || null, device: a.device || null, connector_id: a.paused ? null : a.connector_id || null, role: a.role || null, paused: !!a.paused, unknown: !!(slug && !cfg.accounts[slug]) };
};
