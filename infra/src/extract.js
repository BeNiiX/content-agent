// Extraction du contenu d'une vidéo téléchargée : image d'accroche pleine résolution, texte à l'écran (OCR Vision, 1 image/s),
// transcription audio (whisper.cpp si installé). Sorties : data/media/<key>.extract.json + 02_VEILLE/transcripts/<key>.md + 02_VEILLE/assets/hooks/<key>.jpg
// Dégradation propre : sans bin/ocr (Vision, macOS seulement) le texte à l'écran n'est pas extrait ; sans whisper-cli / whisper-cpp
// ou sans models/ggml-small.bin, pas de transcription (audio.available = false). L'image d'accroche est produite dans tous les cas (ffmpeg).
// Usage : node src/extract.js [--key k] [--concept CONCEPT-007] [--force] [--no-audio] [--fps 1]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { MEDIA, VIDEOS, VEILLE, INFRA_ROOT, CONTENT_ROOT } from "./lib/paths.js";
import { readJson, writeJson, args, today } from "./lib/fs.js";
import { writeMd } from "./lib/md.js";

const a = args();
const OCR = path.join(INFRA_ROOT, "bin", "ocr");
const MODEL = path.join(INFRA_ROOT, "models", "ggml-small.bin");
const WHISPER = ["whisper-cli", "whisper-cpp"].map((b) => spawnSync("which", [b]).status === 0 ? b : null).find(Boolean) || null;
const OCR_OK = fs.existsSync(OCR);
const WHISPER_OK = !!WHISPER && fs.existsSync(MODEL);
if (!OCR_OK) console.warn(`OCR indisponible (${path.relative(INFRA_ROOT, OCR)} absent : swiftc -O -o bin/ocr scripts/ocr.swift sur macOS) : texte à l'écran non extrait`);
if (!WHISPER_OK) console.warn(`Transcription indisponible (${WHISPER ? "modèle " + path.relative(INFRA_ROOT, MODEL) + " absent" : "whisper-cli / whisper-cpp introuvable"}) : audio non transcrit`);
const HOOKS = path.join(VEILLE, "assets", "hooks");
const TR = path.join(VEILLE, "transcripts");
fs.mkdirSync(HOOKS, { recursive: true }); fs.mkdirSync(TR, { recursive: true });
const run = (cmd, argv, opts = {}) => spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const idx = readJson(path.join(VIDEOS, "index.json"), { rows: [] });
let list = idx.rows;
if (a.key) list = list.filter((r) => r.key === a.key);
if (a.concept) {   // --concept CONCEPT-007 | FORMAT-01 : les vidéos listées dans `sources:` de la fiche (03_LIBRARY/formats/ ou archive/)
  const dirs = ["formats", "archive", "concepts"].map((d) => path.join(CONTENT_ROOT, "03_LIBRARY", d)).filter((d) => fs.existsSync(d));
  const files = dirs.flatMap((d) => fs.readdirSync(d).filter((f) => f.startsWith(a.concept)).map((f) => path.join(d, f)));
  const src = files.flatMap((f) => (fs.readFileSync(f, "utf8").match(/^sources: \[(.*)\]/m)?.[1] || "").split(",").map((s) => s.trim()).filter(Boolean));
  list = list.filter((r) => src.includes(r.key));
}

function ocrFrames(dir, fps) {
  if (!OCR_OK) return [];
  const frames = fs.readdirSync(dir).filter((f) => f.startsWith("f_")).sort();
  if (!frames.length) return [];
  const res = run(OCR, frames.map((f) => path.join(dir, f)));
  if (res.error || res.status !== 0 || typeof res.stdout !== "string") { console.warn(`OCR : échec (${res.error?.message || "code " + res.status}) : texte à l'écran non extrait`); return []; }
  const perFrame = res.stdout.trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  // Texte utile : confiance ≥ 0.5, hors barre de statut (y < 0.05) et hors barre home (y > 0.97)
  const blocks = perFrame.map((f, i) => {
    const lines = f.lines.filter((l) => l.conf >= 0.5 && l.y > 0.05 && l.y < 0.97 && l.text.trim().length > 1);
    // regroupe les lignes proches verticalement (bulle multi-lignes)
    const groups = []; let cur = null;
    for (const l of lines) { if (cur && l.y - cur.yEnd < 0.035) { cur.text += " " + l.text.trim(); cur.yEnd = l.y + l.h; } else { cur = { text: l.text.trim(), y: l.y, yEnd: l.y + l.h }; groups.push(cur); } }
    return { t: i / fps, texts: groups.map((g) => ({ text: g.text.replace(/\s+/g, " "), y: +g.y.toFixed(2) })) };
  });
  // segments : un texte identique (normalisé) sur des images consécutives = un segment
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, " ").trim();
  const open = new Map(); const segs = [];
  for (const b of blocks) {
    const seen = new Set();
    for (const t of b.texts) { const k = norm(t.text); if (k.length < 2) continue; seen.add(k); if (open.has(k)) open.get(k).end = b.t + 1 / fps; else open.set(k, { start: b.t, end: b.t + 1 / fps, text: t.text, y: t.y }); }
    for (const [k, s] of [...open]) if (!seen.has(k)) { segs.push(s); open.delete(k); }
  }
  segs.push(...open.values());
  return segs.sort((x, y) => x.start - y.start || x.y - y.y).map((s) => ({ start: +s.start.toFixed(1), end: +s.end.toFixed(1), y: s.y, text: s.text }));
}

function transcribe(mp4, dir) {
  if (!WHISPER_OK) return { available: false, segments: [] };
  const wav = path.join(dir, "audio16k.wav");
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-ac", "1", "-ar", "16000", "-vn", wav]);
  const out = path.join(dir, "whisper");
  run(WHISPER, ["-m", MODEL, "-l", "fr", "-f", wav, "-oj", "-of", out, "-np"]);
  const j = readJson(out + ".json", null);
  const HALLU = /sous-titr|amara\.org|merci d'avoir regard|abonnez-vous|^\s*[.…\-]*\s*$/i;
  const all = (j?.transcription || []).map((s) => ({ start: +(s.offsets.from / 1000).toFixed(1), end: +(s.offsets.to / 1000).toFixed(1), text: s.text.trim() })).filter((s) => s.text.length > 1);
  const segments = all.filter((s) => !HALLU.test(s.text) && !/^\[.*\]$|^\(.*\)$/.test(s.text));
  // Suspect seulement si la majorité des segments sont des hallucinations connues ou très courts
  const suspicious = all.length > 0 && (all.length - segments.length) / all.length >= 0.5 || (segments.length > 0 && segments.every((s) => s.text.length < 4));
  return { available: true, segments, suspicious, dropped: all.length - segments.length };
}

let n = 0;
for (const r of list) {
  const mp4 = path.join(MEDIA, `${r.key}.mp4`);
  const photoDir = path.join(MEDIA, r.key);
  const isPhoto = !fs.existsSync(mp4) && fs.existsSync(path.join(photoDir, "post.json"));
  if (!fs.existsSync(mp4) && !isPhoto) continue;
  const outJson = path.join(MEDIA, `${r.key}.extract.json`);
  if (a.rerender && fs.existsSync(outJson)) { const prev = readJson(outJson); if (prev.audio?.segments) { const HALLU = /sous-titr|amara\.org|merci d'avoir regard|abonnez-vous/i; const all = prev.audio.segments; prev.audio.segments = all.filter((x) => !HALLU.test(x.text)); prev.audio.suspicious = all.length > 0 && (all.length - prev.audio.segments.length) / all.length >= 0.5; } writeJson(outJson, prev); renderMd(r, prev, Number(a.fps || 1)); n++; continue; }
  if (!a.force && fs.existsSync(outJson) && !(a.audio && !readJson(outJson)?.audio?.available)) { continue; }
  const dir = path.join(MEDIA, `${r.key}.work`); fs.mkdirSync(dir, { recursive: true });
  const fps = Number(a.fps || 1);
  const hook = path.join(HOOKS, `${r.key}.jpg`);
  let onscreen = [], audio = { available: false, segments: [] }, duration = r.duration_s;
  if (isPhoto) {
    const imgs = fs.readdirSync(photoDir).filter((f) => f.startsWith("img_")).sort();
    fs.copyFileSync(path.join(photoDir, imgs[0]), hook);
    for (const [i, f] of imgs.entries()) fs.copyFileSync(path.join(photoDir, f), path.join(dir, `f_${String(i + 1).padStart(3, "0")}.jpg`));
    onscreen = ocrFrames(dir, 1).map((s) => ({ ...s, start: s.start + 1, end: s.end + 1, slide: true }));
  } else {
    run("ffmpeg", ["-y", "-loglevel", "error", "-ss", "0.3", "-i", mp4, "-frames:v", "1", "-q:v", "2", hook]);
    for (const f of fs.readdirSync(dir)) if (f.startsWith("f_")) fs.unlinkSync(path.join(dir, f));
    run("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-vf", `fps=${fps},scale=720:-1`, "-q:v", "3", path.join(dir, "f_%03d.jpg")]);
    onscreen = ocrFrames(dir, fps);
    if (!a["no-audio"]) audio = transcribe(mp4, dir);
  }
  const result = { key: r.key, url: r.url, handle: r.handle, duration_s: duration, kind: isPhoto ? "photo" : "video", hook_frame: path.relative(CONTENT_ROOT, hook), extracted_at: new Date().toISOString(), onscreen, audio, whisper: WHISPER || null };
  writeJson(outJson, result);
  renderMd(r, result, fps);
  n++;
  console.log(`✓ ${r.key} — ${onscreen.length} segments texte, audio ${audio.available ? audio.segments.length + " seg." + (audio.suspicious ? " (suspect)" : "") : "n/a"}`);
}
console.log(`${n} extractions → ${TR}`);

function renderMd(r, result, fps) {
  const { onscreen, audio, duration } = { onscreen: result.onscreen, audio: result.audio, duration: result.duration_s };
  const fm = { key: r.key, platform: r.platform, url: r.url, author: r.handle, views: r.views, outlier_score: r.outlier_score, duration_s: duration, kind: result.kind, hook_frame: result.hook_frame, onscreen_segments: onscreen.length, audio_transcribed: audio.available, audio_suspicious: audio.suspicious || false, generated: today() };
  const body = `# Extraction — ${r.key} (@${r.handle})

Vidéo : ${r.url} · fiche : [videos/${r.key}.md](../videos/${r.key}.md) · ${result.kind === "photo" ? "carrousel photo" : `${duration ?? "?"} s`} · ${r.views ?? "?"} vues, outlier ${r.outlier_score ?? "?"}×

## Image d'accroche (t = 0,3 s)

![hook](../assets/hooks/${r.key}.jpg)

Fichier : \`${result.hook_frame}\` — à décrire dans \`03_LIBRARY/PROMPTS_IMAGES.md\` pour génération IA.

## Texte à l'écran (OCR, ${fps} image/s${result.kind === "photo" ? ", une ligne par slide" : ""})

| De | À | Position | Texte |
|---|---|---|---|
${onscreen.map((s) => `| ${result.kind === "photo" ? "slide " + s.start : fmtT(s.start)} | ${result.kind === "photo" ? "" : fmtT(s.end)} | ${s.y < 0.33 ? "haut" : s.y < 0.66 ? "milieu" : "bas"} | ${s.text.replace(/\|/g, "\\|")} |`).join("\n") || "| — | | | aucun texte détecté |"}

## Transcription audio (${audio.available ? `whisper.cpp small, fr${audio.suspicious ? " — ⚠️ majorité de segments hallucinés : musique seule probable" : ""}${result.kind !== "photo" && audio.segments.length && !audio.suspicious ? " — voix détectée (souvent une voix TTS qui lit les bulles)" : ""}` : "non disponible : whisper.cpp absent ou modèle manquant"})

${audio.segments.length ? audio.segments.map((s) => `- **${fmtT(s.start)}** ${s.text}`).join("\n") : "_(aucune parole détectée)_"}

## Script reconstitué (ordre d'apparition, sans doublons)

${[...new Set(onscreen.map((s) => s.text))].map((t, i) => `${i + 1}. ${t}`).join("\n") || "—"}
`;
  writeMd(path.join(TR, `${r.key}.md`), fm, body);
}
