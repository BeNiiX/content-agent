import fs from "node:fs";
import path from "node:path";
import { INFRA_ROOT } from "./paths.js";

// Charge infra/.env sans dépendance. Les variables déjà présentes dans l'environnement gagnent.
const envPath = path.join(INFRA_ROOT, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
export const env = (k, d = "") => process.env[k] ?? d;
export const requireEnv = (...keys) => {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Variables manquantes dans infra/.env : ${missing.join(", ")}`);
    process.exit(2);
  }
};
