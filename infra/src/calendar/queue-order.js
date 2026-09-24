#!/usr/bin/env node
// Calendrier : voir et modifier l'ordre d'envoi d'un compte (06_CALENDAR/QUEUE.md).
// Usage :
//   node src/calendar/queue-order.js                          # état des files : concepts qui se suivent, répétitions
//   node src/calendar/queue-order.js --account <compte>       # détail d'un compte
//   node src/calendar/queue-order.js --interleave [--account <slug>] [--dry-run]
//   node src/calendar/queue-order.js --move EXP-023 --to top|up|down|bottom|<n> [--account <slug>]
// Sans --account, --interleave traite tous les comptes qui ont une file.
import { accountsConfig } from "../publish/lib.js";
import { args } from "../lib/fs.js";
import * as Q from "./queue-edit.js";

const a = args();
const cfg = accountsConfig();
const parsed = Q.sections();
const slugs = a.account ? [a.account] : Object.keys(cfg.accounts).filter((s) => parsed.sections[s]?.rowIdx?.length);
const DRY = !!a["dry-run"];

function show(slug, proposed = null) {
  const rows = proposed || Q.rowsOf(slug);
  if (!rows.length) return console.log(`\n${slug} : pas de file`);
  const free = rows.filter((r) => !r.locked);
  const rep = free.filter((r, i) => i > 0 && (r.family || r.concept) === (free[i - 1].family || free[i - 1].concept));
  console.log(`\n${slug} (${cfg.accounts[slug]?.handle || "?"}) — ${rows.length} ligne(s), ${free.length} en attente${rep.length ? ` · ⚠ ${rep.length} répétition(s) de concept` : " · ✓ concepts alternés"}`);
  rows.forEach((r, i) => {
    const m = r.meta;
    console.log(`  ${String(i + 1).padStart(2)} ${r.locked ? "·" : " "} ${(r.exp || "—").padEnd(8)} ${r.concept.padEnd(14)} ${(m?.angle || "").padEnd(24)} ${m?.test_group ? m.test_group + " " + (m.variant || "") + " " : ""}${r.locked ? `(${r.statut || m?.status || "envoyé"})` : ""}`);
  });
}

if (a.move) {
  const slug = a.account || Object.keys(parsed.sections).find((s) => Q.rowsOf(s).some((r) => r.exp === a.move));
  if (!slug) { console.error(`${a.move} : compte introuvable (précise --account)`); process.exit(1); }
  const r = Q.moveRow(slug, a.move, a.to || "top");
  console.log(r.changed ? `${a.move} : place ${r.from} → ${r.to} dans ${slug}` : `${a.move} : déjà à cette place`);
  show(slug);
} else if (a.interleave) {
  for (const slug of slugs) {
    const r = Q.interleave(slug, { apply: !DRY });
    console.log(`${slug} : ${r.changed ? `${r.moved} ligne(s) déplacée(s)${DRY ? " (proposition, rien n'est écrit)" : ""}` : `inchangé${r.reason ? " (" + r.reason + ")" : ""}`}${r.repeats?.length ? ` · ⚠ répétitions inévitables : ${r.repeats.join(", ")}` : ""}`);
    show(slug, DRY ? r.order.map((o) => ({ exp: o.exp, concept: o.concept, family: o.concept.split(' ')[0], locked: o.locked, meta: { angle: o.angle, test_group: o.test, variant: o.variant } })) : null);
  }
} else {
  for (const slug of slugs) show(slug);
}
