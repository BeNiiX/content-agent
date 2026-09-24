import fs from "node:fs";
import path from "node:path";
import { DATA, CONFIG } from "../lib/paths.js";
import { env } from "../lib/env.js";
export const PUBLISH = path.join(DATA, "publish");
export const JOBS = path.join(PUBLISH, "jobs");
export const jobPath = (exp) => path.join(JOBS, `${exp}.json`);

// Comptes TikTok (config/accounts.json) : slug → { handle, <backend>_account_id, role }.
export const accountsConfig = () => {
  try { return JSON.parse(fs.readFileSync(path.join(CONFIG, "accounts.json"), "utf8")); } catch { return { accounts: {}, default: null }; }
};
// Fournisseur d'envoi des brouillons (PUBLISH_BACKEND de .env) et identifiant du compte chez lui.
export const backendName = () => env("PUBLISH_BACKEND", "");
export const accountIdOf = (a = {}) => { const b = backendName(); return (b && a[`${b}_account_id`]) || null; };
export const resolveAccount = (slug) => {
  const cfg = accountsConfig();
  const key = slug && cfg.accounts[slug] ? slug : cfg.default;
  const a = (key && cfg.accounts[key]) || {};
  return { slug: key || slug || null, handle: a.handle || null, device: a.device || null, backend: backendName() || null, account_id: a.paused ? null : accountIdOf(a), role: a.role || null, paused: !!a.paused, unknown: !!(slug && !cfg.accounts[slug]) };
};
