// Trace l'envoi d'un brouillon TikTok : fiche EXP (frontmatter) + ligne de 06_CALENDAR/QUEUE.md.
// Usage : node src/publish/mark-draft.js EXP-015 --publish-id <id> [--posted]  (--posted : l'humain a posté depuis l'app → status publié, à compléter avec post_url)
// `tiktok_publish_id` = identifiant renvoyé par le fournisseur d'envoi, préfixé par son nom (ex. « postforme:<post>/<publish_id TikTok> »).
import fs from "node:fs";
import path from "node:path";
import { CONTENT_ROOT } from "../lib/paths.js";
import { args, readJson, writeJson, today } from "../lib/fs.js";
import { jobPath } from "./lib.js";

const a = args();
const exp = a._[0];
if (!exp) { console.error("Usage : node src/publish/mark-draft.js EXP-015 --publish-id <id> [--posted --post-url <url>]"); process.exit(1); }
const file = path.join(CONTENT_ROOT, "04_EXPERIMENTS", `${exp}.md`);
if (!fs.existsSync(file)) { console.error(`${file} introuvable`); process.exit(1); }
const status = a.posted ? "publié" : "brouillon envoyé";
const set = { status, updated: today() };
if (a.posted) { set.published_at = today(); if (a["post-url"]) set.post_url = a["post-url"]; }
else { const prev = (fs.readFileSync(file, "utf8").match(/^tiktok_publish_id:\s*(.+)$/m) || [])[1]?.trim(); const prevAt = (fs.readFileSync(file, "utf8").match(/^draft_sent_at:\s*"?([^"\n]+)"?$/m) || [])[1]; set.draft_sent_at = prev && a["publish-id"] && prev === String(a["publish-id"]) && prevAt ? prevAt : new Date().toISOString(); if (a["publish-id"]) set.tiktok_publish_id = String(a["publish-id"]); }

let md = fs.readFileSync(file, "utf8");
const [, fm, rest] = md.match(/^---\n([\s\S]*?)\n---([\s\S]*)$/) || [];
if (fm === undefined) { console.error("frontmatter introuvable"); process.exit(1); }
let lines = fm.split("\n");
for (const [k, v] of Object.entries(set)) {
  const val = /[\s:«»]/.test(String(v)) && !/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? JSON.stringify(v) : String(v);
  const i = lines.findIndex((l) => l.startsWith(`${k}:`));
  const comment = i >= 0 ? (lines[i].match(/\s+#.*$/)?.[0] || "") : "";
  if (i >= 0) lines[i] = `${k}: ${val}${comment}`;
  else { const c = lines.findIndex((l) => l.startsWith("created:")); lines.splice(c >= 0 ? c : lines.length, 0, `${k}: ${val}`); }
}
fs.writeFileSync(file, `---\n${lines.join("\n")}\n---${rest}`);
console.log(`✓ ${path.relative(CONTENT_ROOT, file)} : ${Object.entries(set).map(([k, v]) => `${k}=${v}`).join(", ")}`);

const queue = path.join(CONTENT_ROOT, "06_CALENDAR", "QUEUE.md");
if (fs.existsSync(queue)) {
  const q = fs.readFileSync(queue, "utf8").split("\n");
  const i = q.findIndex((l) => l.startsWith("|") && l.includes(`| ${exp} |`));
  if (i >= 0) {
    let h = i; while (h > 0 && !/^\|\s*---/.test(q[h])) h--;   // ligne de séparation → l'en-tête est juste au-dessus
    const header = q[h - 1]?.split("|").map((c) => c.trim().toLowerCase()) || [];
    const cells = q[i].split("|");
    const si = header.findIndex((c) => c === "statut"), ti = header.findIndex((c) => /à ajouter|bloqué/.test(c));
    if (si > 0) cells[si] = ` **${status}** `;
    if (ti > 0 && !a.posted) cells[ti] = ` ${cells[ti].trim()} — dans les brouillons TikTok, à finaliser dans l'app `.replace(/( — dans les brouillons TikTok, à finaliser dans l'app )+/, " — dans les brouillons TikTok, à finaliser dans l'app ");
    if (ti > 0 && a.posted) cells[ti] = " — ";
    q[i] = cells.join("|");
    fs.writeFileSync(queue, q.join("\n"));
    console.log(`✓ 06_CALENDAR/QUEUE.md : ligne ${exp} → ${status}`);
  } else console.log(`(pas de ligne ${exp} dans QUEUE.md)`);
}
const job = readJson(jobPath(exp));
if (job) writeJson(jobPath(exp), { ...job, sent: { ...(job.sent || {}), ...set } });
