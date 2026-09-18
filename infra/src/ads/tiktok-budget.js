// Modifie le budget journalier ou le statut d'un ad group. À n'exécuter qu'après validation (05_CAMPAIGNS/BUDGET_RULES.md).
// Usage : node src/ads/tiktok-budget.js --adgroup <id> --budget 40        (budget quotidien, en devise du compte)
//         node src/ads/tiktok-budget.js --adgroup <id> --status ENABLE|DISABLE
//         node src/ads/tiktok-budget.js --list                              (ad groups + budgets + statut)
//         ajouter --dry-run pour afficher sans envoyer
import { client } from "./tiktok-api.js";
import { args } from "../lib/fs.js";

const a = args();
const api = client();
if (a.list) {
  const d = await api.get("/adgroup/get/", { page_size: 100, fields: ["adgroup_id", "adgroup_name", "campaign_name", "budget", "budget_mode", "operation_status", "secondary_status", "optimization_goal"] });
  for (const g of d.list || []) console.log(`${g.adgroup_id}  ${g.operation_status.padEnd(7)} ${String(g.budget).padStart(7)} ${g.budget_mode}  ${g.campaign_name} / ${g.adgroup_name}  [${g.optimization_goal}]`);
  process.exit(0);
}
if (!a.adgroup) { console.error("--adgroup <id> requis"); process.exit(1); }
const log = (what) => console.log(`${new Date().toISOString()} ${a["dry-run"] ? "[DRY-RUN] " : ""}${what} → à journaliser dans 05_CAMPAIGNS/CAMPAIGNS.md`);
if (a.budget) {
  const body = { adgroups: [{ adgroup_id: String(a.adgroup), budget: Number(a.budget) }] };
  if (!a["dry-run"]) await api.post("/adgroup/budget/update/", body);
  log(`budget ad group ${a.adgroup} = ${a.budget} / jour`);
}
if (a.status) {
  const body = { adgroup_ids: [String(a.adgroup)], operation_status: String(a.status).toUpperCase() };
  if (!a["dry-run"]) await api.post("/adgroup/status/update/", body);
  log(`statut ad group ${a.adgroup} = ${a.status}`);
}
