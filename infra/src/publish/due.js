// Garde horaire de l'envoi du soir : l'heure vit dans config/project.json (daily_hour, daily_minute, daily_enabled),
// modifiable depuis le tableau de bord sans root ; le timer systemd (deploy/systemd/content-daily-drafts.timer) réveille
// le service toutes les 5 min et cette garde (ExecCondition=) ne laisse passer qu'un seul départ par jour.
//   node src/publish/due.js daily-drafts      → code 0 = c'est l'heure (et marque le jour), 1 = pas maintenant
//   node src/publish/due.js --status          → JSON { enabled, hour, minute, next, ran_today }
// Fenêtre : de HH:MM à HH:MM + 20 min (pas de rattrapage : un VPS éteint à l'heure d'envoi n'envoie pas à 3 h du matin).
import fs from "node:fs";
import path from "node:path";
import { DATA } from "../lib/paths.js";
import { project } from "../lib/project.js";
import { today } from "../lib/fs.js";

const STAMPS = path.join(DATA, "scheduler");
export const WINDOW_MIN = 20;
const stamp = (task, date) => path.join(STAMPS, `${task}-${date}`);

export function dailyConfig() {
  const p = project();
  return { enabled: p.daily_enabled !== false, hour: Number(p.daily_hour ?? 18), minute: Number(p.daily_minute ?? 0) };
}
const at = (d, h, m) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };

// Prochain départ (Date) : aujourd'hui si l'heure n'est pas passée et que rien n'est parti, sinon demain
export function nextDaily(now = new Date()) {
  const c = dailyConfig();
  if (!c.enabled) return null;
  const t = at(now, c.hour, c.minute);
  const ran = fs.existsSync(stamp("daily-drafts", today()));
  if (!ran && now < new Date(t.getTime() + WINDOW_MIN * 60e3)) return t;
  return new Date(at(now, c.hour, c.minute).getTime() + 864e5);
}
export function status(now = new Date()) {
  const c = dailyConfig(), n = nextDaily(now);
  return { ...c, window_min: WINDOW_MIN, next: n ? n.toISOString() : null, ran_today: fs.existsSync(stamp("daily-drafts", today())) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const task = process.argv[2];
  if (task === "--status") { console.log(JSON.stringify(status(), null, 2)); process.exit(0); }
  if (task !== "daily-drafts") { console.error("Usage : node src/publish/due.js daily-drafts | --status"); process.exit(2); }
  const c = dailyConfig(), now = new Date(), t = at(now, c.hour, c.minute);
  const f = stamp(task, today());
  if (!c.enabled) { console.log(`${task} : désactivé (daily_enabled: false dans config/project.json)`); process.exit(1); }
  if (fs.existsSync(f)) process.exit(1);   // déjà parti aujourd'hui : silencieux (le timer repasse toutes les 5 min)
  if (now < t || now >= new Date(t.getTime() + WINDOW_MIN * 60e3)) process.exit(1);
  fs.mkdirSync(STAMPS, { recursive: true });
  fs.writeFileSync(f, new Date().toISOString() + "\n");
  console.log(`${task} : départ (heure prévue ${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")})`);
  process.exit(0);
}
