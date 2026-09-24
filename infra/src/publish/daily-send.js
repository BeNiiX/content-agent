// Envoi du soir en Node pur (aucun modèle dans la boucle) : lit le plan du jour, envoie chaque item `planned` en brouillon
// via le backend choisi (PUBLISH_BACKEND, ex. `postforme`), trace le résultat (daily-result.js → fiche EXP + QUEUE), puis
// daily-notify.js envoie le message. Quelques secondes par compte pour la soumission.
// Usage : node src/publish/daily-send.js [--date AAAA-MM-JJ] [--exp EXP-070] [--probe] [--accounts] [--connect-url <slug>]
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DATA, CONTENT_ROOT } from "../lib/paths.js";
import { env } from "../lib/env.js";
import { args, readJson, writeJson, today } from "../lib/fs.js";
import { accountsConfig } from "./lib.js";

const a = args();
const backendName = env("PUBLISH_BACKEND", "");
if (!backendName) { console.error("✗ PUBLISH_BACKEND absent de .env : aucun backend de publication choisi (ex. postforme). Rien n'a été envoyé."); process.exit(2); }
let backend; try { backend = await import(`./backends/${backendName}.js`); } catch { console.error(`✗ PUBLISH_BACKEND=${backendName} inconnu : pas de src/publish/backends/${backendName}.js`); process.exit(2); }
const here = path.dirname(new URL(import.meta.url).pathname);
const result = (exp, status, extra = []) => { const r = spawnSync(process.execPath, [path.join(here, "daily-result.js"), exp, "--status", status, ...extra], { encoding: "utf8" }); process.stdout.write(r.stdout || ""); if (r.status !== 0) console.error(r.stderr); };

const die = (e) => { console.error(`✗ ${e.message}`); process.exit(1); };
if (a["connect-url"] && backend.connectUrl) { try { const j = await backend.connectUrl({ redirectUrl: env("PUBLISH_CONNECT_REDIRECT", "") || undefined, externalId: typeof a["connect-url"] === "string" ? a["connect-url"] : undefined }); console.log(j.authUrl || j.url); } catch (e) { die(e); } process.exit(0); }
if (a.probe) { try { const j = await backend.probe(); console.log(JSON.stringify(j, null, 2).slice(0, 4000)); } catch (e) { die(e); } process.exit(0); }
if (a.accounts) {
  const cfg = accountsConfig().accounts;
  for (const acc of await backend.listAccounts().catch(die)) {
    const slug = Object.entries(cfg).find(([, c]) => c[`${backendName}_account_id`] === acc.id || (acc.username && c.handle && c.handle.replace(/^@/, "").toLowerCase() === String(acc.username).replace(/^@/, "").toLowerCase()))?.[0];
    console.log(`${acc.id}  ${acc.username || "?"}  ${acc.network || ""}  ${acc.status || ""}  → ${slug ? slug + (cfg[slug][`${backendName}_account_id`] ? "" : "  (à reporter dans config/accounts.json : \"" + backendName + "_account_id\")") : "compte inconnu de config/accounts.json"}`);
  }
  process.exit(0);
}

const date = a.date || today();
const plan = readJson(path.join(DATA, "publish", "daily", `${date}.json`));
if (!plan) { console.error(`pas de plan pour ${date} : node src/publish/daily-plan.js`); process.exit(1); }
const cfg = accountsConfig().accounts;
// Phase 1 : soumettre tous les items (quelques secondes chacun). Phase 2 : attendre la confirmation réelle de la plateforme
// (Post for Me met 5 à 20 min à livrer un brouillon TikTok) jusqu'à DAILY_SEND_WAIT_MIN, puis tracer et laisser daily-notify parler.
const planned = plan.items.filter((it) => it.status === "planned" && (!a.exp || it.exp === a.exp));
const configured = planned.filter((it) => cfg[it.slug]?.[`${backendName}_account_id`]).length;
if (planned.length && !configured) { console.error(`✗ aucun compte du plan n'a de ${backendName}_account_id dans config/accounts.json : configuration incomplète, rien n'est envoyé ni marqué en échec (node src/publish/daily-send.js --accounts)`); process.exit(2); }
const pending = []; let sent = 0, failed = 0;
for (const it of plan.items) {
  if (it.status !== "planned" || (a.exp && it.exp !== a.exp)) continue;
  const job = readJson(path.join(DATA, "publish", "jobs", `${it.exp}.json`));
  const accountId = cfg[it.slug]?.[`${backendName}_account_id`];
  if (backend.useKey) backend.useKey(cfg[it.slug]?.[`${backendName}_key_env`]);
  const t0 = Date.now();
  try {
    if (!job) throw new Error("job introuvable (daily-plan.js)");
    if (!accountId) throw new Error(`${backendName}_account_id manquant pour ${it.slug} dans config/accounts.json (node src/publish/daily-send.js --accounts)`);
    const files = job.files.map((f) => f.path);
    const caption = it.media_type === "PHOTO" ? it.title_param : (it.in_app?.caption || it.title_param || "");
    const r = await backend.createDraft({ accountId, caption, files, mediaType: it.media_type, isAigc: !!it.is_aigc, coverIndex: 0 });
    pending.push({ it, post_id: r.post_id, submitted_in_s: (Date.now() - t0) / 1000 });
    console.log(`→ ${it.slug} ${it.exp} soumis (${r.post_id}) en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) { result(it.exp, "failed", ["--reason", String(e.message).slice(0, 300)]); console.log(`✗ ${it.slug} ${it.exp} : ${e.message}`); failed++; }
}
const waitMin = Number(env("DAILY_SEND_WAIT_MIN", "40")), deadline = Date.now() + waitMin * 60000;
while (pending.length && Date.now() < deadline) {
  for (const p of [...pending]) {
    let st; try { st = await backend.status(p.post_id); } catch (e) { st = { state: "pending", error: e.message }; }
    if (st.state === "pending") continue;
    pending.splice(pending.indexOf(p), 1);
    if (st.state === "failed") { result(p.it.exp, "failed", ["--reason", String(st.error || "échec plateforme").slice(0, 300)]); console.log(`✗ ${p.it.slug} ${p.it.exp} : ${st.error}`); failed++; }
    else { result(p.it.exp, "sent", ["--publish-id", `${backendName}:${p.post_id}${st.platform_post_id ? "/" + st.platform_post_id : ""}`]); console.log(`✓ ${p.it.slug} ${p.it.exp} → brouillon livré (${st.platform_post_id || "?"})`); sent++; }
  }
  if (pending.length) await new Promise((r) => setTimeout(r, 30000));
}
for (const p of pending) { result(p.it.exp, "failed", ["--reason", `toujours en traitement chez ${backendName} après ${waitMin} min (post ${p.post_id}) : vérifier plus tard, le brouillon peut encore arriver`]); console.log(`⏳ ${p.it.slug} ${p.it.exp} : encore en traitement (${p.post_id})`); failed++; }
console.log(`résumé : ${sent} envoyé(s), ${failed} échec(s) ou en attente`);
