// Monte une vidéo CONCEPT-007 : photo + hook (3 s, zoom lent) → extraits du screen-record (avec gels) → bulles texte → voix TTS.
// Usage : node src/produce/pov.js spec.json   (voir SHORT/20260917/specs/*.json pour le format)
// Spec : { out, photo, hook, screen, hookDuration?, segments: [{from, to, freezeStart?, freezeEnd?}], bubbles: [{text, at?, dur, pos?}], voice?, tts? }
//  - segments : temps dans le screen-record (s). freezeStart/freezeEnd : secondes de gel de la 1re / dernière image.
//  - bubbles : dans l'ordre. `at` = début dans la timeline finale (défaut : enchaînement), `dur` = durée min ; si TTS plus long, la bulle est prolongée.
import fs from "node:fs";
import { ttsFor } from "../lib/variants.js";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { INFRA_ROOT } from "../lib/paths.js";

// Modes : (défaut) bulles incrustées + voix `say` (Mac) · --raw : ni texte, ni voix, ni zoom (texte natif tapé dans TikTok) ·
// --voice : comme --raw mais avec la voix générée (edge-tts par défaut, tourne aussi sur le VPS) calée sur les bulles de la spec
// = version « avec voix » d'une créa à deux versions (src/lib/variants.js). --out <fichier> : autre sortie que spec.out.
const argvAll = process.argv.slice(2);
const RAW = argvAll.includes("--raw"), VOICE = argvAll.includes("--voice");
const outIdx = argvAll.indexOf("--out"), OUT = outIdx >= 0 ? argvAll[outIdx + 1] : null;
const specPath = argvAll.find((x, i) => !x.startsWith("--") && argvAll[i - 1] !== "--out");
if (!specPath) { console.error("Usage : node src/produce/pov.js spec.json [--raw | --voice] [--out fichier.mp4]"); process.exit(1); }
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
if (OUT) spec.out = path.resolve(OUT);
if (RAW) { spec.bubbles = []; spec.tts = false; spec.zoom = false; }
if (VOICE) spec.zoom = false;
const TTS = VOICE ? ttsFor(spec) : null;
const base = path.dirname(path.resolve(specPath));
const abs = (p) => (path.isAbsolute(p) ? p : path.resolve(base, p));
const work = path.join(path.dirname(abs(spec.out)), "..", "work", path.basename(spec.out, ".mp4")); fs.mkdirSync(work, { recursive: true });
const PY = path.join(INFRA_ROOT, ".venv", "bin", "python");
const run = (cmd, argv) => { const r = spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 26 }); if (r.status !== 0) { console.error(r.stderr || r.stdout); throw new Error(`${cmd} a échoué`); } return r.stdout; };
const dur = (f) => Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).trim());
const W = 1080, H = 1920, FPS = 30;
const hookDur = spec.hookDuration ?? 3;

// 1. Voix TTS (macOS say) et durées → timeline des bulles
const voice = spec.voice || "Thomas";
let cursor = 0; const bubbles = [];
for (const [i, b] of (spec.bubbles || []).entries()) {
  let ttsDur = 0, wav = null;
  if (spec.tts !== false && b.tts !== false) {
    wav = path.join(work, `tts_${i}.wav`);
    if (TTS) {   // --voice : moteur de scripts/tts.py (edge par défaut), puis stéréo 44,1 kHz comme la voix `say`
      const mono = path.join(work, `tts_${i}.mono.wav`);
      run(PY, [path.join(INFRA_ROOT, "scripts", "tts.py"), mono, "--text", b.speak || b.text, "--engine", TTS.engine, "--voice", TTS.voice, ...(TTS.rate ? ["--rate", String(TTS.rate)] : [])]);
      run("ffmpeg", ["-y", "-loglevel", "error", "-i", mono, "-ar", "44100", "-ac", "2", wav]);
    } else {
      const aiff = path.join(work, `tts_${i}.aiff`);
      run("say", ["-v", voice, "-r", String(spec.rate || 185), "-o", aiff, b.speak || b.text]);
      run("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, "-ar", "44100", "-ac", "2", wav]);
    }
    ttsDur = dur(wav);
  }
  const start = b.at ?? cursor;
  let end = start + Math.max(b.dur ?? 3, ttsDur + 0.4);
  if ((b.pos || (i === 0 ? "hook" : "")) === "hook") end = Math.min(end, hookDur); // la bulle du hook ne déborde jamais sur l'écran de l'app
  bubbles.push({ ...b, start, end, wav, ttsDur });
  cursor = end;
}

// 2. Rendu des bulles (PNG transparents) — pas en --voice : le texte reste natif, seule la voix est ajoutée
for (const [i, b] of (VOICE ? [] : bubbles).entries()) {
  b.png = path.join(work, `bubble_${i}.png`);
  run(PY, [path.join(INFRA_ROOT, "scripts", "render-bubble.py"), b.png, "--text", b.text, "--size", String(b.size || (i === 0 ? 62 : 54)), "--style", b.style || "bandeau"]);
  b.h = Number(run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=height", "-of", "csv=p=0", b.png]).trim());
}

// 3. Filtre vidéo
const zoom = spec.zoom !== false;
const inputs = zoom ? ["-i", abs(spec.photo)] : ["-loop", "1", "-framerate", String(FPS), "-t", String(hookDur), "-i", abs(spec.photo)];
// sources écran : spec.screen + toute source différente déclarée dans un segment (segment.src)
const sources = [abs(spec.screen)]; for (const sg of spec.segments || []) { const src = sg.src ? abs(sg.src) : abs(spec.screen); if (!sources.includes(src)) sources.push(src); }
for (const src of sources) inputs.push("-i", src);
const NSRC = sources.length;
const fc = [];
// photo : cover 1080x1920 + zoom lent
if (zoom) fc.push(`[0:v]select=eq(n\\,0),scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},zoompan=z='min(1+0.0009*on,1.08)':d=${hookDur * FPS}:s=${W}x${H}:fps=${FPS},trim=duration=${hookDur},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[photo]`);
else fc.push(`[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},trim=duration=${hookDur},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[photo]`);
// screen : rogner la barre de statut, ajuster en hauteur, fond noir sur les côtés
const statusCrop = spec.statusCrop ?? 130;
const segs = spec.segments || [];
segs.forEach((s, i) => {
  const fs_ = s.freezeStart ?? 0, fe = s.freezeEnd ?? 0;
  const srcIdx = 1 + sources.indexOf(s.src ? abs(s.src) : abs(spec.screen));
  fc.push(`[${srcIdx}:v]trim=start=${s.from}:end=${s.to},setpts=PTS-STARTPTS,fps=${FPS},crop=iw:ih-${statusCrop}:0:${statusCrop},scale=-2:${H},pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,tpad=start_mode=clone:start_duration=${fs_}:stop_mode=clone:stop_duration=${fe},setsar=1,format=yuv420p[seg${i}]`);
});
fc.push(`[photo]${segs.map((_, i) => `[seg${i}]`).join("")}concat=n=${segs.length + 1}:v=1:a=0[base]`);
// bulles
let last = "base";
const drawn = VOICE ? [] : bubbles;
drawn.forEach((b, i) => {
  inputs.push("-i", b.png);
  // Positions : hook (photo) à 30 % ; card = zone vide en haut de la carte opinion ; verdict = zone blanche sous le pourcentage ; low ; center
  const POS = { top: 0.11, card: 0.17, verdict: 0.60, low: 0.68, hook: 0.30 };
  const y = b.y ?? (b.pos === "center" ? `(H-${b.h})/2` : Math.round(H * (POS[b.pos] ?? (i === 0 ? POS.hook : POS.card))));
  fc.push(`[${last}][${1 + NSRC + i}:v]overlay=0:${y}:enable='between(t,${b.start.toFixed(2)},${b.end.toFixed(2)})'[v${i}]`);
  last = `v${i}`;
});
// 4. Audio : mix des TTS décalés
const wavs = bubbles.filter((b) => b.wav);
let audioMap = [];
if (wavs.length) {
  wavs.forEach((b, i) => { inputs.push("-i", b.wav); const idx = 1 + NSRC + drawn.length + i; fc.push(`[${idx}:a]adelay=${Math.round(b.start * 1000)}|${Math.round(b.start * 1000)}[a${i}]`); });
  fc.push(`${wavs.map((_, i) => `[a${i}]`).join("")}amix=inputs=${wavs.length}:normalize=0,volume=${spec.ttsVolume ?? 1.6}[aout]`);
  audioMap = ["-map", "[aout]", "-c:a", "aac", "-b:a", "160k"];
} else audioMap = ["-an"];
const total = hookDur + segs.reduce((s, x) => s + (x.to - x.from) + (x.freezeStart ?? 0) + (x.freezeEnd ?? 0), 0);
const args = ["-y", "-loglevel", "error", ...inputs, "-filter_complex", fc.join(";"), "-map", `[${last}]`, ...audioMap, "-t", total.toFixed(2), "-r", String(FPS), "-c:v", "libx264", "-crf", "19", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", abs(spec.out)];
fs.writeFileSync(path.join(work, "ffmpeg-args.txt"), args.join(" "));
run("ffmpeg", args);
console.log(`→ ${abs(spec.out)} (${total.toFixed(1)} s)${RAW ? " [brut : sans texte, sans voix, sans zoom]" : VOICE ? ` [avec voix ${TTS.engine}/${TTS.voice}, texte natif]` : ""}`);
console.log("bulles :", bubbles.map((b) => `${b.start.toFixed(1)}-${b.end.toFixed(1)} ${b.text.slice(0, 40)}`).join(" | "));
