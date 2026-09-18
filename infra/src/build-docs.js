// Génère 02_VEILLE/videos/*.md, accounts/*.md et digests/<date>.md à partir de data/videos/index.json et data/tiktok/authors/*.json
// Les notes de l'agent (après le marqueur) sont conservées. Options : --min-priority 0  --top 40 (taille du digest)  --all (digest avec tout, pas seulement le nouveau)
import path from "node:path";
import fs from "node:fs";
import { VIDEOS, AUTHORS, VEILLE, TIKTOK, INSTAGRAM } from "./lib/paths.js";
import { readJson, writeJson, listJson, args, today } from "./lib/fs.js";
import { writeMd, num, pct, fix, esc } from "./lib/md.js";

const a = args();
const idx = readJson(path.join(VIDEOS, "index.json"));
if (!idx) { console.error("Lance d'abord node src/score.js"); process.exit(1); }
const rows = idx.rows;
const following = new Set([...(readJson(path.join(TIKTOK, "following.json"), []) || []), ...(readJson(path.join(INSTAGRAM, "following.json"), []) || [])].map((x) => `${x.platform}-${x.handle.toLowerCase()}`));
const authors = new Map();
for (const f of listJson(AUTHORS)) { const j = readJson(f); if (j?.handle) authors.set(`${j.platform}-${j.handle.toLowerCase()}`, j); }
const akey = (r) => `${r.platform}-${String(r.handle || "").toLowerCase()}`;
const vidLink = (r) => `videos/${r.key}.md`;
const accLink = (r) => `accounts/${akey(r)}.md`;

// ---- videos/<key>.md
let nv = 0;
for (const r of rows) {
  const full = readJson(path.join(VIDEOS, `${r.key}.json`)) || r;
  const fm = { key: r.key, platform: r.platform, url: r.url, author: r.handle, author_followers: r.author_followers, author_median_views: r.author_median_views, posted_at: r.posted_at, saved_at: r.saved_at, sources: r.sources || [], duration_s: r.duration_s, views: r.views, likes: r.likes, comments: r.comments, shares: r.shares, outlier_score: r.outlier_score, engagement_rate: r.engagement_rate, share_rate: r.share_rate, comment_rate: r.comment_rate, velocity: r.velocity, priority: r.priority, music: full.music?.title || null, hashtags: r.hashtags || [], concept: null, decision: null, generated: today() };
  const body = `# ${esc(full.description || r.key).slice(0, 80) || r.key}

| | |
|---|---|
| Compte | [@${r.handle}](${accLink(r)}) — ${num(r.author_followers)} abonnés, médiane ${num(r.author_median_views)} vues |
| Lien | ${r.url} |
| Publié | ${r.posted_at ? r.posted_at.slice(0, 10) : "—"} · enregistré ${r.saved_at ? r.saved_at.slice(0, 10) : "—"} (${(r.sources || []).join(", ")}) |
| Vues / likes / comm. / partages | ${num(r.views)} / ${num(r.likes)} / ${num(r.comments)} / ${num(r.shares)} |
| **Outlier** | **${fix(r.outlier_score)}×** · engagement ${pct(r.engagement_rate)} · partages ${pct(r.share_rate)} · comm. ${pct(r.comment_rate)} · ${num(r.velocity)} vues/j |
| Durée / son | ${r.duration_s ?? "—"} s · ${esc(full.music?.title || "—")} ${full.music?.artist ? "(" + esc(full.music.artist) + ")" : ""} |
| Hashtags | ${(r.hashtags || []).join(" ") || "—"} |
| Fichier local | ${fs.existsSync(path.join(VIDEOS, "..", "media", r.key + ".mp4")) ? "infra/data/media/" + r.key + ".mp4" : "non téléchargé (node src/download.js --key " + r.key + ")"} |

## Description

${(full.description || "").trim() || "—"}

## Déconstruction (à remplir par l'agent — SOP_02)

- **Hook** :
- **Mécanique** :
- **Pourquoi ça marche** :
- **Transposable ?** :
- **Concept** : (CONCEPT-xxx ou « nouveau »)
`;
  writeMd(path.join(VEILLE, "videos", `${r.key}.md`), fm, body, { preserveKeys: ["concept", "decision"] });
  nv++;
}

// ---- accounts/<platform-handle>.md
const byAuthor = new Map();
for (const r of rows) { const k = akey(r); if (!byAuthor.has(k)) byAuthor.set(k, []); byAuthor.get(k).push(r); }
for (const k of new Set([...byAuthor.keys(), ...authors.keys()])) {
  const au = authors.get(k); const vids = (byAuthor.get(k) || []).sort((x, y) => (y.outlier_score ?? 0) - (x.outlier_score ?? 0));
  const [platform, ...rest] = k.split("-"); const handle = au?.handle || vids[0]?.handle || rest.join("-");
  const fm = { platform, handle, followers: au?.followers ?? vids[0]?.author_followers ?? null, median_views: au?.median_views ?? null, mean_views: au?.mean_views ?? null, max_views: au?.max_views ?? null, sample_size: au?.sample_size ?? 0, fetched_at: au?.fetched_at ?? null, following: following.has(k), reasons: au?.reasons || ["saved-video"], saved_videos: vids.length, outliers_3x: vids.filter((v) => (v.outlier_score ?? 0) >= 3).length, type: null, trend: null, generated: today() };
  const profile = platform === "tiktok" ? `https://www.tiktok.com/@${handle}` : `https://www.instagram.com/${handle}/`;
  const feed = (au?.videos || []).slice().sort((x, y) => (y.views ?? 0) - (x.views ?? 0)).slice(0, 10);
  const body = `# @${handle} (${platform})

${profile} · ${num(fm.followers)} abonnés · médiane **${num(fm.median_views)}** vues (${fm.sample_size} vidéos, ${fm.fetched_at ? fm.fetched_at.slice(0, 10) : "jamais rafraîchi"}) · ${fm.following ? "suivi" : "non suivi"} · raisons : ${fm.reasons.join(", ")}

## Vidéos enregistrées / likées (${vids.length})

| Outlier | Vues | Partages | Publié | Vidéo | Décision |
|---:|---:|---:|---|---|---|
${vids.map((v) => `| ${fix(v.outlier_score)}× | ${num(v.views)} | ${pct(v.share_rate)} | ${v.posted_at ? v.posted_at.slice(0, 10) : "—"} | [${esc(v.description).slice(0, 60) || v.key}](${vidLink(v)}) | |`).join("\n") || "| — | | | | | |"}

## Top 10 du compte (feed récent, ${au ? "via enrich-authors" : "non récupéré"})

| Vues | Outlier | Publié | Titre | Lien |
|---:|---:|---|---|---|
${feed.map((x) => `| ${num(x.views)} | ${au?.median_views ? fix(x.views / au.median_views) : "—"}× | ${x.posted_at ? x.posted_at.slice(0, 10) : "—"} | ${esc(x.title)} | ${x.url || "—"} |`).join("\n") || "| — | | | | |"}
`;
  writeMd(path.join(VEILLE, "accounts", `${k}.md`), fm, body, { preserveKeys: ["type", "trend"] });
}

// ---- digests/<date>.md
const digestedFile = path.join(VIDEOS, "_digested.json");
const digested = new Set(readJson(digestedFile, []) || []);
const minP = Number(a["min-priority"] || 0);
const top = Number(a.top || 40);
const fresh = rows.filter((r) => (a.all || !digested.has(r.key)) && r.priority >= minP).slice(0, top);
if (fresh.length) {
  const d = today();
  const file = path.join(VEILLE, "digests", `${d}.md`);
  const fm = { date: d, videos: fresh.length, outliers_3x: fresh.filter((r) => (r.outlier_score ?? 0) >= 3).length, without_median: fresh.filter((r) => r.outlier_score == null).length, status: "à annoter", generated_at: new Date().toISOString() };
  const body = `# Digest veille — ${d}

${fresh.length} nouvelles vidéos scorées (sur ${rows.length} au total). Trié par priorité = outlier × (1 + partages×50 + commentaires×20). Remplir la colonne **Décision** : \`documenter\` / \`ignorer <raison>\` / \`plus tard\` (SOP_01), puis les tendances en bas.

| # | Prio | Outlier | Vues | Partages | Comm. | Compte | Vidéo | Son | Décision |
|---:|---:|---:|---:|---:|---:|---|---|---|---|
${fresh.map((r, i) => `| ${i + 1} | ${fix(r.priority)} | ${fix(r.outlier_score)}× | ${num(r.views)} | ${pct(r.share_rate)} | ${pct(r.comment_rate)} | [@${r.handle}](${accLink(r)}) | [${esc(r.description).slice(0, 50) || r.key}](${vidLink(r)}) | ${esc(r.music || "").slice(0, 25)} | |`).join("\n")}

## Tendances de la semaine (agent)

- **Hooks récurrents** :
- **Formats récurrents** :
- **Sons récurrents** :
- **Comptes qui montent** :
- **À documenter en priorité** :
`;
  const notesMarker = "<!-- notes-agent : tout ce qui suit est conservé à la régénération -->";
  if (fs.existsSync(file) && !a.all) {
    // Un digest existe déjà pour aujourd'hui (souvent annoté) : on ajoute une section, on n'écrase rien.
    const prev = fs.readFileSync(file, "utf8");
    const add = `\n## Ajouts ${new Date().toTimeString().slice(0, 5)} (${fresh.length} vidéos)\n\n| # | Prio | Outlier | Vues | Partages | Comm. | Compte | Vidéo | Son | Décision |\n|---:|---:|---:|---:|---:|---:|---|---|---|---|\n${fresh.map((r, i) => `| +${i + 1} | ${fix(r.priority)} | ${fix(r.outlier_score)}× | ${num(r.views)} | ${pct(r.share_rate)} | ${pct(r.comment_rate)} | [@${r.handle}](${accLink(r)}) | [${esc(r.description).slice(0, 50) || r.key}](${vidLink(r)}) | ${esc(r.music || "").slice(0, 25)} | |`).join("\n")}\n\n`;
    const i = prev.indexOf(notesMarker);
    fs.writeFileSync(file, i >= 0 ? prev.slice(0, i) + add + prev.slice(i) : prev + add);
  } else writeMd(file, fm, body);
  fresh.forEach((r) => digested.add(r.key));
  writeJson(digestedFile, [...digested]);
  console.log(`Digest : ${file} (${fresh.length} vidéos).`);
} else console.log("Digest : rien de nouveau.");
console.log(`Docs : ${nv} fiches vidéo, ${new Set([...byAuthor.keys(), ...authors.keys()]).size} fiches compte → ${VEILLE}`);
