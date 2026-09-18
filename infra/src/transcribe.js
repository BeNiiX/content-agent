// Transcrit data/media/<key>.mp4 avec whisper (CLI `whisper` ou `whisper-cpp` s'il est installé) → data/media/<key>.txt
// Usage : node src/transcribe.js <key> [--model small] [--lang fr]
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { MEDIA } from "./lib/paths.js";
import { args } from "./lib/fs.js";

const a = args();
const key = a._[0];
if (!key) { console.error("Usage : node src/transcribe.js <key>"); process.exit(1); }
const mp4 = path.join(MEDIA, `${key}.mp4`);
if (!fs.existsSync(mp4)) { console.error(`Fichier absent : ${mp4} (node src/download.js --key ${key})`); process.exit(1); }
const which = (b) => spawnSync("which", [b]).status === 0;
if (which("whisper")) {
  const r = spawnSync("whisper", [mp4, "--model", a.model || "small", "--language", a.lang || "fr", "--output_format", "txt", "--output_dir", MEDIA], { stdio: "inherit" });
  process.exit(r.status);
}
console.error("Aucun whisper installé. Options : `pip install openai-whisper` (local) ou uploader la vidéo chez Higgsfield et utiliser video_analysis_create (MCP).");
process.exit(3);
