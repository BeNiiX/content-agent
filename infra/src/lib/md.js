// Frontmatter YAML minimal (écriture) + fusion avec le corps existant écrit par l'agent.
import fs from "node:fs";
import path from "node:path";

const yamlScalar = (v) => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map(yamlScalar).join(", ")}]`;
  if (typeof v === "object") return `{${Object.entries(v).map(([k, x]) => `${k}: ${yamlScalar(x)}`).join(", ")}}`;
  const s = String(v);
  return /^[\w.\-\/:@]+$/.test(s) && !/^(true|false|null|\d.*)$/.test(s) ? s : JSON.stringify(s);
};
export const frontmatter = (obj) => "---\n" + Object.entries(obj).map(([k, v]) => `${k}: ${yamlScalar(v)}`).join("\n") + "\n---\n";

/** Écrit un fichier MD : frontmatter régénéré, corps généré, puis section notes de l'agent préservée. */
export function readFrontmatter(file) {
  if (!fs.existsSync(file)) return {};
  const m = fs.readFileSync(file, "utf8").match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split("\n")) { const k = line.match(/^([\w-]+):\s*(.*)$/); if (k) out[k[1]] = k[2]; }
  return out;
}
const parseScalar = (v) => { if (v === undefined) return undefined; if (v === "null") return null; try { return JSON.parse(v); } catch { return v; } };

export function writeMd(file, fm, generatedBody, { notesMarker = "<!-- notes-agent : tout ce qui suit est conservé à la régénération -->", preserveKeys = [] } = {}) {
  let notes = "";
  if (fs.existsSync(file)) {
    const prev = fs.readFileSync(file, "utf8");
    const i = prev.indexOf(notesMarker);
    if (i >= 0) notes = prev.slice(i + notesMarker.length);
    const old = readFrontmatter(file);
    for (const k of preserveKeys) { const v = parseScalar(old[k]); if (v !== undefined && v !== null && v !== "") fm[k] = v; }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, frontmatter(fm) + "\n" + generatedBody.trimEnd() + "\n\n" + notesMarker + (notes || "\n\n## Notes de l'agent\n\n"));
}
export const num = (n) => (n === null || n === undefined ? "—" : n >= 1e6 ? (n / 1e6).toFixed(1) + " M" : n >= 1e3 ? (n / 1e3).toFixed(1) + " k" : String(n));
export const pct = (x) => (x === null || x === undefined ? "—" : (x * 100).toFixed(2) + " %");
export const fix = (x, d = 1) => (x === null || x === undefined ? "—" : Number(x).toFixed(d));
export const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 140);
