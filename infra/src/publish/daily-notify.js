// Compose et envoie le message du soir (iMessage par défaut, Telegram, ou stdout) à partir du plan du jour.
// Usage : node src/publish/daily-notify.js [--date AAAA-MM-JJ] [--channel ntfy|telegram|imessage|stdout] [--test "texte"] [--alert "texte"]
// --test = vérifier le canal (titre « Test ») ; --alert = vraie alerte d'un job du VPS (titre d'alerte, priorité haute)
// Format minimal (18/09) : par compte servi, 1 message (vidéo : bulles début–fin · texte ; carrousel : titre à coller) + pour une vidéo la caption seule en 2e message ; anomalies seulement sinon.
// .env : NOTIFY_CHANNEL, NTFY_TOPIC (+ NTFY_URL), TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID, NOTIFY_IMESSAGE_TO (+33…, sans notification : c'est toi l'expéditeur)
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DATA } from "../lib/paths.js";
import { env } from "../lib/env.js";
import { args, readJson, today } from "../lib/fs.js";
import { project } from "../lib/project.js";

const a = args();
const channel = a.channel || env("NOTIFY_CHANNEL", "stdout");
const fallback = env("NOTIFY_FALLBACK", "");   // canal de secours si le principal n'est pas configuré ou échoue (ex. ntfy pendant la mise en place de Telegram)
const date = a.date || today();

// Un message = liste de sections {title, body}. iMessage / stdout : un seul texte ; Telegram : morceaux ≤ 4 000 car. ;
// ntfy : une notification par section (lisible sur le téléphone, limite 4 Ko par push).
const withCopies = (sections) => sections.map((x) => ({ ...x, body: plain(x) + (x.copy || []).map((c) => `\n${c.label ? c.label + "\n" : ""}${c.text}`).join("") }));
export async function send(sections, via = channel) {
  sections = via === "telegram" ? sections : withCopies(sections);
  try { return await sendVia(sections, via); }
  catch (e) {
    if (fallback && fallback !== via) { const r = await sendVia(sections, fallback); return `${r} (repli : ${via} → ${e.message})`; }
    throw e;
  }
}
async function sendVia(sections, channel) {
  const flat = sections.map((x) => (x.title ? x.title + "\n" : "") + x.body).join("\n\n");
  if (channel === "imessage") {
    const to = env("NOTIFY_IMESSAGE_TO"); if (!to) throw new Error("NOTIFY_IMESSAGE_TO manquant dans .env");
    const script = `on run argv
  set theText to item 1 of argv
  set theTo to item 2 of argv
  tell application "Messages"
    set svc to 1st account whose service type = iMessage
    set who to participant theTo of svc
    send theText to who
  end tell
end run`;
    const r = spawnSync("osascript", ["-e", script, flat, to], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`osascript : ${r.stderr.trim()}`);
    return "imessage → " + to + " (attention : envoyé par toi-même, pas de notification)";
  }
  if (channel === "ntfy") {
    const topic = env("NTFY_TOPIC"); if (!topic) throw new Error("NTFY_TOPIC manquant dans .env");
    const base = env("NTFY_URL", "https://ntfy.sh").replace(/\/$/, "");
    let n = 0;
    for (const sec of sections) {
      const headers = { "Content-Type": "text/plain; charset=utf-8", "Title": (sec.title || project().notify_title).replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, "").slice(0, 120), "Priority": sec.priority || "default", "Tags": sec.tags || "clapper" };
      // ntfy lit le titre en ISO-8859-1 : encodage RFC 2047 si non-ASCII
      if (/[^\x00-\x7F]/.test(headers.Title)) headers.Title = "=?UTF-8?B?" + Buffer.from(headers.Title, "utf8").toString("base64") + "?=";
      const r = await fetch(`${base}/${topic}`, { method: "POST", headers, body: sec.body });
      if (!r.ok) throw new Error(`ntfy ${r.status} : ${await r.text()}`);
      n++;
    }
    return `ntfy → ${base}/${topic} (${n} notification(s))`;
  }
  if (channel === "telegram") {
    const tok = env("TELEGRAM_BOT_TOKEN"), chat = env("TELEGRAM_CHAT_ID"); if (!tok || !chat) throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID manquants");
    const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const post = async (text) => { const r = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }) }); const j = await r.json(); if (!j.ok) throw new Error(`telegram : ${j.description}`); };
    let n = 0;
    for (const sec of sections) {
      const lines = (sec.lines || []).map((l) => (typeof l === "string" ? esc(l) : esc(l.inline) + `<code>${esc(l.code)}</code>`));
      await post([sec.title ? `<b>${esc(sec.title)}</b>` : "", sec.body ? esc(sec.body) : "", ...lines].filter(Boolean).join("\n")); n++;
      // Caption d'une vidéo : message à part, en <code> seul → un tap sur mobile copie tout
      for (const c of sec.copy || []) { await post(`${c.label ? esc(c.label) + "\n" : ""}<code>${esc(c.text)}</code>`); n++; }
    }
    return `telegram → ${chat} (${n} message(s))`;
  }
  console.log(flat); return "stdout";
}

// Bruit minimal (règle du 18/09) : rien de global sauf anomalie ; par compte servi, UN message (carrousel : titre à coller ;
// vidéo : bulles « début–fin · texte ») + pour une vidéo UN second message = la caption seule, copiable d'un tap.
export function compose(plan) {
  const sections = [];
  const test = plan.mode === "dry-run" ? "🧪 " : "";
  for (const it of plan.items) {
    if (it.status === "no_stock") {
      const w = it.awaiting_validation?.length || 0;   // créas rendues mais pas encore validées dans le tableau de bord
      sections.push(w ? { title: `${test}⏸ ${it.handle} · ${w} créa${w > 1 ? "s" : ""} à valider`, tags: "warning", priority: "high", body: "Rien envoyé : aucune créa validée. Valide-les dans le tableau de bord (onglet Validation)." }
        : { title: `${test}⚠️ ${it.handle} · plus de stock`, tags: "warning", priority: "high", body: "Rien envoyé : il faut produire pour ce compte." });
      continue;
    }
    if (it.status === "error" || it.status === "failed") { sections.push({ title: `${test}❌ ${it.handle} · ${it.exp} non envoyé`, tags: "x", priority: "high", body: `${it.error || it.reason || "échec"} — retenté demain.` }); continue; }
    if (it.status === "planned" && plan.mode !== "dry-run") { sections.push({ title: `⏳ ${it.handle} · ${it.exp}`, body: "prévu, pas confirmé." }); continue; }
    const L = [], copy = [];
    if (it.media_type === "PHOTO") {
      if (it.in_app.front_page_text && it.in_app.front_page_text !== it.in_app.title_to_type) L.push(`Slide 1 : ${it.in_app.front_page_text}`);
      if (it.in_app.title_to_type) L.push({ inline: "Titre : ", code: it.in_app.title_to_type });
    } else {
      for (const b of it.in_app.bubbles || []) L.push(`${b.start}–${b.end} · ${b.text}`);
      if (!it.in_app.bubbles?.length && it.in_app.front_page_text) L.push(`Texte : ${it.in_app.front_page_text}`);
      if (it.in_app.caption) copy.push({ text: it.in_app.caption });
    }
    if (it.stock_after <= 3) L.push(`⚠️ stock ${it.stock_after}`);
    sections.push({ title: `${test}✅ ${it.handle} · ${it.exp} · ${it.media_type === "PHOTO" ? "carrousel" : "vidéo"}`, tags: it.media_type === "PHOTO" ? "framed_picture" : "movie_camera", lines: L, copy });
  }
  return sections;
}
// Rendu texte d'une section (canaux sans mise en forme) ; Telegram rend les `code` en <code>
const plain = (sec) => (sec.body ?? "") + (sec.lines || []).map((l) => (typeof l === "string" ? l : l.inline + l.code)).join("\n");

if (import.meta.url === `file://${process.argv[1]}` && a["telegram-chat-id"]) {
  const tok = env("TELEGRAM_BOT_TOKEN"); if (!tok) { console.error("TELEGRAM_BOT_TOKEN manquant dans .env"); process.exit(1); }
  const j = await (await fetch(`https://api.telegram.org/bot${tok}/getUpdates`)).json();
  const seen = new Map(); for (const u of j.result || []) { const c = u.message?.chat || u.my_chat_member?.chat; if (c) seen.set(c.id, `${c.type} ${c.username ? "@" + c.username : ""} ${c.first_name || c.title || ""}`.trim()); }
  if (!seen.size) console.log("Aucune conversation vue : envoie /start au bot depuis Telegram, puis relance."); else for (const [id, d] of seen) console.log(`TELEGRAM_CHAT_ID=${id}   # ${d}`);
  process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const stamp = new Date().toLocaleString("fr-FR");
  const sections = a.alert ? [{ title: `⚠️ ${project().notify_title} · alerte VPS`, tags: "warning", priority: "high", body: `${stamp} : ${a.alert === true ? "alerte" : a.alert}` }]
    : a.test ? [{ title: "🎬 Test agent content", tags: "white_check_mark", body: `${stamp} : ${a.test === true ? "ok" : a.test}` }]
    : compose(readJson(path.join(DATA, "publish", "daily", `${date}.json`)) || { date, items: [], skipped: [], mode: "live" });
  if (!sections.length) { console.log("rien à notifier"); process.exit(0); }
  send(sections).then((r) => { if (r !== "stdout") console.log(`✓ envoyé (${r})`); }).catch((e) => { console.error(`✗ notification : ${e.message}`); for (const x of sections) console.log((x.title ? x.title + "\n" : "") + x.body + "\n"); process.exit(1); });
}
