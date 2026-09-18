// Rapport hebdo des comptes à partir de data/accounts/<slug>/posts.json :
//  - 08_ACCOUNTS/<slug>/STATS.md : profil, médiane de vues, 7 derniers jours, top 10 historique, vélocité (delta de vues depuis la relève précédente)
//  - 06_CALENDAR/stats/<date>.md : digest tous comptes (à annoter par l'agent, section « Notes de l'agent » conservée)
//  - 04_EXPERIMENTS/EXP-*.md : remplit metrics_d3 / metrics_d7 quand post_url correspond à un post relevé et que la fenêtre est atteinte
// Usage : node src/accounts/report.js [--slug <slug>] [--date AAAA-MM-JJ]
import fs from "node:fs";
import path from "node:path";
import { DATA, CONFIG, CONTENT_ROOT } from "../lib/paths.js";
import { readJson, args, today } from "../lib/fs.js";
import { writeMd, num, pct, readFrontmatter } from "../lib/md.js";

const a = args();
const ACC = path.join(DATA, "accounts");
const cfg = readJson(path.join(CONFIG, "accounts.json"), { accounts: {} });
const slugs = a.slug ? [a.slug] : Object.keys(cfg.accounts);
const date = a.date || today();
const DAY = 86400000;
const median = (xs) => { const s = xs.filter((x) => typeof x === "number").sort((x, y) => x - y); if (!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const ago = (iso) => (iso ? Math.floor((Date.parse(date) - Date.parse(iso)) / DAY) : null);
const rate = (n, d) => (typeof n === "number" && d ? n / d : null);
const link = (p) => `[${p.id.slice(-6)}](${p.url})`;
const titleOf = (p) => (p.carousel_title || p.title || p.description || "").replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 70) || "—";
const typeOf = (p) => (p.type === "carousel" ? `carrousel ${p.slides || "?"}` : p.type === "video" ? `vidéo ${p.duration_s ?? "?"} s` : "?");

const digest = [];
const expFiles = fs.readdirSync(path.join(CONTENT_ROOT, "04_EXPERIMENTS")).filter((f) => /^EXP-\d+\.md$/.test(f)).map((f) => path.join(CONTENT_ROOT, "04_EXPERIMENTS", f));
let expUpdated = 0;

for (const slug of slugs) {
  const acc = cfg.accounts[slug] || {};
  const d = readJson(path.join(ACC, slug, "posts.json"));
  if (!d) { digest.push({ slug, handle: acc.handle, note: "jamais relevé (node src/accounts/pull.js)" }); continue; }
  const posts = Object.values(d.posts || {});
  const withViews = posts.filter((p) => typeof p.stats?.views === "number");
  const med = median(withViews.map((p) => p.stats.views));
  const last7 = withViews.filter((p) => ago(p.posted_at) !== null && ago(p.posted_at) < 7).sort((x, y) => Date.parse(y.posted_at) - Date.parse(x.posted_at));
  const last30 = withViews.filter((p) => ago(p.posted_at) !== null && ago(p.posted_at) < 30);
  const top = [...withViews].sort((x, y) => y.stats.views - x.stats.views).slice(0, 10);
  // vélocité : vues gagnées depuis la relève précédente (tous posts), et les 5 posts qui bougent le plus
  const moving = withViews.map((p) => { const h = p.history || []; const prev = h.length >= 2 ? h[h.length - 2] : null; return { p, delta: prev && typeof prev.views === "number" ? p.stats.views - prev.views : null, since: prev?.date || null }; }).filter((x) => x.delta !== null).sort((x, y) => y.delta - x.delta);
  const weekGain = moving.reduce((s, x) => s + x.delta, 0);
  const prof = d.profile || {};
  const ph = d.profile_history || [];
  const prevProf = ph.length >= 2 ? ph[ph.length - 2] : null;
  const fm = { slug, handle: acc.handle, updated: date, fetched_at: d.fetched_at || null, followers: prof.followers ?? null, followers_delta: prevProf && typeof prof.followers === "number" ? prof.followers - prevProf.followers : null, likes_total: prof.likes ?? null, posts_total: prof.posts ?? posts.length, posts_relevés: posts.length, median_views: med, posts_7d: last7.length, views_7d: last7.reduce((s, p) => s + p.stats.views, 0), views_gained_since_last: moving.length ? weekGain : null, note: d.note || null };
  const body = [];
  body.push(`# Stats — ${slug} (${acc.handle || "?"})\n`);
  body.push(`Relevé du ${date} (${d.fetched_at ? d.fetched_at.slice(0, 16).replace("T", " ") : "?"}) par \`infra/src/accounts/pull.js\` (données publiques, sans API). ${d.note ? "**" + d.note + "**" : ""}\n`);
  body.push(`| Abonnés | Δ depuis relève précédente | Likes cumulés | Posts | Médiane de vues (${withViews.length} posts) | Posts 7 j | Vues des posts 7 j | Vues gagnées depuis relève précédente |\n|---|---|---|---|---|---|---|---|\n| ${num(fm.followers)} | ${fm.followers_delta === null ? "—" : (fm.followers_delta >= 0 ? "+" : "") + fm.followers_delta} | ${num(fm.likes_total)} | ${fm.posts_total ?? "—"} | ${num(med)} | ${last7.length} | ${num(fm.views_7d)} | ${fm.views_gained_since_last === null ? "— (première relève)" : "+" + num(weekGain)} |\n`);
  body.push(`Outlier = vues ÷ médiane du compte (seuil 3 = à documenter, \`00_AGENT/SCORING.md\`). Les posts poussés en pub ont un score biaisé : le marquer dans la colonne « pub » des notes.\n`);
  if (last7.length) {
    body.push(`## Posts des 7 derniers jours\n\n| Posté | Type | Titre | Vues | Likes | Comm. | Partages | Sauv. | Partages/vues | Outlier | Lien |\n|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|`);
    for (const p of last7) body.push(`| ${p.posted_at.slice(0, 10)} | ${typeOf(p)} | ${titleOf(p)} | ${num(p.stats.views)} | ${num(p.stats.likes)} | ${num(p.stats.comments)} | ${num(p.stats.shares)} | ${num(p.stats.saves)} | ${pct(rate(p.stats.shares, p.stats.views))} | ${med ? (p.stats.views / med).toFixed(1) : "—"} | ${link(p)} |`);
    body.push("");
  } else body.push(`## Posts des 7 derniers jours\n\nAucun.\n`);
  if (moving.length) {
    body.push(`## Ce qui bouge encore (vues gagnées depuis la relève précédente)\n\n| Posté | Titre | Vues | +Δ | Lien |\n|---|---|---:|---:|---|`);
    for (const { p, delta } of moving.slice(0, 5)) body.push(`| ${p.posted_at?.slice(0, 10) || "?"} | ${titleOf(p)} | ${num(p.stats.views)} | +${num(delta)} | ${link(p)} |`);
    body.push("");
  }
  if (top.length) {
    body.push(`## Top 10 historique\n\n| Posté | Type | Titre | Vues | Likes | Comm. | Partages | Sauv. | Outlier | Lien |\n|---|---|---|---:|---:|---:|---:|---:|---:|---|`);
    for (const p of top) body.push(`| ${p.posted_at?.slice(0, 10) || "?"} | ${typeOf(p)} | ${titleOf(p)} | ${num(p.stats.views)} | ${num(p.stats.likes)} | ${num(p.stats.comments)} | ${num(p.stats.shares)} | ${num(p.stats.saves)} | ${med ? (p.stats.views / med).toFixed(1) : "—"} | ${link(p)} |`);
    body.push("");
  }
  if (last30.length) {
    const byType = {};
    for (const p of last30) { const t = p.type || "?"; (byType[t] ||= []).push(p.stats.views); }
    body.push(`## 30 derniers jours par type\n\n| Type | Posts | Médiane de vues |\n|---|---:|---:|`);
    for (const [t, xs] of Object.entries(byType)) body.push(`| ${t} | ${xs.length} | ${num(median(xs))} |`);
    body.push("");
  }
  const outDir = path.join(CONTENT_ROOT, "08_ACCOUNTS", slug);
  fs.mkdirSync(outDir, { recursive: true });
  writeMd(path.join(outDir, "STATS.md"), { name: `stats-${slug}`, description: `Stats publiques du compte ${acc.handle || slug} relevées chaque lundi — profil, médiane, 7 jours, top historique`, type: "stats", generated: true, ...fm }, body.join("\n"));
  digest.push({ slug, handle: acc.handle, fm, last7, top3: top.slice(0, 3), moving: moving.slice(0, 3), med });

  // Fiches EXP : post_url → métriques J+3 / J+7
  for (const f of expFiles) {
    const efm = readFrontmatter(f);
    const url = (efm.post_url || "").replace(/^["']|["']$/g, "");
    if (!url || url === "null" || (efm.account || "").trim() !== slug) continue;
    const id = url.match(/video\/(\d+)/)?.[1];
    const p = id && d.posts[id];
    if (!p?.stats) continue;
    const days = ago(p.posted_at);
    let txt = fs.readFileSync(f, "utf8"), changed = false;
    const metrics = `{views: ${p.stats.views ?? null}, likes: ${p.stats.likes ?? null}, comments: ${p.stats.comments ?? null}, shares: ${p.stats.shares ?? null}, saves: ${p.stats.saves ?? null}, retention_3s: null, avg_watch_pct: null, profile_visits: null}`;
    if (days >= 3 && days < 7 && /^metrics_d3: \{views: null/m.test(txt)) { txt = txt.replace(/^metrics_d3: \{[^}]*\}/m, `metrics_d3: ${metrics}`); changed = true; }
    if (days >= 7 && /^metrics_d7: \{views: null/m.test(txt)) { txt = txt.replace(/^metrics_d7: \{[^}]*\}/m, `metrics_d7: ${metrics.replace(/\}$/, ", installs_attributed: null}")}`); changed = true; }
    if (changed) { txt = txt.replace(/^updated: .*$/m, `updated: ${date}`); fs.writeFileSync(f, txt); expUpdated++; }
  }
}

// Digest
const dl = [`# Relevé hebdo des comptes — ${date}\n`, `Généré par \`infra/src/accounts/report.js\`. Rétention 3 s, temps de visionnage et visites de profil ne sont pas publics : à relever à la main dans TikTok Studio pour les posts qui comptent.\n`, `| Compte | Handle | Abonnés | Δ abonnés | Médiane vues | Posts 7 j | Vues 7 j | Vues gagnées | Note |\n|---|---|---:|---:|---:|---:|---:|---:|---|`];
for (const x of digest) dl.push(x.fm ? `| ${x.slug} | ${x.handle || "?"} | ${num(x.fm.followers)} | ${x.fm.followers_delta === null ? "—" : (x.fm.followers_delta >= 0 ? "+" : "") + x.fm.followers_delta} | ${num(x.fm.median_views)} | ${x.fm.posts_7d} | ${num(x.fm.views_7d)} | ${x.fm.views_gained_since_last === null ? "—" : "+" + num(x.fm.views_gained_since_last)} | ${x.fm.note || ""} |` : `| ${x.slug} | ${x.handle || "?"} | — | — | — | — | — | — | ${x.note} |`);
dl.push("");
for (const x of digest) {
  if (!x.fm) continue;
  dl.push(`## ${x.slug} (${x.handle})\n`);
  if (x.last7.length) { dl.push(`Posts de la semaine :`); for (const p of x.last7) dl.push(`- ${p.posted_at.slice(0, 10)} · ${typeOf(p)} · ${titleOf(p)} · ${num(p.stats.views)} vues · outlier ${x.med ? (p.stats.views / x.med).toFixed(1) : "—"} · ${link(p)}`); }
  else dl.push(`Aucun post cette semaine.`);
  if (x.moving.length) { dl.push(`\nBouge encore : ${x.moving.map(({ p, delta }) => `${titleOf(p)} (+${num(delta)})`).join(" · ")}`); }
  dl.push(`\nDétail : \`08_ACCOUNTS/${x.slug}/STATS.md\`\n`);
}
dl.push(`## À faire (agent, SOP_06)\n\n- [ ] Pour chaque post à outlier ≥ 3 : fiche EXP → verdict, et le format dans \`03_LIBRARY/INDEX.md\`.\n- [ ] Pour chaque post < 0,5 × médiane : post-mortem (hook, format, sujet, technique) dans la fiche EXP.\n- [ ] Marquer les posts poussés en pub (\`05_CAMPAIGNS/CAMPAIGNS.md\`) pour ne pas les compter comme organiques.\n- [ ] Relever à la main dans TikTok Studio : rétention 3 s, temps moyen, territoires (surtout les comptes hors marché principal).\n- [ ] Mettre à jour \`01_BRAND/ACCOUNTS.md\` (abonnés) et \`06_CALENDAR/QUEUE.md\`.\n`);
const digestDir = path.join(CONTENT_ROOT, "06_CALENDAR", "stats");
fs.mkdirSync(digestDir, { recursive: true });
writeMd(path.join(digestDir, `${date}.md`), { name: `stats-${date}`, description: `Relevé hebdo des ${digest.length} comptes TikTok du ${date} — à annoter`, type: "digest", generated: true, date, accounts: digest.length, exp_updated: expUpdated }, dl.join("\n"));
console.log(`✓ ${digest.filter((x) => x.fm).length} fiches STATS.md · digest 06_CALENDAR/stats/${date}.md · ${expUpdated} fiche(s) EXP mise(s) à jour`);
