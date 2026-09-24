// Retrouver la spec de rendu d'une fiche EXP : champ `spec` de la fiche, sinon la spec de 08_ACCOUNTS/*/specs/** dont
// `exp` vaut l'identifiant, sinon celle dont `out` désigne le media_file (les anciennes fiches F01 n'ont pas de `spec`).
import fs from "node:fs";
import path from "node:path";
import { CONTENT_ROOT } from "./paths.js";

function allSpecs() {
  const root = path.join(CONTENT_ROOT, "08_ACCOUNTS"), out = [];
  if (!fs.existsSync(root)) return out;
  for (const slug of fs.readdirSync(root)) {
    const stack = [path.join(root, slug, "specs")];
    while (stack.length) {
      const dir = stack.pop();
      if (!fs.existsSync(dir)) continue;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.name.endsWith(".json") && !e.name.endsWith(".plan.json")) out.push(p);
      }
    }
  }
  return out;
}
// → chemin relatif au projet, ou null
export function specOf(id, fm = {}) {
  if (fm.spec && fs.existsSync(path.join(CONTENT_ROOT, fm.spec))) return fm.spec;
  const media = fm.media_file ? path.resolve(CONTENT_ROOT, String(fm.media_file).replace(/\s*\(.*\)$/, "").replace(/\/$/, "")) : null;
  let byOut = null;
  for (const f of allSpecs()) {
    let s; try { s = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
    if (s.exp === id) return path.relative(CONTENT_ROOT, f);
    if (media && s.out && path.resolve(path.dirname(f), s.out).replace(/\/$/, "") === media) byOut = f;
  }
  return byOut ? path.relative(CONTENT_ROOT, byOut) : null;
}
