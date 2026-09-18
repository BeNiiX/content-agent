// Configuration d'instance (infra/config/project.json) : nom de l'app, slug, langues, vocabulaire, CTA.
// Schéma et valeurs : infra/config/README.md. Sans fichier, des valeurs neutres permettent au code de tourner.
// Équivalent Python : infra/scripts/project_config.py.
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./paths.js";

export const PROJECT_FILE = path.join(CONFIG, "project.json");

export const DEFAULTS = {
  name: "Content Agent",
  slug: "app",
  app_store_url: null,
  play_store_url: null,
  languages: ["fr", "en"],
  default_language: "fr",
  markets: [],
  timezone: "Europe/Paris",
  daily_hour: 18,
  weekly_stats: { weekday: 1, hour: 8 },
  vocabulary: {
    item: { fr: "carte", en: "card" },
    item_plural: { fr: "cartes", en: "cards" },
    verdict_label: { fr: "des joueurs pensent comme toi", en: "of players think like you" },
    agree: { fr: "d’accord", en: "agree" },
    disagree: { fr: "pas d’accord", en: "disagree" },
    score_label: { fr: "sont d’accord.", en: "agree." },
    question: { fr: "D'accord ou pas d'accord ?", en: "Agree or disagree?" },
    kicker: { fr: "", en: "" },
  },
  cta: { fr: "", en: "" },
  hashtags_core: { fr: [], en: [] },
  notify_title: null,
};

let cache = null;
/** Configuration fusionnée (fichier > valeurs par défaut). Relue à chaque changement de mtime. */
export function project() {
  let mtime = 0;
  try { mtime = fs.statSync(PROJECT_FILE).mtimeMs; } catch { /* absent : défauts */ }
  if (cache && cache.mtime === mtime) return cache.value;
  let raw = {};
  if (mtime) { try { raw = JSON.parse(fs.readFileSync(PROJECT_FILE, "utf8")); } catch (e) { console.error(`config/project.json illisible : ${e.message}`); } }
  const value = { ...DEFAULTS, ...raw, vocabulary: { ...DEFAULTS.vocabulary, ...(raw.vocabulary || {}) }, weekly_stats: { ...DEFAULTS.weekly_stats, ...(raw.weekly_stats || {}) } };
  value.notify_title = value.notify_title || value.name;
  cache = { mtime, value };
  return value;
}

/** Valeur localisée : `v` = chaîne (même valeur partout) ou { fr: …, en: … }. Repli : langue par défaut, puis première valeur. */
export function localized(v, lang) {
  if (v === null || v === undefined) return "";
  if (typeof v !== "object" || Array.isArray(v)) return v;
  const p = project();
  return v[lang] ?? v[p.default_language] ?? Object.values(v)[0] ?? "";
}

/** Vocabulaire d'instance : t("agree", "en") → "agree". Clés inconnues → "". */
export const t = (key, lang = project().default_language) => localized(project().vocabulary[key], lang);
/** CTA (phrase d'appel vers le store) dans la langue demandée. */
export const cta = (lang = project().default_language) => localized(project().cta, lang);
/** Hashtags cœur du marché (tableau). */
export const hashtagsCore = (lang = project().default_language) => { const h = localized(project().hashtags_core, lang); return Array.isArray(h) ? h : []; };
/** Label des tâches planifiées (launchd / systemd) : com.content-agent.<slug>.<task>. */
export const scheduledLabel = (task) => `com.content-agent.${project().slug}.${task}`;
