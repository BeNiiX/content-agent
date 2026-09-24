// Prépare un brouillon TikTok (carrousel photo ou vidéo) à partir d'une fiche expérience.
// Le brouillon part par l'API TikTok côté créateur (Content Posting API, mode brouillon) via le fournisseur choisi
// dans .env (PUBLISH_BACKEND) : rien n'est publié : le média arrive dans la boîte de réception de l'app TikTok du
// compte, on y ajoute textes + musique, et on poste.
//
// Usage : node src/publish/tiktok-draft.js EXP-015 [EXP-016 …] | --all [--json]
//   --all   : toutes les fiches `status: prêt` de 04_EXPERIMENTS/ dont la plateforme inclut tiktok
//   --json  : sort le job en JSON sur stdout (sinon récap lisible)
// Sortie : data/publish/jobs/<EXP>.json = tout ce qu'il faut pour l'envoi + la fiche « à saisir dans l'app ».
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CONTENT_ROOT } from "../lib/paths.js";
import { readFrontmatter, fmValue } from "../lib/md.js";
import { args, readJson, writeJson, today } from "../lib/fs.js";
import { JOBS, jobPath, resolveAccount, accountsConfig } from "./lib.js";
import { validationOf } from "./validation.js";
import { chosenMedia, voicePath } from "../lib/variants.js";

const EXPS = path.join(CONTENT_ROOT, "04_EXPERIMENTS");
const LIMITS = { photoMaxBytes: 20 * 1024 * 1024, photoMax: 35, videoMaxBytes: 1024 ** 3, videoMinS: 3, videoMaxS: 600, fpsMin: 23, fpsMax: 60, minSide: 360, titleMax: 150 };

const unq = fmValue;   // lib/md.js : guillemets respectés, commentaire de fin retiré, "null" → null
const jpegSize = (buf) => {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
};
const imageInfo = (file) => {
  const buf = fs.readFileSync(file);
  const bytes = buf.length;
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return { kind: "webp", content_type: "image/webp", bytes, width: null, height: null };
  if (buf[0] === 0x89 && buf.slice(1, 4).toString() === "PNG") return { kind: "png", content_type: "image/png", bytes, width: null, height: null };
  const d = jpegSize(buf);
  return d ? { kind: "jpeg", content_type: "image/jpeg", bytes, ...d } : { kind: "inconnu", content_type: "application/octet-stream", bytes, width: null, height: null };
};
const videoInfo = (file) => {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,r_frame_rate:format=duration", "-of", "json", file]);
  if (r.status !== 0) return { error: "ffprobe indisponible ou fichier illisible" };
  const j = JSON.parse(String(r.stdout));
  const s = j.streams?.[0] || {};
  const [n, d] = String(s.r_frame_rate || "0/1").split("/").map(Number);
  return { codec: s.codec_name, width: s.width, height: s.height, fps: d ? +(n / d).toFixed(2) : null, duration_s: +Number(j.format?.duration || 0).toFixed(1), bytes: fs.statSync(file).size, content_type: path.extname(file).toLowerCase() === ".mov" ? "video/quicktime" : path.extname(file).toLowerCase() === ".webm" ? "video/webm" : "video/mp4" };
};

const section = (file, needle) => {
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((l) => /^##\s/.test(l) && l.includes(needle));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start, end).join("\n").trim();
};
// « Caption : « … » » dans une fiche EXP, ou « **Caption :**\n\n> … » dans POSTS.md. Les titres « ## Caption publiée » sont ignorés.
const captionFrom = (text) => text?.match(/^(?!#)[^\n]*Caption\s*:\s*«\s*(.+?)\s*»/m)?.[1] || text?.match(/\*\*Caption\s*:\*\*\s*\n+>\s*(.+)/)?.[1] || text?.match(/^## Caption publiée\s*\n+(?!#|\s*$)(.+)/m)?.[1]?.trim() || null;
// Vidéos : caption générique du README du dossier de tournage (« [question] » = question à formuler à partir du contenu).
const genericCaption = (dir) => { const t = fs.existsSync(path.join(dir, "README.md")) ? fs.readFileSync(path.join(dir, "README.md"), "utf8") : ""; return t.match(/Caption\s*:\s*«\s*(.+?)\s*»\.?\s*$/m)?.[1] || null; };

export function buildJob(exp) {
  const file = path.join(EXPS, `${exp}.md`);
  if (!fs.existsSync(file)) throw new Error(`${exp} : fiche introuvable (${path.relative(CONTENT_ROOT, file)})`);
  const fm = Object.fromEntries(Object.entries(readFrontmatter(file)).map(([k, v]) => [k, unq(v)]));
  const body = fs.readFileSync(file, "utf8").replace(/^---[\s\S]*?---/, "");
  const baseRel = (fm.media_file || "").replace(/\s*\(.*\)$/, "").replace(/\/$/, "");
  // Créa à deux versions (brute / avec voix, src/lib/variants.js) : on envoie celle choisie à la validation
  const twoVersions = !!voicePath(baseRel) && fs.existsSync(path.resolve(CONTENT_ROOT, voicePath(baseRel)));
  const mediaRel = chosenMedia(baseRel, fm.version);
  const media = path.resolve(CONTENT_ROOT, mediaRel);
  if (!mediaRel || !fs.existsSync(media)) throw new Error(`${exp} : media_file introuvable : ${mediaRel || "(vide)"}`);
  const isDir = fs.statSync(media).isDirectory();
  const postName = path.basename(media).replace(/\.[a-z0-9]+$/i, "");
  // Dossier du compte (08_ACCOUNTS/<account>/) ou, ancien schéma, dossier de tournage SHORT/<date>/
  const parts = media.split(path.sep);
  const accIdx = parts.indexOf("08_ACCOUNTS"), dateIdx = parts.findIndex((x) => /^\d{8}$/.test(x));
  const accountDir = accIdx >= 0 ? parts.slice(0, accIdx + 2).join(path.sep) : dateIdx >= 0 ? parts.slice(0, dateIdx + 1).join(path.sep) : path.dirname(media);
  const car = mediaRel.match(/CAR-\d+/)?.[0];
  const problems = [];
  const files = [];
  let media_type;
  if (isDir) {
    media_type = "PHOTO";
    const names = fs.readdirSync(media).filter((f) => /\.(jpe?g|webp|png)$/i.test(f)).sort();
    if (!names.length) problems.push("aucune image dans le dossier");
    if (names.length > LIMITS.photoMax) problems.push(`${names.length} images > ${LIMITS.photoMax}`);
    for (const n of names) {
      const p = path.join(media, n), info = imageInfo(p);
      if (info.kind === "png") problems.push(`${n} : PNG refusé par TikTok → sips -s format jpeg "${n}" --out "${n.replace(/\.png$/i, ".jpg")}"`);
      if (info.kind === "inconnu") problems.push(`${n} : format non reconnu (JPEG ou WebP attendu)`);
      if (info.bytes > LIMITS.photoMaxBytes) problems.push(`${n} : ${(info.bytes / 1e6).toFixed(1)} Mo > 20 Mo`);
      if (info.width && !((info.width <= 1080 && info.height <= 1920) || (info.width <= 1920 && info.height <= 1080))) problems.push(`${n} : ${info.width}×${info.height} dépasse 1080×1920`);
      files.push({ path: p, filename: `${exp}-${n}`, ...info });
    }
  } else {
    media_type = "VIDEO";
    const info = videoInfo(media);
    if (info.error) problems.push(info.error);
    else {
      if (info.codec !== "h264") problems.push(`codec ${info.codec} (H.264 attendu → scripts/normalize.sh)`);
      if (info.width < LIMITS.minSide || info.height < LIMITS.minSide) problems.push(`${info.width}×${info.height} < 360 px`);
      if (info.fps && (info.fps < LIMITS.fpsMin || info.fps > LIMITS.fpsMax)) problems.push(`${info.fps} i/s hors 23-60`);
      if (info.duration_s < LIMITS.videoMinS || info.duration_s > LIMITS.videoMaxS) problems.push(`${info.duration_s} s hors 3-600 s`);
      if (info.bytes > LIMITS.videoMaxBytes) problems.push("> 1 Go");
    }
    files.push({ path: media, filename: `${exp}${path.extname(media).toLowerCase()}`, ...info });
  }
  if (!/tiktok/i.test(fm.platform || "tiktok")) problems.push(`platform = ${fm.platform} (pas tiktok)`);
  if (twoVersions && !fm.version) problems.push("deux versions (brute / avec voix) : choisir celle à envoyer dans le tableau de bord (onglet Validation)");
  const validation = validationOf(fm);
  if (validation !== "validated") problems.push(validation === "retouch" ? `créa à retoucher (en attente de l'agent)${fm.validation_note ? ` : ${fm.validation_note}` : ""}` : validation === "refused" ? `créa refusée à la validation${fm.validation_note ? ` : ${fm.validation_note}` : ""}` : "créa non validée : à valider dans le tableau de bord (onglet Validation) avant tout envoi");

  const postsFile = [path.join(accountDir, "POSTS.md"), path.join(accountDir, "Carousels", "POSTS.md")].find((f) => fs.existsSync(f));
  const textesFile = path.join(accountDir, "TEXTES.md");
  const posts = postsFile ? section(postsFile, car || postName) : null;
  const textes = section(textesFile, `${postName} ·`) || section(textesFile, `(${exp})`) || section(textesFile, `${exp} —`);
  let caption_source = "fiche EXP", caption = captionFrom(body);
  if (!caption && posts) { caption = captionFrom(posts); caption_source = "POSTS.md"; }
  if (!caption) { caption = genericCaption(accountDir); caption_source = "README.md du tournage (générique, [question] à remplacer)"; }
  if (!caption) { caption = fm.hook || ""; caption_source = "hook (aucune caption écrite)"; }
  if (caption_source !== "fiche EXP" && caption_source !== "POSTS.md") problems.push(`caption non spécifique (${caption_source}) → l'écrire dans la fiche EXP : « Caption : « … » »`);
  const frontRaw = fm.front_page_text || posts?.match(/\*\*(?:Front page|Texte natif)[^\n]*\n\n>\s*(.+)/)?.[1] || null;
  // texte natif tel qu'il sera tapé : sans le gras markdown ni les annotations de production (« ← ligne 1, grosse… »)
  const front = frontRaw ? frontRaw.replace(/\*\*/g, "").replace(/\s+←.*$/, "").trim() : null;
  // Titre TikTok : carrousel = accroche courte (hook sans annotations de production) ; vidéo = la caption elle-même
  // (TikTok n'a qu'un champ « title » pour les vidéos). Coupé à 150 caractères sur un mot ; la caption complète reste dans description.
  const cleanHook = (fm.hook || "").replace(/\s*\([^)]*\)/g, "").replace(/\s*\+\s.*$/, "").trim();
  const cut = (t) => (t.length <= LIMITS.titleMax ? t : t.slice(0, LIMITS.titleMax).replace(/\s+\S*$/, ""));
  // RÈGLE (décision du 17/09/2026 après 3 brouillons reçus — détail dans src/publish/README.md § « Champs titre / description ») :
  // pour un carrousel, seule la caption envoyée arrive dans l'app, et elle atterrit dans le champ DESCRIPTION
  // de l'éditeur photo ; le champ Titre reste vide quoi qu'on envoie. Donc on envoie UNIQUEMENT la description
  // (phrase fixe du compte, config/accounts.json → carousel_description) comme caption, et le titre se tape dans l'app.
  // Vidéo : `title` = caption (TikTok n'a qu'un champ).
  const accountCfg = accountsConfig().accounts[fm.account] || {};
  const hookTitle = cut(fm.tiktok_title || cleanHook || caption);
  const title = media_type === "PHOTO" && accountCfg.carousel_description ? cut(accountCfg.carousel_description) : cut(caption || cleanHook);
  const description = media_type === "PHOTO" ? undefined : caption;   // carrousel : ne rien envoyer en description (perdu de toute façon)
  const account = resolveAccount(fm.account);
  if (!fm.account) problems.push("fiche sans champ `account` : préciser le slug (01_BRAND/ACCOUNTS.md)");
  else if (account.unknown) problems.push(`compte ${fm.account} inconnu dans infra/config/accounts.json`);
  else if (account.paused) problems.push(`compte ${account.slug} (${account.handle}) en pause : rien à envoyer`);
  else if (!account.backend) problems.push("PUBLISH_BACKEND absent de infra/.env : aucun fournisseur d'envoi choisi");
  else if (!account.account_id) problems.push(`compte ${account.slug} (${account.handle}, ${account.device}) : pas de ${account.backend}_account_id dans infra/config/accounts.json → node src/publish/daily-send.js --connect-url ${account.slug} (lien à ouvrir depuis cet appareil) puis --accounts`);
  const job = {
    exp, status_fiche: fm.status || null, validation, version: twoVersions ? fm.version || null : null, concept: fm.concept || null, created: today(),
    account: account.slug, account_handle: account.handle, backend: account.backend, account_id: account.account_id,
    mode: "UPLOAD_TO_DRAFT", media_type, photo_cover_index: media_type === "PHOTO" ? 0 : undefined,
    title, description, caption_source, is_aigc: media_type === "VIDEO" && /p\d/.test(fm.photo || "") ? true : false,
    media_dir: path.relative(CONTENT_ROOT, media), files, problems, ok: problems.length === 0,
    in_app: {
      front_page_text: front, tiktok_title_field: media_type === "PHOTO" ? hookTitle : null, caption, sound: fm.sound || null,
      textes_md: textes ? path.relative(CONTENT_ROOT, textesFile) : null,
      posts_md: posts ? path.relative(CONTENT_ROOT, postsFile) : null,
      sheet: textes || posts || null,
    },
    send: {
      "1_plan": "node src/publish/daily-plan.js   (le plan du jour prend le premier contenu `prêt` du compte dans 06_CALENDAR/QUEUE.md)",
      "2_send": `node src/publish/daily-send.js [--exp ${exp}]   (backend ${account.backend || "← PUBLISH_BACKEND de .env"}, compte ${account.account_id || `← ${account.backend || "<backend>"}_account_id de config/accounts.json`})`,
      "3_files": files.map((f) => ({ filename: f.filename, content_type: f.content_type })),
      "4_caption": media_type === "PHOTO" ? { caption: title, _note: "carrousel : la caption atterrit dans la description de l'éditeur photo ; le titre se tape dans l'app" } : { caption: title },
      "5_mark": `automatique (daily-result.js → mark-draft.js) ; à la main : node src/publish/mark-draft.js ${exp} --publish-id <publish_id>`,
    },
  };
  return job;
}

const a = args();
if (import.meta.url === `file://${process.argv[1]}`) {
  let ids = a._;
  if (a.all) ids = fs.readdirSync(EXPS).filter((f) => /^EXP-\d+\.md$/.test(f)).map((f) => f.replace(".md", "")).filter((id) => { const fm = readFrontmatter(path.join(EXPS, `${id}.md`)); return /prêt/.test(fm.status || "") && /tiktok/.test(fm.platform || ""); });
  if (!ids.length) { console.error("Usage : node src/publish/tiktok-draft.js EXP-015 [EXP-016 …] | --all [--json]"); process.exit(1); }
  const out = [];
  for (const id of ids) {
    try {
      const job = buildJob(id);
      const prev = readJson(jobPath(id));
      if (prev?.sent) job.sent = prev.sent;   // trace d'envoi conservée entre deux reconstructions
      writeJson(jobPath(id), job);
      out.push(job);
      if (!a.json) {
        console.log(`${job.ok ? "✓" : "✗"} ${id} · ${job.media_type} · ${job.files.length} fichier(s) · ${job.media_dir} · compte ${job.account}${job.account_handle ? " (" + job.account_handle + ")" : ""}`);
        console.log(`   titre : ${job.title}`);
        if (job.media_type === "PHOTO") { console.log(`   description envoyée (caption du post) : ${job.title}`); console.log(`   titre à taper dans l'app : ${job.in_app.tiktok_title_field}`); }
        else console.log(`   title (= caption vidéo) : ${job.title}`);
        if (job.in_app.front_page_text) console.log(`   texte front page (à écrire dans l'app) : ${job.in_app.front_page_text}`);
        if (job.in_app.textes_md) console.log(`   textes à saisir : ${job.in_app.textes_md} (section ${id})`);
        if (job.in_app.sound) console.log(`   son : ${job.in_app.sound}`);
        for (const p of job.problems) console.log(`   ! ${p}`);
        console.log(`   → job : ${path.relative(process.cwd(), jobPath(id))}`);
      }
    } catch (e) { console.error(`✗ ${id} : ${e.message}`); out.push({ exp: id, ok: false, problems: [e.message] }); }
  }
  if (a.json) console.log(JSON.stringify(out.length === 1 ? out[0] : out, null, 2));
  else console.log(`\nJobs dans ${path.relative(process.cwd(), JOBS)}/ — étape suivante : node src/publish/daily-plan.js puis node src/publish/daily-send.js, voir src/publish/README.md`);
}
