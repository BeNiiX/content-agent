// Retours de validation : commentaires laissés sur une créa depuis le tableau de bord (ce qui est bien / pas bien).
// Stockés dans la fiche EXP, section « ## Retours de validation », une ligne par retour :
//   - [ ] 2026-09-23 18:40 · 👎 à éviter · le hook est trop long, on ne lit pas la slide 1
// La case [ ] = pas encore synthétisé ; la routine cloud `retours-quotidien` (deploy/routines/retours-quotidien.md)
// intègre chaque jour les retours dans 08_ACCOUNTS/<compte>/LEARNINGS.md puis coche la case [x].
import fs from "node:fs";

export const SECTION = "## Retours de validation";
export const KINDS = { keep: "👍 à garder", avoid: "👎 à éviter", note: "💬 note" };
const LINE = /^- \[( |x)\] (\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?) · (👍 à garder|👎 à éviter|💬 note) · (.*)$/;

export function parseFeedback(src) {
  const i = src.indexOf(`\n${SECTION}`);
  if (i < 0) return [];
  const rest = src.slice(i + SECTION.length + 1);
  const end = rest.search(/\n## /);
  return (end < 0 ? rest : rest.slice(0, end)).split("\n").map((l) => l.match(LINE)).filter(Boolean)
    .map((m) => ({ done: m[1] === "x", at: m[2], kind: Object.keys(KINDS).find((k) => KINDS[k] === m[3]), text: m[4] }));
}

export function appendFeedback(file, kind, text) {
  if (!KINDS[kind]) throw new Error("type de retour = keep | avoid | note");
  const clean = String(text || "").replace(/\s*\n\s*/g, " ").trim();
  if (!clean) throw new Error("commentaire vide");
  const d = new Date(), pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const line = `- [ ] ${stamp} · ${KINDS[kind]} · ${clean}`;
  let src = fs.readFileSync(file, "utf8");
  const i = src.indexOf(`\n${SECTION}`);
  if (i < 0) src = src.replace(/\s*$/, "") + `\n\n${SECTION}\n\n${line}\n`;
  else {
    const start = i + SECTION.length + 1, rel = src.slice(start).search(/\n## /);
    const end = rel < 0 ? src.length : start + rel;
    src = src.slice(0, end).replace(/\s*$/, "") + `\n${line}\n` + (rel < 0 ? "" : "\n" + src.slice(end).replace(/^\n+/, ""));
  }
  fs.writeFileSync(file, src);
  return { at: stamp, kind, text: clean, done: false };
}
