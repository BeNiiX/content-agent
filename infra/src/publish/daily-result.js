// Enregistre le résultat d'un envoi du plan du jour (appelé par la session Claude headless après chaque tiktok_publish_status).
// Usage : node src/publish/daily-result.js EXP-070 --status sent|failed --publish-id <id> [--reason texte] [--date AAAA-MM-JJ]
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DATA } from "../lib/paths.js";
import { args, readJson, writeJson, today } from "../lib/fs.js";

const a = args();
const exp = a._[0]; const date = a.date || today();
const planFile = path.join(DATA, "publish", "daily", `${date}.json`);
const plan = readJson(planFile);
if (!exp || !plan) { console.error("Usage : node src/publish/daily-result.js EXP-070 --status sent|failed [--publish-id id] [--reason txt]"); process.exit(1); }
const it = plan.items.find((x) => x.exp === exp);
if (!it) { console.error(`${exp} n'est pas dans le plan du ${date}`); process.exit(1); }
it.status = a.status === "sent" ? "sent" : "failed";
it.publish_id = a["publish-id"] || it.publish_id || null;
it.reason = a.reason || null;
it.finished_at = new Date().toISOString();
writeJson(planFile, plan);
if (it.status === "sent" && it.publish_id) {
  const r = spawnSync(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname), "mark-draft.js"), exp, "--publish-id", it.publish_id, "--connector", it.connector_id], { encoding: "utf8" });
  process.stdout.write(r.stdout || ""); if (r.status !== 0) console.error(r.stderr);
}
console.log(`✓ plan ${date} : ${exp} → ${it.status}${it.reason ? " (" + it.reason + ")" : ""}`);
