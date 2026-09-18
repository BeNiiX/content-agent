// Compose et envoie le message du soir (iMessage par défaut, Telegram, ou stdout) à partir du plan du jour.
// Usage : node src/publish/daily-notify.js [--date AAAA-MM-JJ] [--channel ntfy|telegram|imessage|stdout] [--test "texte"]
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
export async function send(sections, via = channel) {
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
    const chunks = []; let cur = "";
    for (const sec of sections) { const t = (sec.title ? sec.title + "\n" : "") + sec.body; if ((cur + "\n\n" + t).length > 3900 && cur) { chunks.push(cur); cur = t; } else cur = cur ? cur + "\n\n" + t : t; }
    if (cur) chunks.push(cur);
    for (const text of chunks) {
      const r = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true, disable_notification: false }) });
      const j = await r.json(); if (!j.ok) throw new Error(`telegram : ${j.description}`);
    }
    return `telegram → ${chat} (${chunks.length} message(s))`;
  }
  console.log(flat); return "stdout";
}

export function compose(plan) {
  const d = new Date(plan.date + "T12:00:00"); const ds = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const q = (s) => `« ${s} »`;
  const sections = [];
  const sent = plan.items.filter((x) => x.status === "sent").length, total = plan.items.filter((x) => x.exp).length;
  const noStock = plan.items.filter((x) => x.status === "no_stock"), failed = plan.items.filter((x) => x.status === "error" || x.status === "failed");
  sections.push({ title: `🎬 Brouillons TikTok · ${ds}${plan.mode === "dry-run" ? " (TEST)" : ""}`, tags: "clapper", priority: failed.length || noStock.length ? "high" : "default",
    body: `${sent}/${total} brouillon(s) envoyé(s)${noStock.length ? ` · ⚠️ sans stock : ${noStock.map((x) => x.handle).join(", ")}` : ""}${failed.length ? ` · ❌ échec : ${failed.map((x) => x.exp).join(", ")}` : ""}.\nPour chaque compte : TikTok → boîte de réception → titre + textes + son → Publier.` });
  for (const it of plan.items) {
    if (it.status === "no_stock") { sections.push({ title: `${it.handle} · ⚠️ PLUS DE STOCK`, tags: "warning", priority: "high", body: `Rien envoyé aujourd'hui : il faut produire pour ce compte (06_CALENDAR/QUEUE.md).` }); continue; }
    if (it.status === "error" || it.status === "failed") { sections.push({ title: `${it.handle} · ❌ ${it.exp} non envoyé`, tags: "x", priority: "high", body: `${it.error || it.reason || "échec"}. Sera retenté demain. Stock restant : ${it.stock_after}.` }); continue; }
    if (it.status === "planned" && plan.mode !== "dry-run") { sections.push({ title: `${it.handle} · ⏳ ${it.exp}`, body: `Prévu mais pas confirmé (data/publish/daily/${plan.date}.json).` }); continue; }
    const kind = it.media_type === "PHOTO" ? `carrousel ${it.files} slides` : "vidéo";
    const L = [];
    if (it.media_type === "PHOTO") {
      if (it.in_app.title_to_type) L.push(`Titre à taper : ${q(it.in_app.title_to_type)}`);
      if (it.in_app.front_page_text) L.push(`Texte natif slide 1 : ${q(it.in_app.front_page_text)}`);
      L.push(`Description : déjà dans le brouillon`);
    } else {
      L.push(`Caption : déjà dans le brouillon (sinon : ${q(it.in_app.caption)})`);
      if (it.in_app.sheet?.length) { L.push(`Bulles (texte natif + voix TTS) :`); for (const s of it.in_app.sheet) L.push(`• ${s}`); }
      else if (it.in_app.front_page_text) L.push(`Texte natif : ${q(it.in_app.front_page_text)}`);
    }
    if (it.in_app.sound) L.push(`Son : ${it.in_app.sound}`);
    L.push(`Stock restant : ${it.stock_after}${it.stock_after <= 3 ? " ⚠️ à réapprovisionner" : ""}${it.stock_next?.length ? ` (suite : ${it.stock_next.join(", ")})` : ""}`);
    sections.push({ title: `${it.handle} (${it.device}) · ${plan.mode === "dry-run" ? "🧪 " : "✅ "}${it.exp} · ${kind}`, tags: it.media_type === "PHOTO" ? "framed_picture" : "movie_camera", body: L.join("\n") });
  }
  for (const s of plan.skipped || []) sections.push({ title: `${s.handle} · ignoré`, tags: "zzz", priority: "low", body: s.reason });
  return sections;
}

// node src/publish/daily-notify.js --telegram-chat-id : affiche les chat_id vus par le bot (envoyer /start au bot d'abord)
if (import.meta.url === `file://${process.argv[1]}` && a["telegram-chat-id"]) {
  const tok = env("TELEGRAM_BOT_TOKEN"); if (!tok) { console.error("TELEGRAM_BOT_TOKEN manquant dans .env"); process.exit(1); }
  const j = await (await fetch(`https://api.telegram.org/bot${tok}/getUpdates`)).json();
  const seen = new Map(); for (const u of j.result || []) { const c = u.message?.chat || u.my_chat_member?.chat; if (c) seen.set(c.id, `${c.type} ${c.username ? "@" + c.username : ""} ${c.first_name || c.title || ""}`.trim()); }
  if (!seen.size) console.log("Aucune conversation vue : envoie /start au bot depuis Telegram, puis relance."); else for (const [id, d] of seen) console.log(`TELEGRAM_CHAT_ID=${id}   # ${d}`);
  process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const sections = a.test ? [{ title: "🎬 Test agent content", tags: "white_check_mark", body: `${new Date().toLocaleString("fr-FR")} : ${a.test === true ? "ok" : a.test}` }] : compose(readJson(path.join(DATA, "publish", "daily", `${date}.json`)) || { date, items: [], skipped: [], mode: "live" });
  send(sections).then((r) => { if (r !== "stdout") console.log(`✓ envoyé (${r})`); }).catch((e) => { console.error(`✗ notification : ${e.message}`); for (const x of sections) console.log((x.title ? x.title + "\n" : "") + x.body + "\n"); process.exit(1); });
}
