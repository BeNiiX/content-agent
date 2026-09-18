// Régénère les plists launchd (macOS) à partir de config/project.json : labels com.content-agent.<slug>.daily-drafts /
// .weekly-stats, heure d'envoi du soir (daily_hour), relevé hebdo (weekly_stats), chemins absolus de cette copie du projet.
// Usage : node scripts/launchd/make-plists.js   → scripts/launchd/<label>.plist (les anciens plists du dossier sont supprimés)
// Installation : cp scripts/launchd/*.plist ~/Library/LaunchAgents/ && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/<label>.plist
// Note : en production le VPS (deploy/, systemd) prend le relais. Les plists générés contiennent des chemins absolus propres à
// cette machine : ils sont ignorés par git (.gitignore → infra/scripts/launchd/*.plist). Le tableau de bord lit l'état launchd
// (macOS) ou systemd (Linux) et les horaires depuis config/project.json.
import fs from "node:fs";
import path from "node:path";
import { INFRA_ROOT } from "../../src/lib/paths.js";
import { project, scheduledLabel } from "../../src/lib/project.js";

const DIR = path.join(INFRA_ROOT, "scripts", "launchd");
const p = project();
const plist = ({ label, script, calendar, log }) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>${path.join(INFRA_ROOT, "scripts", script)}</string></array>
  <key>WorkingDirectory</key><string>${INFRA_ROOT}</string>
  <key>StartCalendarInterval</key>
  <dict>${calendar.map(([k, v]) => `<key>${k}</key><integer>${v}</integer>`).join("")}</dict>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>${path.join(INFRA_ROOT, "data", log, "launchd.out.log")}</string>
  <key>StandardErrorPath</key><string>${path.join(INFRA_ROOT, "data", log, "launchd.err.log")}</string>
</dict>
</plist>
`;
const jobs = [
  { label: scheduledLabel("daily-drafts"), script: "daily-drafts.sh", calendar: [["Hour", p.daily_hour], ["Minute", 0]], log: "publish/daily" },
  { label: scheduledLabel("weekly-stats"), script: "weekly-stats.sh", calendar: [["Weekday", p.weekly_stats.weekday], ["Hour", p.weekly_stats.hour], ["Minute", 0]], log: "accounts" },
];
for (const f of fs.readdirSync(DIR)) if (f.endsWith(".plist") && !jobs.some((j) => f === j.label + ".plist")) { fs.unlinkSync(path.join(DIR, f)); console.log(`- ${f} (ancien label supprimé)`); }
for (const j of jobs) { fs.writeFileSync(path.join(DIR, j.label + ".plist"), plist(j)); console.log(`→ scripts/launchd/${j.label}.plist`); }
