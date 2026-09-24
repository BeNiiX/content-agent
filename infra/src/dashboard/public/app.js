/* Tableau de bord de validation — front vanilla. Vues : validation, comptes, compte, agent (+ soir, journal), assets. Routage par hash. */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (n, cls = "") => `<svg class="${cls}"><use href="#i-${n}"/></svg>`;
const api = async (p, opts) => { const r = await fetch("/api" + p, opts); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText); return j; };
const post = (p, data) => api(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data || {}) });
const fmtDate = (iso) => { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };
const fmtDay = (iso) => { if (!iso) return "—"; const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso); return isNaN(d) ? iso : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); };
const mb = (b) => (b >= 1e6 ? (b / 1e6).toFixed(1) + " Mo" : Math.round(b / 1e3) + " ko");
const STATUS = { ready: ["chip-ok", "prêt"], drafted: ["chip-warn", "brouillon envoyé"], published: ["chip-ink", "publié"], todo: ["chip-info", "à produire"], other: ["chip-quiet", "?"] };
const chipStatus = (s, raw) => { const [c, l] = STATUS[s] || STATUS.other; return `<span class="chip ${c}" title="${esc(raw || "")}">${esc(s === "other" ? raw || "?" : l)}</span>`; };
// FORMAT-02 → F02 (même abréviation que les dossiers de specs et les gabarits)
const fshort = (f) => { const m = String(f || "").match(/FORMAT-0?(\d+)/); return m ? "F" + m[1].padStart(2, "0") : f || ""; };
const fmtChip = (f, r) => `<span class="chip chip-quiet">${esc(fshort(f))}${r ? " · " + esc(r) : ""}</span>`;
const thumb = (m, cls = "") => !m || !m.exists ? `<span class="thumb ph ${cls}">${icon("alert")}</span>` : m.type === "PHOTO" ? `<img class="thumb ${cls}" src="${m.cover}" alt="" loading="lazy">` : `<video class="thumb v ${cls}" src="${m.url}#t=0.5" muted preload="metadata"></video>`;
const toast = (msg, err = false) => { const t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.textContent = msg; $("#toasts").appendChild(t); setTimeout(() => t.remove(), err ? 6000 : 3200); };
const copy = async (btn, text) => { try { await navigator.clipboard.writeText(text); btn.classList.add("done"); btn.innerHTML = icon("check"); setTimeout(() => { btn.classList.remove("done"); btn.innerHTML = icon("copy"); }, 1400); } catch { toast("Copie impossible", true); } };

let state = null, view = "comptes", params = [];
async function loadState() { state = await api("/state"); renderBrand(); renderSchedChip(); renderNavBadge(); }
function renderNavBadge() {
  const n = state.validation?.pending || 0, b = $("#nav-pending"); b.textContent = n; b.hidden = !n;
  const g = state.gabarits_review || 0, f = $("#nav-formats"); if (f) { f.textContent = g; f.hidden = !g; }
}
// Nom de l'app (config/project.json) dans l'en-tête et l'onglet
function renderBrand() { const n = state.project?.name || "Content agent"; $("#brand-name").textContent = n; document.title = `Validation — ${n}`; }
// Vocabulaire d'instance : voc("item_plural") → « opinions » (langue par défaut de l'instance)
const voc = (k) => { const v = state?.project?.vocabulary?.[k]; return (v && typeof v === "object" ? v[state.project.default_language] ?? Object.values(v)[0] : v) || k; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Planificateur (launchd macOS / systemd Linux) : même forme { installed, scheduler, state, next, last_exit }
const hm = (d) => `${String(d.hour ?? 18).padStart(2, "0")}:${String(d.minute ?? 0).padStart(2, "0")}`;
const weekdayName = (n) => ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"][Number(n) || 0] || "lundi";
function schedLine(d, when) {
  if (d.installed === null) return `${esc(when)} <span class="faint">(pas de planificateur connu sur ce système)</span>`;
  if (!d.installed) return `${esc(when)} · <span style="color:var(--red)">non installé</span> <span class="faint">(${d.scheduler === "systemd" ? "deploy/install.sh" : "scripts/launchd/make-plists.js"})</span>`;
  return `${icon("check")} ${esc(d.scheduler)}, ${esc(when)}${d.next ? ` · prochain : ${esc(d.next)}` : ""}${d.state && d.state !== "active" ? ` · <span class="chip chip-warn">${esc(d.state)}</span>` : ""}${d.last_exit != null && String(d.last_exit) !== "0" ? ` · dernier code : ${esc(String(d.last_exit))}` : ""}`;
}
function renderSchedChip() {
  const d = state.daily, el = $("#sched-chip");
  el.className = "chip " + (d.enabled ? "chip-quiet" : "chip-bad");
  el.innerHTML = d.enabled ? `${icon("clock")} envoi ${hm(d)} · ${esc(fmtSend(d.next) || "")}` : `${icon("pause")} envoi auto coupé`;
}
// Enregistrement auto des textes : une seule file globale. Tout rendu de la vue Validation l'attend d'abord,
// sinon un rendu relit la fiche avant la fin de l'enregistrement et les champs affichent l'ancienne version.
let pendingSave = null, textChain = Promise.resolve();
async function flushTexts() { if (pendingSave) pendingSave(); await textChain.catch(() => {}); }
function route() {
  flushTexts();
  const h = location.hash.replace(/^#/, "") || "validation"; [view, ...params] = h.split("/").map(decodeURIComponent);
  if (view === "file") { location.replace(params[0] ? `#compte/${params[0]}` : "#comptes"); return; }   // anciens liens
  valKeys = null;
  const tab = { compte: "comptes", soir: "agent", journal: "agent", gabarit: "formats", format: "formats" }[view] || view;
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.view === tab));
  ({ validation: renderValidation, formats: renderFormats, format: renderFormat, gabarit: renderGabarit, comptes: renderComptes, compte: renderCompte, agent: renderAgent, soir: renderSoir, assets: renderAssets, journal: renderJournal }[view] || renderValidation)();
}
window.addEventListener("hashchange", route);
$("#refresh").addEventListener("click", async () => { await loadState(); route(); toast("Actualisé"); });
document.addEventListener("keydown", (e) => { if (e.key === "r" && !/input|textarea|select/i.test(e.target.tagName) && !e.metaKey) $("#refresh").click(); });
document.addEventListener("click", (e) => { const z = e.target.closest("[data-zoom]"); if (z) { e.preventDefault(); lightbox(z.dataset.zoom); } });
function lightbox(src) { let d = $("dialog.lb"); if (!d) { d = document.createElement("dialog"); d.className = "lb"; d.addEventListener("click", () => d.close()); document.body.appendChild(d); } d.innerHTML = `<img src="${esc(src)}" alt="aperçu">`; d.showModal(); }

/* ================= Outils communs aux vues ================= */
// État d'une créa pour l'humain : à valider → validée → envoyée → publiée ; refusée ; en production (pas encore rendue)
const valState = (e) => e.status === "published" ? "published" : e.status === "drafted" ? "sent" : e.pilot ? "pilot" : e.frozen ? "frozen" : e.validation === "refused" ? "refused" : e.validation === "retouch" ? "retouch" : e.status === "todo" ? "todo" : e.status === "ready" ? (e.validation === "validated" ? "validated" : "pending") : "other";
const VSTATE = { pending: ["chip-warn", "à valider"], validated: ["chip-ok", "validée"], refused: ["chip-bad", "refusée"], retouch: ["chip-info", "à retoucher"], frozen: ["chip-quiet", "gelée"], pilot: ["chip-ink", "pilote"], todo: ["chip-info", "en production"], sent: ["chip-ink", "brouillon envoyé"], published: ["chip-quiet", "publiée"], other: ["chip-quiet", "?"] };
const chipVal = (e) => { const [c, l] = VSTATE[valState(e)]; return `<span class="chip ${c}">${l}</span>`; };
const handleOf = (slug) => state.accounts.find((a) => a.slug === slug)?.handle || slug || "—";
// Date d'envoi prévue : « ce soir 17:45 », « demain 17:45 », « jeu. 24 sept. »
function fmtSend(iso) {
  if (!iso) return null;
  const d = new Date(iso), now = new Date(), t = new Date(now); t.setDate(t.getDate() + 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  const hm2 = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (same(d, now)) return `ce soir ${hm2}`;
  if (same(d, t)) return `demain ${hm2}`;
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}
const untilDay = (iso) => iso ? new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : null;
const inputTag = (t) => /input|textarea|select/i.test(t?.tagName || "") || t?.isContentEditable;

// Bouton de lancement : texte à gauche, vrai bouton d'action à droite (Lancer / Tester / Envoyer), pour qu'on voie que c'est cliquable
const RUN_VERB = { "daily-drafts": ["send", "Envoyer"], "daily-drafts-dry": ["play", "Tester"], "daily-notify": ["send", "Renvoyer"] };
const runGo = (k, s, busy) => { const [ic, verb] = RUN_VERB[k] || ["play", "Lancer"]; return `<span class="go ${s.confirm ? "danger" : ""}">${busy ? "En cours…" : `${icon(ic)} ${verb}`}</span>`; };

/* ================= Validation ================= */
const VTABS = [["pending", "À valider"], ["validated", "Validées"], ["retouch", "À retoucher"], ["refused", "Refusées"], ["frozen", "Gelées"], ["todo", "En production"], ["sent", "Envoyées"]];
let creasCache = null;
const accFilter = () => { try { return localStorage.getItem("val-acc") || ""; } catch { return ""; } };
async function renderValidation() {
  await flushTexts();
  creasCache = await api("/creas");
  const selId = params.find((x) => /^EXP-\d+$/.test(x)) || null;
  const sel = selId ? creasCache.find((e) => e.id === selId) : null;
  let tab = VTABS.some(([k]) => k === params[0]) ? params[0] : sel ? (valState(sel) === "published" ? "sent" : valState(sel)) : "pending";
  const acc = accFilter();
  const inTab = (e) => { const v = valState(e); return tab === "sent" ? v === "sent" || v === "published" : v === tab; };
  const list = creasCache.filter((e) => inTab(e) && (!acc || e.account === acc))
    .sort((a, b) => tab === "sent" ? String(b.draft_sent_at || b.published_at || "").localeCompare(String(a.draft_sent_at || a.published_at || "")) : (a.queue ? a.queue.order : 999) - (b.queue ? b.queue.order : 999) || a.id.localeCompare(b.id));
  const count = (k) => creasCache.filter((e) => { const v = valState(e); return (k === "sent" ? v === "sent" || v === "published" : v === k) && (!acc || e.account === acc); }).length;
  const current = sel && list.some((e) => e.id === sel.id) ? sel.id : sel ? sel.id : list[0]?.id || null;
  $("#main").innerHTML = `<div class="page-head"><div><h1>Validation des créas</h1>
      <p class="sub">Rien ne part sur un compte sans ton feu vert. Relis le média et les textes, corrige si besoin, puis <strong>valide</strong> ou <strong>refuse avec un motif</strong> : l'agent le lit et refait la créa.</p></div>
    <div class="row"><select class="input" id="val-acc" style="min-width:180px"><option value="">Tous les comptes</option>${state.accounts.map((a) => `<option value="${a.slug}" ${a.slug === acc ? "selected" : ""}>${esc(a.handle)}</option>`).join("")}</select></div></div>
  <nav class="subtabs" style="margin-bottom:14px">${VTABS.map(([k, l]) => `<a href="#validation/${k}" class="${k === tab ? "active" : ""}">${l} <span class="cnt">${count(k)}</span></a>`).join("")}</nav>
  <div class="val-layout ${current && selId ? "has-sel" : ""}">
    <div class="panel val-list">${list.length ? list.map((e) => `<a class="v-item ${e.id === current ? "active" : ""}" href="#validation/${tab}/${e.id}" data-exp="${e.id}">${thumb(e.media)}<span class="b"><span class="t"><span class="id">${e.id}</span>${esc(e.hook || e.title)}</span><span class="m">${e.two_versions ? `<b style="color:var(--accent-ink)">${e.variant ? "🎙 " + (e.variant === "voix" ? "avec voix" : "brute") : "2 versions"}</b> · ` : ""}${esc(e.handle || e.account || "—")} · ${esc(e.concept || "")}${e.queue ? ` · n° ${e.queue.order} dans la file` : " · hors file"}</span>${e.comments ? `<span class="m cm">💬 ${e.comments} commentaire${e.comments > 1 ? "s" : ""}${e.comments_pending ? "" : " · synthétisé" + (e.comments > 1 ? "s" : "")}</span>` : ""}${e.a_valider && tab === "pending" ? `<span class="m q">${icon("alert")} ${esc(e.a_valider)}</span>` : ""}${e.validation_note && (tab === "refused" || tab === "retouch") ? `<span class="m q">${esc(e.validation_note.replace(/\n/g, " · "))}</span>` : ""}${e.frozen && tab === "frozen" ? `<span class="m">❄ ${esc(e.frozen_reason || "")}</span>` : ""}${e.retouche_faite && tab === "pending" ? `<span class="m ok">✎ retouchée : ${esc(e.retouche_faite)}</span>` : ""}</span></a>`).join("")
      : `<div class="empty"><strong>${tab === "pending" ? "Rien à valider" : "Aucune créa ici"}</strong>${tab === "pending" ? "Toutes les créas rendues ont reçu une décision. L'agent en produit de nouvelles deux fois par semaine." : ""}</div>`}</div>
    <div class="panel val-detail" id="vdetail">${current ? "" : `<div class="empty"><strong>Aucune créa sélectionnée</strong></div>`}</div></div>`;
  $("#val-acc").addEventListener("change", (e) => { try { localStorage.setItem("val-acc", e.target.value); } catch { } renderValidation(); });
  if (current) renderCrea(current, list, tab);
}

async function renderCrea(id, list = [], tab = "pending") {
  await flushTexts();
  const box = $("#vdetail");
  box.innerHTML = `<div class="panel-body stack"><div class="skeleton" style="height:320px"></div><div class="skeleton"></div><div class="skeleton" style="width:60%"></div></div>`;
  let d; try { d = await api(`/exp/${id}`); } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const m = d.media, job = d.job, ed = job ? d.edit : null, ia = job?.in_app || {};
  const st = valState(d), locked = st === "sent" || st === "published" || st === "frozen" || st === "pilot", isPhoto = (job?.media_type || m?.type) === "PHOTO";
  const idx = list.findIndex((e) => e.id === id), next = list[idx + 1]?.id || list[idx - 1]?.id || null;
  const media = !m ? `<div class="media-missing">Fiche sans <code>media_file</code></div>` : !m.exists ? `<div class="media-missing">${st === "todo" ? "Pas encore rendue : le VPS la rendra depuis sa spec (<code>" + esc(m.path) + "</code>)." : "Média introuvable : <code>" + esc(m.path) + "</code>"}</div>`
    : m.type === "PHOTO" ? `<div class="media-strip big">${m.slides.map((u, i) => `<a class="n" href="${u}" data-zoom="${u}"><img src="${u}" alt="slide ${i + 1}" loading="lazy"><span>${i + 1}/${m.count}</span></a>`).join("")}</div>`
    : `<div class="media-video big"><video src="${m.url}" controls playsinline preload="metadata"></video></div>`;
  const field = (k, label, hint, rows = 2) => ed ? `<label class="efield"><span class="k">${label}<span class="src">${esc(hint)}</span></span><span class="ctl"><textarea class="input" rows="${rows}" data-field="${k}" ${locked ? "readonly" : ""}>${esc(ed[k].value)}</textarea><button type="button" class="btn btn-sm btn-icon copy" data-copyfield="${k}" title="Copier">${icon("copy")}</button></span></label>` : "";
  const sheet = job?.sheet_rows ? `<table class="sheet"><thead><tr>${job.sheet_rows.header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${job.sheet_rows.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : ia.sheet ? `<div class="md">${md(ia.sheet)}</div>` : "";
  const problems = (job?.problems || []).filter((p) => !/non validée|refusée à la validation/.test(p));
  const decided = d.validated_at ? ` le ${fmtDate(d.validated_at)}` : "";
  const bar = st === "frozen" || st === "pilot" ? "" : locked
    ? `<div class="decide"><span class="muted">${st === "published" ? `Publiée${d.published_at ? " le " + esc(d.published_at) : ""}` : `Brouillon envoyé${d.draft_sent_at ? " le " + fmtDate(d.draft_sent_at) : ""} : à finaliser dans l'app TikTok`}</span>
        ${st === "sent" ? `<form class="inline-form" id="posted-form"><input class="input" name="url" placeholder="URL du post (optionnel)" type="url"><button class="btn btn-primary" type="submit">${icon("check")} Marquer publiée</button></form>` : ""}
        ${d.post_url ? `<a class="btn" href="${esc(d.post_url)}" target="_blank" rel="noopener">${icon("external")} Voir le post</a>` : ""}</div>`
    : `<div class="decide" id="decide">
        <div class="refuse-box" hidden><label class="small faint" id="note-label"></label><textarea class="input" rows="3" id="refuse-note">${esc(d.validation_note || "")}</textarea></div>
        <div class="row" style="justify-content:space-between;width:100%">
          <span class="muted small">${st === "validated" ? `${icon("check")} Validée${decided}` : st === "refused" ? `Refusée${decided}` : st === "todo" ? "Validation possible une fois le média rendu" : d.variants && !d.variants.choice ? `<b style="color:var(--accent-ink)">Choisis la version à envoyer</b> · <span class="kbd">1</span> brute · <span class="kbd">2</span> avec voix` : `<span class="kbd">V</span> valider · <span class="kbd">E</span> à retoucher · <span class="kbd">X</span> refuser · <span class="kbd">C</span> commenter · <span class="kbd">J</span>/<span class="kbd">K</span> naviguer`}</span>
          <span class="row">
            ${st === "validated" || st === "refused" || st === "retouch" ? `<button class="btn" data-decide="reset">Remettre en attente</button>` : ""}
            ${st !== "todo" ? `<button class="btn btn-retouch" data-decide="retouch">✎ ${st === "retouch" ? "Modifier les retouches" : "À retoucher"}</button>` : ""}
            ${st !== "refused" ? `<button class="btn btn-refuse" data-decide="refuse">${icon("x")} Refuser</button>` : `<button class="btn btn-refuse" data-decide="refuse">Modifier le motif</button>`}
            ${st !== "validated" ? `<button class="btn btn-ok" data-decide="validate" ${st === "todo" || !m?.exists || (d.variants && !d.variants.choice) ? "disabled" : ""} ${d.variants && !d.variants.choice ? 'title="Choisis d\'abord la version à envoyer"' : ""}>${icon("check")} ${d.variants?.choice ? `Valider la version ${d.variants.choice === "voix" ? "avec voix" : "brute"}` : "Valider"}</button>` : ""}
          </span></div></div>`;
  box.innerHTML = `<div class="panel-head"><div style="min-width:0"><div class="row small faint"><a href="#validation/${tab}" class="back-link">← liste</a><span class="id">${d.id}</span>·<a href="#compte/${esc(d.account || "")}">${esc(handleOf(d.account))}</a>·<span>${esc(d.concept || "")}</span>${d.fm.angle ? `· <span>${esc(d.fm.angle)}</span>` : ""}</div><h2 title="${esc(d.title)}">${esc(d.hook || d.title)}</h2></div>${chipVal(d)}</div>
    ${st === "frozen" ? `<div class="callout frozen">❄<div><b>Créa gelée</b>${esc(d.frozen_reason || "")}. Elle sera mise à jour selon la fiche technique du gabarit, puis reviendra à valider. Tu peux déjà la commenter : tes retours nourrissent la fiche. <a href="#gabarit/${esc(d.gabarit || "")}">Voir le gabarit →</a></div></div>` : ""}
    ${st === "pilot" ? `<div class="callout info">★<div><b>Pilote du gabarit ${esc(d.gabarit || "")}</b>Il se juge avec la fiche technique, dans l'onglet Formats. <a href="#gabarit/${esc(d.gabarit || "")}">Ouvrir le gabarit →</a></div></div>` : ""}
    ${d.fm.a_valider && !locked ? `<div class="callout warn">${icon("alert")}<div><b>Point à trancher (question de l'agent)</b>${esc(d.fm.a_valider)}</div></div>` : ""}
    ${st === "refused" && d.validation_note ? `<div class="callout bad">${icon("x")}<div><b>Motif du refus</b>${esc(d.validation_note)}</div></div>` : ""}
    ${st === "retouch" && d.validation_note ? `<div class="callout info">✎<div><b>Retouches demandées · en attente de l'agent</b><ul>${d.validation_note.split("\n").filter((l) => l.trim()).map((l) => `<li>${esc(l.replace(/^[-•]\s*/, ""))}</li>`).join("")}</ul></div></div>` : ""}
    ${st === "pending" && d.retouche_faite ? `<div class="callout ok">✎<div><b>Retouchée par l'agent : vérifie et valide</b>${esc(d.retouche_faite)}${d.validation_note ? `<div class="faint small" style="margin-top:3px">Demandé : ${esc(d.validation_note.replace(/\n/g, " · "))}</div>` : ""}</div></div>` : ""}
    ${d.variants ? versionsHtml(d, locked) : media}
    ${!locked && d.voice_possible === "possible" ? `<div class="voice-bar"><button type="button" class="btn" id="gen-voice">🎙 Générer aussi la version avec voix</button><span class="faint small">Même vidéo + voix générée calée sur les bulles (le texte reste natif). Tu choisiras ensuite la version à envoyer.</span></div>` : ""}
    ${!locked && d.voice_possible === "en cours" ? `<div class="voice-bar"><span class="chip chip-warn" id="voice-wait">🎙 Version avec voix en cours de rendu…</span><span class="faint small">Elle apparaîtra ici à côté de la version brute.</span></div>` : ""}
    ${d.carousel?.editable && !locked ? `<div class="sect car-edit" id="car-edit"><h3>Carrousel <span class="faint small" style="font-weight:400">chaque changement re-rend les slides aussitôt</span><span class="render-state" id="render-state"></span></h3>
      <div class="car-grid"><div class="car-cover"><span class="k">Photo · slide 1</span>
          <button type="button" class="cover-btn" id="pick-cover" title="Choisir une autre photo dans les assets">${d.carousel.cover.url ? `<img src="${d.carousel.cover.url}" alt="">` : `<span class="thumb ph">${icon("alert")}</span>`}<span class="ov">${icon("image")} Changer</span></button>
          <span class="faint small nm" title="${esc(d.carousel.cover.path)}">${esc(d.carousel.cover.name)}</span></div>
        <div class="car-order"><span class="k">Ordre des ${esc(voc("item_plural"))} · chacune = carte + score</span>
          <div id="op-sort">${d.carousel.opinions.map((o, j) => `<div class="s-row op-row" data-exp="${o.i}"><button class="grip" type="button" aria-label="Déplacer (flèches haut / bas)" title="Glisser pour changer l'ordre"><svg><use href="#i-grip"/></svg></button><span class="ord">${j + 1}</span><span class="pct">${esc(o.pct)} %</span><span class="t">${esc(o.text)}</span><span class="sl faint">slides ${j * 2 + 2}-${j * 2 + 3}</span></div>`).join("")}</div></div></div></div>` : ""}
    <div class="sect"><h3>Textes ${isPhoto ? '<span class="chip chip-quiet">carrousel</span>' : '<span class="chip chip-quiet">vidéo</span>'} <span class="faint small" style="font-weight:400">${locked ? "déjà envoyée : lecture seule" : "modifiables jusqu'à l'envoi, enregistrés automatiquement"}</span><span class="save-state" id="save-state"></span></h3>
      ${!job ? `<p class="muted small">Textes indisponibles : ${esc(d.job_error || "")}</p>` : `
      ${isPhoto && ed.tiktok_title.applies ? field("tiktok_title", "Titre à taper", ed.tiktok_title.source, 1) : ""}
      ${field("front_page_text", isPhoto ? "Texte natif slide 1" : "Texte natif", ed.front_page_text.source, 2)}
      ${field("caption", isPhoto ? "Caption (fiche)" : "Caption", ed.caption.source, 3)}
      ${field("sound", "Son", ed.sound.source, 1)}
      ${isPhoto && ed.description_sent ? `<div class="efield ro"><span class="k">Description envoyée<span class="src">fixe, réglage du compte</span></span><span class="v">${esc(ed.description_sent)}</span></div>` : ""}`}
      ${sheet ? `<details class="sheet-box"><summary>${job?.sheet_rows ? "Bulles (texte natif + voix)" : "Fiche POSTS.md"} <span class="faint small">${esc(ia.textes_md || ia.posts_md || "")}</span></summary>${sheet}</details>` : ""}
      ${problems.length ? `<ul class="problems">${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}</div>
    <div class="sect comments"><h3>Commentaires <span class="faint small" style="font-weight:400">ce qui est bien, ce qui ne l'est pas : l'agent en tire chaque jour les learnings du compte</span></h3>
      ${(d.comments_list || []).length ? `<ul class="c-list">${d.comments_list.map((c) => `<li class="c-${c.kind}"><span class="c-k">${{ keep: "👍 À garder", avoid: "👎 À éviter", note: "💬 Note" }[c.kind]}</span><span class="c-t">${esc(c.text)}</span><span class="c-m">${esc(c.at)}${c.done ? ` · <span title="Intégré dans ${esc("08_ACCOUNTS/" + (d.account || "") + "/LEARNINGS.md")}">${icon("check")} dans les learnings</span>` : " · en attente de synthèse"}</span></li>`).join("")}</ul>` : ""}
      <form class="c-form" id="c-form"><div class="seg" role="radiogroup" aria-label="Type de commentaire">
          <label><input type="radio" name="kind" value="keep"><span>👍 À garder</span></label><label><input type="radio" name="kind" value="avoid"><span>👎 À éviter</span></label><label><input type="radio" name="kind" value="note" checked><span>💬 Note</span></label></div>
        <textarea class="input" name="text" rows="2" placeholder="Ex. : le hook POV accroche bien · la slide 3 est illisible sur fond clair · opinion trop consensuelle"></textarea>
        <div class="row" style="justify-content:space-between"><span class="faint small"><span class="kbd">C</span> pour écrire · <span class="kbd">⌘</span>+<span class="kbd">↵</span> pour ajouter</span><button class="btn btn-primary btn-sm" type="submit">Ajouter le commentaire</button></div></form></div>
    <details class="sect meta-box"><summary>Fiche ${esc(d.file)}</summary><dl class="kv" style="margin-top:8px">
      <dt>Statut</dt><dd>${esc(d.status_raw || "—")}</dd><dt>Format</dt><dd>${d.format ? `<a href="#format/${esc(d.format)}">${esc(d.format)}</a>` : "—"} ${esc(d.rendition || "")}${d.gabarit ? ` · gabarit <a href="#gabarit/${esc(d.gabarit)}">${esc(d.gabarit)}</a>${d.crea_gabarit_version ? ` v${esc(d.crea_gabarit_version)}` : ""}` : ""}</dd>
      ${d.fm.test_group ? `<dt>Test</dt><dd>${esc(d.fm.test_group)} · variante ${esc(d.fm.variant || "")}</dd>` : ""}
      ${d.fm.opinion ? `<dt>${esc(cap(voc("item_plural")))}</dt><dd style="white-space:normal">${esc(d.fm.opinion)}</dd>` : ""}
      ${d.fm.photo ? `<dt>Photo</dt><dd>${esc(d.fm.photo)}</dd>` : ""}
      <dt>Média</dt><dd><code>${esc(m?.path || "—")}</code>${m?.exists ? ` · ${m.type === "PHOTO" ? m.count + " slides" : mb(m.bytes)}` : ""}</dd>
      <dt>Créée</dt><dd>${esc(d.fm.created || "—")} · mise à jour ${esc(d.updated || "—")}</dd></dl>
      ${state.platform === "darwin" ? `<div class="row" style="margin-top:8px">${m?.exists ? `<button class="btn btn-sm" data-reveal="${esc(m.path)}">${icon("folder")} Média dans le Finder</button>` : ""}<button class="btn btn-sm" data-reveal="${esc(d.file)}">${icon("external")} Fiche EXP</button></div>` : ""}</details>
    ${bar}`;

  // textes : enregistrement automatique (0,8 s après la dernière frappe, ou en quittant le champ / la créa)
  const initial = {}; let saveTimer = null;
  const setSave = (txt, cls = "") => { const el = $("#save-state"); if (el) { el.textContent = txt; el.className = "save-state " + cls; } };
  const dirty = () => { const out = {}; box.querySelectorAll("[data-field]").forEach((t) => { if (t.value !== initial[t.dataset.field]) out[t.dataset.field] = t.value; }); return Object.keys(out).length ? out : null; };
  const saveTexts = () => {
    clearTimeout(saveTimer);
    const ch = dirty();
    if (!ch) return textChain.then(() => false, () => false);
    Object.assign(initial, ch);   // pris en compte tout de suite : une frappe suivante n'enverra que la différence
    setSave("Enregistrement…", "wip");
    textChain = textChain.catch(() => {}).then(() => post(`/exp/${id}/texts`, ch)).then(
      () => { setSave("✓ Enregistré", "ok"); return true; },
      (err) => { for (const k of Object.keys(ch)) initial[k] = undefined; setSave(`Non enregistré : ${err.message}`, "bad"); toast(`Textes non enregistrés : ${err.message}`, true); throw err; });
    return textChain;
  };
  pendingSave = () => { saveTexts().catch(() => {}); };
  box.querySelectorAll("[data-field]").forEach((t) => {
    initial[t.dataset.field] = t.value; autoGrow(t);
    t.addEventListener("input", () => { autoGrow(t); setSave("Modifié…", "wip"); clearTimeout(saveTimer); saveTimer = setTimeout(() => saveTexts().catch(() => {}), 800); });
    t.addEventListener("blur", () => { if (dirty()) saveTexts().catch(() => {}); });
  });
  box.querySelectorAll("[data-copyfield]").forEach((b) => b.addEventListener("click", () => copy(b, box.querySelector(`[data-field="${b.dataset.copyfield}"]`).value)));
  box.querySelectorAll("[data-reveal]").forEach((b) => b.addEventListener("click", () => post("/reveal", { path: b.dataset.reveal }).catch((e) => toast(e.message, true))));
  // deux versions : choix, lecture exclusive ; génération de la version avec voix
  const choose = async (k) => { if (!d.variants || locked || d.variants.choice === k) return; try { await saveTexts().catch(() => {}); await post(`/exp/${id}/variant`, { choice: k }); toast(`Version ${k === "voix" ? "avec voix" : "brute"} choisie`); renderCrea(id, list, tab); } catch (err) { toast(err.message, true); } };
  box.querySelectorAll("[data-choose]").forEach((b) => b.addEventListener("click", () => choose(b.dataset.choose)));
  const vids = [...box.querySelectorAll(".var-card video")];
  vids.forEach((v) => v.addEventListener("play", () => vids.forEach((o) => o !== v && o.pause())));
  $("#gen-voice")?.addEventListener("click", async (e) => {
    const b = e.currentTarget; b.setAttribute("aria-busy", "true"); b.textContent = "🎙 Rendu en cours…";
    try { const r = await post(`/exp/${id}/voice`); toast("Rendu de la version avec voix lancé (quelques secondes à une minute)"); waitRun(r.run.id, id, list, tab); }
    catch (err) { toast(err.message, true); b.removeAttribute("aria-busy"); }
  });
  if ($("#voice-wait")) setTimeout(() => { if (location.hash.endsWith(id)) renderCrea(id, list, tab); }, 5000);
  // carrousel : photo de couverture + ordre des opinions → nouveau rendu immédiat
  const car = async (patch, msg) => {
    await saveTexts().catch(() => {});
    const ce = $("#car-edit"); ce?.classList.add("rendering"); box.querySelector(".media-strip")?.classList.add("rendering");
    const rs = $("#render-state"); if (rs) rs.textContent = "Rendu des slides…";
    try { await post(`/exp/${id}/carousel`, patch); toast(msg); renderCrea(id, list, tab); }
    catch (err) { toast(err.message, true); renderCrea(id, list, tab); }
  };
  if ($("#op-sort")) sortable($("#op-sort"), (order) => car({ order: order.map(Number) }, "Ordre des opinions changé, slides re-rendues"));
  $("#pick-cover")?.addEventListener("click", () => pickPhoto(d.carousel.cover.path, (p) => car({ cover: p }, "Photo changée, slides re-rendues")));
  const after = async (msg) => { toast(msg); await loadState(); location.hash = next && tab === "pending" ? `#validation/${tab}/${next}` : `#validation/${tab}`; if (location.hash === `#validation/${tab}`) route(); };
  const decide = async (kind, btn) => {
    btn?.setAttribute("aria-busy", "true");
    try {
      if (kind === "validate") { const saved = await saveTexts(); await post(`/exp/${id}/validation`, { decision: "validé" }); await after(`${id} validée${saved ? " (textes enregistrés)" : ""} : elle partira à son tour dans la file`); }
      else if (kind === "reset") { await saveTexts(); await post(`/exp/${id}/validation`, { decision: null }); await after(`${id} remise en attente`); }
      else if (kind === "refuse" || kind === "retouch") {
        // Refus = à refaire entièrement ; retouche = créa gardée, l'agent applique seulement les changements listés
        const boxR = box.querySelector(".refuse-box"), note = $("#refuse-note"), R = kind === "retouch";
        if (boxR.hidden || boxR.dataset.mode !== kind) {
          boxR.hidden = false; boxR.dataset.mode = kind;
          $("#note-label").textContent = R ? "Changements à faire, un par ligne : l'agent ne touche qu'à ça, puis la créa revient ici" : "Pourquoi tu la refuses : l'agent refait la créa";
          note.placeholder = R ? "Ex. :\nmettre le hook sur 2 lignes\nremplacer la photo par une photo de terrasse\nvoix un peu plus lente" : "Ex. : opinion trop consensuelle, angle hors ICP, photo floue…";
          box.querySelectorAll('[data-decide="refuse"], [data-decide="retouch"]').forEach((b) => b.classList.toggle("armed", b === btn));
          btn.innerHTML = R ? "✎ Envoyer les retouches" : `${icon("x")} Confirmer le refus`;
          note.focus(); btn.removeAttribute("aria-busy"); return;
        }
        if (!note.value.trim()) { toast(R ? "Liste les changements à faire" : "Écris ce que l'agent doit corriger", true); note.focus(); btn.removeAttribute("aria-busy"); return; }
        await saveTexts();
        await post(`/exp/${id}/validation`, { decision: R ? "à retoucher" : "refusé", note: note.value });
        await after(R ? `${id} à retoucher : l'agent applique les changements, puis elle revient à valider` : `${id} refusée : l'agent la reprendra`);
      }
    } catch (err) { toast(err.message, true); btn?.removeAttribute("aria-busy"); }
  };
  box.querySelectorAll("[data-decide]").forEach((b) => b.addEventListener("click", () => decide(b.dataset.decide, b)));
  $("#refuse-note")?.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); const m = box.querySelector(".refuse-box").dataset.mode; box.querySelector(`[data-decide="${m}"]`)?.click(); } });
  valKeys = (e) => {
    if (inputTag(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "j" || k === "k") { const to = list[idx + (k === "j" ? 1 : -1)]; if (to) location.hash = `#validation/${tab}/${to.id}`; }
    else if (k === "v") box.querySelector('[data-decide="validate"]:not([disabled])')?.click();
    else if ((k === "1" || k === "2") && d.variants) choose(k === "1" ? "brut" : "voix");
    else if (k === "x") { e.preventDefault(); box.querySelector('[data-decide="refuse"]')?.click(); }
    else if (k === "e") { e.preventDefault(); box.querySelector('[data-decide="retouch"]')?.click(); }
    else if (k === "c") { e.preventDefault(); const t = $("#c-form textarea"); t.scrollIntoView({ block: "center", behavior: "smooth" }); t.focus(); }
  };
  const cf = $("#c-form");
  const sendComment = async () => {
    const b = cf.querySelector("button"), text = cf.text.value.trim();
    if (!text) { toast("Écris le commentaire", true); cf.text.focus(); return; }
    b.setAttribute("aria-busy", "true");
    try {
      await saveTexts().catch(() => {});
      const r = await post(`/exp/${id}/comment`, { kind: cf.kind.value, text });
      const c = r.comment, lab = { keep: "👍 À garder", avoid: "👎 À éviter", note: "💬 Note" }[c.kind];
      let ul = box.querySelector(".c-list"); if (!ul) { ul = document.createElement("ul"); ul.className = "c-list"; cf.before(ul); }
      ul.insertAdjacentHTML("beforeend", `<li class="c-${c.kind}"><span class="c-k">${lab}</span><span class="c-t">${esc(c.text)}</span><span class="c-m">${esc(c.at)} · en attente de synthèse</span></li>`);
      cf.text.value = ""; b.removeAttribute("aria-busy");
      const it = document.querySelector(`.v-item[data-exp="${id}"] .b`), n = ul.children.length;
      if (it) { let m = it.querySelector(".m.cm"); if (!m) { m = document.createElement("span"); m.className = "m cm"; it.children[1].after(m); } m.textContent = `💬 ${n} commentaire${n > 1 ? "s" : ""}`; }
      toast("Commentaire ajouté : il sera synthétisé dans les learnings du compte");
    } catch (err) { toast(err.message, true); b.removeAttribute("aria-busy"); }
  };
  cf.addEventListener("submit", (e) => { e.preventDefault(); sendComment(); });
  cf.text.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendComment(); } });
  const form = $("#posted-form"); if (form) form.addEventListener("submit", async (e) => {
    e.preventDefault(); const b = form.querySelector("button"); b.setAttribute("aria-busy", "true");
    try { const r = await post(`/exp/${id}/posted`, { post_url: form.url.value.trim() || null }); toast(r.output.split("\n")[0]); await loadState(); route(); }
    catch (err) { toast(err.message, true); b.removeAttribute("aria-busy"); }
  });
}
// Choisir une photo rangée de 07_ASSETS/photos (par thème) ; current = chemin relatif de la photo actuelle
async function pickPhoto(current, onPick) {
  let d = $("dialog.picker"); if (!d) { d = document.createElement("dialog"); d.className = "picker"; document.body.appendChild(d); d.addEventListener("click", (e) => { if (e.target === d) d.close(); }); }
  d.innerHTML = `<div class="pk-head"><h2>Choisir la photo de la slide 1</h2><button class="btn btn-icon" data-close title="Fermer">${icon("x")}</button></div><div class="pk-body"><div class="skeleton" style="height:200px"></div></div>`;
  d.querySelector("[data-close]").onclick = () => d.close();
  d.showModal();
  if (!assetsCache) { try { assetsCache = await api("/assets"); } catch (e) { d.querySelector(".pk-body").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; } }
  const themes = assetsCache.photos.filter((t) => t.items.length);
  let theme = current?.split("/")[2] || themes[0]?.theme;
  const draw = () => {
    const t = themes.find((x) => x.theme === theme) || themes[0];
    d.querySelector(".pk-body").innerHTML = `<nav class="subtabs pk-tabs">${themes.map((x) => `<a href="#" data-theme="${esc(x.theme)}" class="${x.theme === t.theme ? "active" : ""}">${esc(x.theme)} <span class="cnt">${x.items.length}</span></a>`).join("")}</nav>
      <div class="photo-grid pk-grid">${t.items.map((i) => { const p = `07_ASSETS/photos/${t.theme}/${i.name}`; return `<button type="button" class="ph pk ${p === current ? "cur" : ""}" data-path="${esc(p)}" title="${esc(i.desc || i.name)}"><img src="${i.url}" alt="" loading="lazy">${p === current ? '<span class="chip chip-ink used">actuelle</span>' : i.used ? `<span class="chip chip-quiet used" title="${esc(i.used)}">déjà ${i.used.split(",").length}×</span>` : '<span class="chip chip-ok used">jamais utilisée</span>'}<div class="cap"><span class="nm">${esc(i.name)}</span><span class="ds">${esc(i.desc || "")}</span></div></button>`; }).join("")}</div>`;
    d.querySelectorAll("[data-theme]").forEach((a) => a.onclick = (e) => { e.preventDefault(); theme = a.dataset.theme; draw(); });
    d.querySelectorAll("[data-path]").forEach((b) => b.onclick = () => { if (b.dataset.path === current) return d.close(); d.close(); onPick(b.dataset.path); });
  };
  draw();
}
// Deux versions d'une même créa, côte à côte, avec le choix
function versionsHtml(d, locked) {
  const v = d.variants, card = (k, label, sub) => { const m = v[k], on = v.choice === k;
    return `<div class="var-card ${on ? "chosen" : ""}"><div class="vh"><b>${label}</b><span class="faint small">${sub}</span></div>
      ${m?.exists ? `<video src="${m.url}" controls playsinline preload="metadata"></video>` : `<div class="media-missing">Fichier introuvable</div>`}
      ${locked ? (on ? `<span class="chip chip-ink">version envoyée</span>` : "") : on ? `<span class="btn btn-sm chosen-btn">${icon("check")} Version choisie</span>` : `<button type="button" class="btn btn-sm" data-choose="${k}">Choisir cette version</button>`}</div>`; };
  return `<div class="versions">${card("brut", "Brute", "texte natif, sans voix")}${card("voix", "Avec voix", "voix générée + texte natif")}</div>`;
}
// Suit un rendu lancé depuis la validation, puis réaffiche la créa
async function waitRun(runId, id, list, tab) {
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    let r; try { r = await api(`/runs/${runId}`); } catch { continue; }
    if (r.running) continue;
    if (r.code === 0) toast("Version avec voix prête : écoute les deux et choisis"); else toast(`Rendu en échec : ${(r.log || "").trim().split("\n").slice(-2).join(" ")}`, true);
    if (location.hash.endsWith(id)) renderCrea(id, list, tab);
    return;
  }
}
let valKeys = null;
document.addEventListener("keydown", (e) => { if (view === "validation" && valKeys) valKeys(e); });
const autoGrow = (t) => { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight + 2, 320) + "px"; };



/* ================= Page d'un format (plongée) ================= */
const n0 = (x) => (x == null ? "—" : x >= 1e6 ? (x / 1e6).toFixed(1).replace(".", ",") + " M" : x >= 1e3 ? (x / 1e3).toFixed(1).replace(".", ",") + " k" : String(x));
async function renderFormat() {
  const id = params[0], sub = params[1] || "fiche";
  let f; try { f = await api(`/format/${encodeURIComponent(id)}`); } catch (e) { $("#main").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const st = f.stats, fm = f.fm;
  const tabs = [["fiche", "Fiche du format"], ["gabarits", `Gabarits (${f.cells.filter((c) => c.exists).length})`], ["creas", `Créas (${st.total})`], ["sources", `Sources de veille (${f.sources.length})`]];
  const head = `<div class="page-head"><div><a class="back-link small" href="#formats">← Formats</a>
      <h1>${esc(fshort(id))} <span class="faint" style="font-weight:400">· ${esc(fm.name || "")}</span></h1>
      <p class="sub">${esc(fm.title || "")}</p>
      <div class="row small" style="margin-top:6px">${fm.status ? `<span class="chip ${fm.status === "validé" ? "chip-ok" : "chip-quiet"}">${esc(fm.status)}${fm.validated_on ? " le " + esc(fm.validated_on) : ""}</span>` : ""}${listOf(fm.renditions).map((r) => `<span class="chip chip-quiet">${esc(r)}</span>`).join("")}${listOf(fm.tools).map((t) => `<code class="faint">${esc(t)}</code>`).join(" ")}${fm.history ? `<span class="faint">· ${esc(fm.history)}</span>` : ""}</div></div>
    <span class="faint small"><code>${esc(f.file)}</code></span></div>
  <div class="kpis">
    <div class="kpi"><span class="num">${st.total}</span><span class="lbl">créas au total</span></div>
    <div class="kpi"><span class="num ${st.validated ? "" : "faint"}">${st.validated}</span><span class="lbl">validées, prêtes</span></div>
    <div class="kpi"><span class="num ${st.frozen ? "low" : "faint"}">${st.frozen}</span><span class="lbl">gelées</span></div>
    <div class="kpi"><span class="num ${st.published ? "" : "faint"}">${st.published}</span><span class="lbl">publiées (${st.sent} brouillon${st.sent > 1 ? "s" : ""} en plus)</span></div>
    <div class="kpi"><span class="num ${st.median_views_d3 ? "" : "faint"}">${n0(st.median_views_d3)}</span><span class="lbl">vues médianes à J+3${st.measured ? ` (${st.measured} mesurée${st.measured > 1 ? "s" : ""})` : ""}</span></div>
    <div class="kpi"><span class="num ${st.best_views_d3 ? "" : "faint"}">${n0(st.best_views_d3)}</span><span class="lbl">meilleure à J+3</span></div>
  </div>
  <nav class="subtabs" style="margin-bottom:14px">${tabs.map(([k, l]) => `<a href="#format/${id}/${k}" class="${k === sub ? "active" : ""}">${l}</a>`).join("")}</nav>`;
  let body = "";
  if (sub === "fiche") body = `<div class="panel"><div class="panel-body md fmt-doc">${md(f.body)}</div></div>`;
  else if (sub === "gabarits") body = `<div class="panel" style="overflow-x:auto"><table class="grid gmatrix"><thead><tr><th>Rendu</th>${f.accounts.map((a) => `<th>${esc(a.handle)}<div class="faint small" style="font-weight:400">${esc(a.slug)}</div></th>`).join("")}</tr></thead><tbody>${f.rendus.map((r) => `<tr><th class="rh">${esc(r.label)}</th>${f.accounts.map((a) => { const c = f.cells.find((x) => x.id === `${r.key}.${a.slug}`); return !c?.exists ? `<td class="gc empty-cell"><span class="faint small">—</span></td>` : `<td class="gc ${c.status === "pilotes en revue" || c.status === "évolution proposée" ? "hot" : ""}"><a href="#gabarit/${c.id}">${gChip(c.status, c.version)}<span class="gm">${c.creas} créa${c.creas > 1 ? "s" : ""}${c.frozen ? ` · ❄ ${c.frozen}` : ""}${c.validated ? ` · ✓ ${c.validated}` : ""}</span></a></td>`; }).join("")}</tr>`).join("")}</tbody></table></div>
    <p class="faint small" style="margin-top:8px">Un gabarit = ce format × un rendu × un compte, avec sa fiche technique. Les cases vides se créent depuis l'onglet Formats.</p>`;
  else if (sub === "creas") {
    const sort = params[2] || "compte";
    const rows = [...f.creas].sort((a, b) => sort === "vues" ? (b.d3?.views ?? -1) - (a.d3?.views ?? -1) : String(a.account).localeCompare(String(b.account)) || a.id.localeCompare(b.id));
    body = `<div class="row" style="margin-bottom:10px"><span class="faint small">Trier par</span><a class="btn btn-sm ${sort === "compte" ? "btn-primary" : ""}" href="#format/${id}/creas/compte">compte</a><a class="btn btn-sm ${sort === "vues" ? "btn-primary" : ""}" href="#format/${id}/creas/vues">vues à J+3</a></div>
    <div class="panel" style="overflow-x:auto"><table class="grid fmt-creas"><thead><tr><th></th><th>Créa</th><th>Compte</th><th>Rendu</th><th>État</th><th>Gabarit</th><th class="r">Vues J+3</th><th class="r">Likes</th><th class="r">Partages</th><th class="r">Vues J+7</th></tr></thead><tbody>
      ${rows.map((e) => `<tr data-href="#validation/-/${e.id}"><td>${thumb(e.media)}</td><td><div class="acc-cell"><span class="handle" style="font-size:12.5px">${e.id}</span><span class="meta" title="${esc(e.hook || "")}">${esc((e.hook || e.title || "").slice(0, 70))}</span></div></td><td class="small">${esc(handleOf(e.account))}</td><td class="small">${esc(e.rendition || "")}</td><td>${chipVal(e)}</td><td class="small">${e.crea_gabarit_version ? `v${esc(e.crea_gabarit_version)}` : '<span class="faint">hors fiche</span>'}</td><td class="r num-cell">${n0(e.d3?.views)}</td><td class="r">${n0(e.d3?.likes)}</td><td class="r">${n0(e.d3?.shares)}</td><td class="r">${n0(e.d7?.views)}</td></tr>`).join("")}</tbody></table></div>`;
  } else body = f.sources.length ? `<div class="src-grid">${f.sources.map((v) => `<div class="src-card">${v.thumb ? `<img src="${v.thumb}" alt="" loading="lazy">` : `<span class="thumb ph">${icon("film")}</span>`}<div class="sb"><div class="sa">@${esc(v.author || "?")} ${v.type ? `<span class="chip chip-quiet">${esc(v.type)}</span>` : ""}</div>
      <div class="sn"><span><b>${n0(v.views)}</b> vues</span><span><b>${n0(v.shares)}</b> partages</span><span><b>${n0(v.likes)}</b> likes</span>${v.outlier ? `<span title="vues ÷ médiane du compte"><b>×${Math.round(v.outlier)}</b> outlier</span>` : ""}</div>
      ${v.decision ? `<div class="sd">${esc(v.decision)}</div>` : ""}
      <div class="row">${v.url ? `<a class="btn btn-sm" href="${esc(v.url)}" target="_blank" rel="noopener">${icon("external")} Voir sur TikTok</a>` : ""}${v.file ? `<code class="faint small">${esc(v.file)}</code>` : `<span class="faint small">${esc(v.key)} (fiche de veille absente)</span>`}</div></div></div>`).join("")}</div>` : '<div class="empty">Aucune source listée dans la fiche du format.</div>';
  $("#main").innerHTML = head + body;
  $("#main").querySelectorAll("tr[data-href]").forEach((tr) => tr.addEventListener("click", () => { location.hash = tr.dataset.href; }));
}
const listOf = (v) => String(v || "").replace(/^\[|\]$/g, "").split(",").map((x) => x.trim()).filter(Boolean);

/* ================= Formats (gabarits) ================= */
const GSTATUS = { "à prototyper": ["chip-quiet", "à prototyper"], "pilotes en revue": ["chip-warn", "pilotes à juger"], "à retoucher": ["chip-info", "à retoucher"], "validé": ["chip-ok", "validé"], "évolution proposée": ["chip-warn", "évolution à juger"], "non pertinent": ["chip-quiet", "non pertinent"] };
const gChip = (st, v) => { const [c, l] = GSTATUS[st] || ["chip-quiet", st || "—"]; return `<span class="chip ${c}">${esc(l)}${v ? ` · v${v}` : ""}</span>`; };
async function renderFormats() {
  let m; try { m = await api("/gabarits"); } catch (e) { $("#main").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const toJudge = m.cells.filter((c) => c.status === "pilotes en revue" || c.status === "évolution proposée");
  const valid = m.cells.filter((c) => c.status === "validé").length, active = m.cells.filter((c) => c.exists && c.status !== "non pertinent").length;
  const cell = (c) => !c.exists
    ? `<td class="gc empty-cell"><button class="btn btn-sm gc-add" data-create="${c.id}" title="Créer ce gabarit (l'agent rédigera la fiche et préparera 2 pilotes)">+ gabarit</button></td>`
    : `<td class="gc ${c.status === "pilotes en revue" || c.status === "évolution proposée" ? "hot" : ""} ${c.status === "non pertinent" ? "np" : ""}"><a href="#gabarit/${c.id}">${gChip(c.status, c.version)}<span class="gm">${c.creas ? `${c.creas} créa${c.creas > 1 ? "s" : ""}` : "aucune créa"}${c.frozen ? ` · ❄ ${c.frozen}` : ""}${c.validated ? ` · ✓ ${c.validated}` : ""}${c.comments_pending ? ` · 💬 ${c.comments_pending}` : ""}</span></a></td>`;
  $("#main").innerHTML = `<div class="page-head"><div><h1>Formats</h1>
      <p class="sub">Un <strong>gabarit</strong> = un format × un rendu × un compte, avec sa <strong>fiche technique</strong>. On le valide sur <strong>2 pilotes réels</strong> avant toute production ; les créas qui ne suivent pas une fiche validée sont <strong>gelées</strong>. ${valid}/${active} gabarit${active > 1 ? "s" : ""} validé${valid > 1 ? "s" : ""}${toJudge.length ? ` · <span class="chip chip-warn">${toJudge.length} à juger</span>` : ""}.</p></div>
    <a class="btn btn-sm" href="#formats" id="gab-help">Comment ça marche</a></div>
  <div class="fmt-cards">${(m.formats || []).map((f) => `<a class="fmt-card" href="#format/${f.id}"><span class="fid">${esc(f.id)}</span><span class="ft">${esc(f.title || f.name || "")}</span><span class="fm">${esc(f.status || "")}${f.validated_on ? ` le ${esc(f.validated_on)}` : ""} ${icon("chevron")}</span></a>`).join("")}</div>
  <div class="loop"><span>1. L'agent rédige la fiche + 2 pilotes</span>${icon("chevron")}<span>2. Tu juges fiche et pilotes (commentaires, retouches)</span>${icon("chevron")}<span>3. Gabarit validé : fiche v1 figée</span>${icon("chevron")}<span>4. Production + dégel des créas selon la fiche</span>${icon("chevron")}<span>5. Retours récurrents → évolution v2</span></div>
  <div class="panel" style="overflow-x:auto"><table class="grid gmatrix"><thead><tr><th>Format · rendu</th>${m.accounts.map((a) => `<th class="${a.paused ? "paused-col" : ""}">${esc(a.handle)}<div class="faint small" style="font-weight:400">${esc(a.slug)}${a.paused ? " · en pause" : ""}</div></th>`).join("")}</tr></thead>
    <tbody>${m.rendus.map((r) => `<tr><th class="rh"><a href="#format/${r.format}" title="Tout sur ${r.format} : fiche, gabarits, créas, stats, sources">${esc(r.label)} ${icon("chevron")}</a></th>${m.accounts.map((a) => cell(m.cells.find((c) => c.id === `${r.key}.${a.slug}`))).join("")}</tr>`).join("")}</tbody></table></div>
  ${toJudge.length ? `<h2 style="margin:22px 0 10px">À juger</h2><div class="acc-cards">${toJudge.map((c) => `<a class="acc-card" href="#gabarit/${c.id}"><div class="ac-head"><div><div class="handle">${esc(c.id)}</div><div class="meta">${c.pilots.length} pilote${c.pilots.length > 1 ? "s" : ""} · ${c.creas} créa${c.creas > 1 ? "s" : ""} en attente</div></div>${gChip(c.status, c.version)}</div></a>`).join("")}</div>` : ""}`;
  $("#main").querySelectorAll("[data-create]").forEach((b) => b.addEventListener("click", async () => { b.setAttribute("aria-busy", "1"); try { await post(`/gabarits/${b.dataset.create}/create`); toast(`${b.dataset.create} créé : l'agent rédigera la fiche et préparera 2 pilotes`); renderFormats(); } catch (e) { toast(e.message, true); b.removeAttribute("aria-busy"); } }));
  $("#gab-help").addEventListener("click", (e) => { e.preventDefault(); toast("Détail : 03_LIBRARY/gabarits/README.md (définitions, statuts, règles de gel)"); });
}

async function renderGabarit() {
  const id = params[0];
  let g; try { g = await api(`/gabarit/${encodeURIComponent(id)}`); } catch (e) { $("#main").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const [k, acc] = id.split(".");
  // fiche sans les sections gérées à part (retours, historique restent visibles dans la fiche)
  const fiche = g.body.replace(/\n## Retours de validation[\s\S]*$/, "");
  const pilotHtml = (p) => p.missing ? `<div class="pilot missing">${esc(p.id)} introuvable</div>` : `<div class="pilot">
      ${p.media?.exists ? (p.media.type === "PHOTO" ? `<div class="media-strip">${p.media.slides.map((u, i) => `<a class="n" href="${u}" data-zoom="${u}"><img src="${u}" alt="slide ${i + 1}" loading="lazy"><span>${i + 1}/${p.media.count}</span></a>`).join("")}</div>` : `<div class="media-video big"><video src="${p.media.url}" controls playsinline preload="metadata"></video></div>`) : `<div class="media-missing">${p.status === "todo" ? "En cours de rendu (VPS, dans l'heure)" : "Média introuvable"}</div>`}
      <div class="pl-foot"><div><span class="id">${p.id}</span> ${esc(p.hook || p.title || "")}</div><a class="btn btn-sm" href="#validation/-/${p.id}">Textes et détails ${icon("chevron")}</a></div></div>`;
  const canJudge = ["pilotes en revue", "évolution proposée", "à retoucher"].includes(g.status);
  $("#main").innerHTML = `<div class="page-head"><div><a class="back-link small" href="#formats">← Formats</a> <a class="back-link small" href="#format/${esc(g.fm.format || "")}">· ${esc(g.fm.format || "")}</a><h1>${esc(k)} <span class="faint" style="font-weight:400">· ${esc(acc)}</span></h1>
      <p class="sub">${gChip(g.status, g.version)} ${g.validated_at ? `validé le ${fmtDate(g.validated_at)} · ` : ""}<code>${esc(g.file)}</code>${g.learnings_file ? ` · learnings : <code>${esc(g.learnings_file)}</code>` : ""}</p></div></div>
  ${g.status === "à prototyper" ? `<div class="callout info" style="margin:0 0 16px">✎<div><b>En attente de l'agent</b>La routine <code>gabarits-quotidien</code> rédige la fiche v0 à partir du format, des learnings du compte et de tes commentaires, puis prépare 2 pilotes. Tu peux déjà écrire ce que tu attends dans les commentaires ci-dessous.</div></div>` : ""}
  ${g.status === "à retoucher" && g.validation_note ? `<div class="callout info" style="margin:0 0 16px">✎<div><b>Retouches demandées · en attente de l'agent</b><ul>${g.validation_note.split("\n").filter((l) => l.trim()).map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div></div>` : ""}
  ${g.evolution ? `<div class="callout warn" style="margin:0 0 16px">↻<div><b>Évolution proposée par l'agent</b><div class="md">${md(g.evolution)}</div></div></div>` : ""}
  <div class="gab-layout"><div class="stack" style="gap:16px">
    <div class="panel"><div class="panel-head"><h2>Pilotes ${g.pilots_data.length ? `<span class="faint" style="font-weight:400">${g.pilots_data.length}</span>` : ""}</h2><span class="faint small">des créas réelles qui appliquent la fiche : ce sont elles qu'on juge</span></div>
      ${g.pilots_data.length ? g.pilots_data.map(pilotHtml).join("") : `<div class="empty small">Pas encore de pilote.</div>`}</div>
    <div class="panel"><div class="panel-head"><h2>Retours sur le gabarit</h2><span class="faint small">règles de la fiche, pas une créa en particulier</span></div><div class="panel-body comments">
      ${g.comments.length ? `<ul class="c-list">${g.comments.map((c) => `<li class="c-${c.kind}"><span class="c-k">${{ keep: "👍 À garder", avoid: "👎 À éviter", note: "💬 Note" }[c.kind]}</span><span class="c-t">${esc(c.text)}</span><span class="c-m">${esc(c.at)}${c.done ? ` · ${icon("check")} intégré à la fiche` : " · en attente de l'agent"}</span></li>`).join("")}</ul>` : ""}
      <form class="c-form" id="g-comment"><div class="seg"><label><input type="radio" name="kind" value="keep"><span>👍 À garder</span></label><label><input type="radio" name="kind" value="avoid"><span>👎 À éviter</span></label><label><input type="radio" name="kind" value="note" checked><span>💬 Note</span></label></div>
        <textarea class="input" name="text" rows="2" placeholder="Ex. : sur ce compte le hook doit toujours être une situation POV · la photo doit montrer un groupe, jamais une personne seule"></textarea>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-primary btn-sm" type="submit">Ajouter</button></div></form></div></div>
    <div class="panel"><div class="panel-head"><h2>Créas de ce gabarit</h2><span class="faint small">${g.creas.length}</span></div><div class="hist">${g.creas.map((e) => `<a href="#validation/-/${e.id}" class="hrow">${thumb(e.media)}<span class="b"><span class="t"><span class="id">${e.id}</span>${esc(e.hook || e.title)}</span><span class="m">${e.crea_gabarit_version ? `fiche v${esc(e.crea_gabarit_version)}` : "hors fiche"}${e.frozen_reason ? " · " + esc(e.frozen_reason) : ""}</span></span>${chipVal(e)}</a>`).join("") || '<div class="empty small">Aucune.</div>'}</div></div>
  </div>
  <div class="stack" style="gap:16px">
    <div class="panel gab-sheet"><div class="panel-head"><h2>Fiche technique</h2>${gChip(g.status, g.version)}</div><div class="panel-body md">${md(fiche)}</div>
      <div class="decide" id="g-decide">
        <div class="refuse-box" hidden><label class="small faint">Changements à faire sur la fiche ou les pilotes, un par ligne : l'agent corrige la fiche d'abord, puis régénère les pilotes</label><textarea class="input" rows="3" id="g-note">${esc(g.validation_note || "")}</textarea></div>
        <div class="row" style="justify-content:flex-end;width:100%">
          ${g.status !== "non pertinent" ? `<button class="btn" data-g="non pertinent" title="Ce format n'a pas de sens sur ce compte">Non pertinent</button>` : `<button class="btn" data-g="à prototyper">Réactiver</button>`}
          ${g.status !== "à prototyper" && g.status !== "non pertinent" ? `<button class="btn btn-retouch" data-g="à retoucher">✎ ${g.status === "validé" ? "Demander une évolution" : "À retoucher"}</button>` : ""}
          ${canJudge ? `<button class="btn btn-ok" data-g="validé" ${g.status === "à retoucher" ? 'title="Des retouches sont demandées : valider quand même ?"' : ""}>${icon("check")} Valider le gabarit (v${g.status === "évolution proposée" || g.version ? g.version + 1 : 1})</button>` : ""}
        </div></div></div>
  </div></div>`;
  const cf = $("#g-comment");
  cf.addEventListener("submit", async (e) => { e.preventDefault(); if (!cf.text.value.trim()) return cf.text.focus(); try { await post(`/gabarits/${id}/comment`, { kind: cf.kind.value, text: cf.text.value }); toast("Retour ajouté : l'agent l'intègre à la fiche"); renderGabarit(); } catch (err) { toast(err.message, true); } });
  $("#main").querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", async () => {
    const dec = b.dataset.g, box = $("#g-decide .refuse-box"), note = $("#g-note");
    if (dec === "à retoucher" && box.hidden) { box.hidden = false; b.classList.add("armed"); b.textContent = "✎ Envoyer les retouches"; note.focus(); return; }
    if (dec === "validé" && !confirm(`Valider ${id} ? La fiche est figée en v${g.status === "évolution proposée" || g.version ? g.version + 1 : 1}, les pilotes passent à valider, et la production de ce gabarit est débloquée.`)) return;
    b.setAttribute("aria-busy", "1");
    try { const r = await post(`/gabarits/${id}/decision`, { decision: dec, note: note.value }); toast(dec === "validé" ? `${id} validé en v${r.version} : l'agent met à jour les créas gelées selon la fiche` : dec === "à retoucher" ? "Retouches envoyées à l'agent" : `${id} : ${dec}`); await loadState(); renderGabarit(); }
    catch (err) { toast(err.message, true); b.removeAttribute("aria-busy"); }
  }));
}

/* ================= Comptes (vue d'ensemble) ================= */
function renderComptes() {
  const A = state.accounts, dl = state.daily;
  const willSend = A.filter((a) => a.will_send);
  $("#main").innerHTML = `<div class="page-head"><div><h1>Comptes</h1>
      <p class="sub">${dl.enabled ? `Prochain envoi <strong>${esc(fmtSend(dl.next) || "—")}</strong> : ${willSend.length} compte${willSend.length > 1 ? "s" : ""} recevr${willSend.length > 1 ? "ont" : "a"} leur prochaine créa validée en brouillon.` : `<strong class="chip chip-bad">Envoi du soir désactivé</strong> (onglet Agent).`}${state.validation.pending ? ` <a href="#validation" class="chip chip-warn">${state.validation.pending} créa${state.validation.pending > 1 ? "s" : ""} à valider</a>` : ""}</p></div></div>
  <div class="acc-cards">${A.map(cardAccount).join("")}</div>`;
  $("#main").querySelectorAll(".switch").forEach((s) => s.addEventListener("click", onToggle));
}
function cardAccount(a) {
  const s = a.stock, off = a.paused || !a.connected;
  const until = a.will_send && s.ready_queue && state.daily.next ? new Date(new Date(state.daily.next).getTime() + (s.ready_queue - 1) * 864e5).toISOString() : null;
  const warn = !a.connected ? "compte non relié au fournisseur d'envoi" : a.paused ? "envoi en pause" : !s.ready_queue ? (s.awaiting_validation ? "plus rien de validé : valide des créas" : "plus de stock") : s.ready_queue <= 3 ? "stock bas" : null;
  return `<a class="acc-card ${off ? "off" : ""}" href="#compte/${a.slug}">
    <div class="ac-head"><div><div class="handle">${esc(a.handle)}</div><div class="meta">${esc(a.slug)} · ${esc(a.device || "—")}</div></div>${warn ? `<span class="chip ${!a.connected || a.paused || !s.ready_queue ? "chip-bad" : "chip-warn"}">${esc(warn)}</span>` : `<span class="chip chip-ok">${icon("check")} envoie</span>`}</div>
    <p class="role">${esc(a.role || "")}</p>
    <div class="ac-nums"><div><span class="num ${s.ready_queue ? "" : "zero"}">${s.ready_queue}</span><span class="lbl">validées en file</span></div><div><span class="num ${s.awaiting_validation ? "low" : "faint"}">${s.awaiting_validation}</span><span class="lbl">à valider</span></div><div><span class="num ${s.drafted ? "" : "faint"}">${s.drafted}</span><span class="lbl">à finaliser</span></div><div><span class="num ${s.published ? "" : "faint"}">${s.published}</span><span class="lbl">publiées</span></div></div>
    <div class="ac-next">${a.next && a.will_send ? `${thumb({ exists: true, type: a.next.type, cover: a.next.cover, url: a.next.cover })}<span class="t"><span class="m">${esc(fmtSend(state.daily.next) || "")}${until ? ` · stock jusqu'au ${esc(new Date(until).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }))}` : ""}</span><span class="h">${esc(a.next.hook || a.next.id)}</span></span>` : `<span class="faint small">${a.paused ? "Rien ne part tant que l'envoi est en pause." : !a.connected ? "Relier le compte au fournisseur d'envoi pour recevoir les brouillons." : "Aucune créa validée dans la file."}</span>`}</div>
    <div class="ac-sw" onclick="event.preventDefault();event.stopPropagation()">${sw(a.slug, "paused", !a.paused, a.paused ? "envoi arrêté" : "envoi actif", !a.connected)}${sw(a.slug, "production_paused", !a.production_paused, a.production_paused ? "création arrêtée" : "création active")}</div></a>`;
}
const sw = (slug, key, on, label, disabled = false) => `<div class="switch-row"><button class="switch" role="switch" aria-checked="${on}" data-slug="${slug}" data-key="${key}" ${disabled ? 'title="Compte non relié au fournisseur d\'envoi : rien ne part de toute façon"' : ""}></button><span class="lbl ${on ? "" : "off"}">${label}</span></div>`;
async function onToggle(e) {
  e.preventDefault(); e.stopPropagation();
  const b = e.currentTarget, on = b.getAttribute("aria-checked") === "true", key = b.dataset.key, slug = b.dataset.slug;
  b.setAttribute("aria-busy", "true");
  try {
    await post(`/accounts/${slug}`, { [key]: on });   // on = actuellement actif → on arrête (paused = true)
    toast(key === "paused" ? `${slug} : envoi des brouillons ${on ? "arrêté, rien ne partira pour ce compte" : "réactivé"}` : `${slug} : création ${on ? "arrêtée, l'agent ne produit plus pour ce compte" : "réactivée"}`);
    await loadState(); route();
  } catch (err) { toast(err.message, true); b.removeAttribute("aria-busy"); }
}

/* ================= Page compte ================= */
async function renderCompte() {
  const slug = params[0];
  if (!state.accounts.some((a) => a.slug === slug)) { location.hash = "#comptes"; return; }
  let d; try { d = await api(`/account/${encodeURIComponent(slug)}`); } catch (e) { $("#main").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const a = d.account, s = a.stock, set = d.settings;
  const rows = d.queue.rows, movable = rows.filter((r) => r.movable), fixed = rows.filter((r) => !r.movable && !r.exp_data);
  const sendable = movable.filter((r) => r.send_at);
  const lastSend = sendable.at(-1)?.send_at;
  const why = (r) => { const e = r.exp_data; const v = valState(e); return r.wrong_account ? "fiche d'un autre compte" : v === "pending" ? "à valider, sautée" : v === "refused" ? "refusée, sautée" : v === "retouch" ? "à retoucher, sautée" : v === "frozen" ? "gelée (gabarit en cours)" : v === "pilot" ? "pilote du gabarit" : v === "todo" ? "en production, sautée" : d.blocked ? d.blocked : ""; };
  const rowHtml = (r, i) => { const e = r.exp_data; return `<div class="q-row s-row ${r.send_at ? "" : "skip"}" data-exp="${e.id}">
      <button class="grip" type="button" aria-label="Déplacer ${e.id} (flèches haut / bas)" title="Glisser pour déplacer · flèches ↑ ↓ au clavier"><svg><use href="#i-grip"/></svg></button>
      <span class="ord">${i + 1}</span>${thumb(e.media)}
      <a class="body" href="#validation/-/${e.id}"><div><span class="id">${e.id}</span><span class="hook" title="${esc(e.hook || "")}">${esc(e.hook || e.title)}</span></div><div class="meta"><span class="chip chip-quiet">${esc(r.concept || "")}</span> ${esc(e.angle || "")}</div></a>
      <div class="q-right">${r.send_at ? `<span class="when">${icon("send")} ${esc(fmtSend(r.send_at))}</span>` : `<span class="when skip">${esc(why(r))}</span>`}${chipVal(e)}<button class="btn btn-icon btn-sm top-btn" data-top="${e.id}" title="Passer en tête (prochain envoi)">⤒</button></div></div>`; };
  const others = d.queue.others.filter((e) => e.status === "ready" || e.status === "todo");
  $("#main").innerHTML = `<div class="page-head"><div><a class="back-link small" href="#comptes">← Comptes</a><h1>${esc(set.handle)} <span class="faint" style="font-weight:400;font-size:15px">${esc(slug)}</span></h1>
      <p class="sub">${esc(set.role || "")}</p></div>
    <div class="row head-sw">${sw(slug, "paused", !a.paused, a.paused ? "envoi arrêté" : "envoi actif", !a.connected)}${sw(slug, "production_paused", !a.production_paused, a.production_paused ? "création arrêtée" : "création active")}</div></div>
  <div class="kpis">
    <div class="kpi"><span class="num ${s.ready_queue ? "" : "zero"}">${s.ready_queue}</span><span class="lbl">validées en file${lastSend ? `<br><span class="faint">stock jusqu'au ${esc(new Date(lastSend).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }))}</span>` : ""}</span></div>
    <a class="kpi" href="#validation/pending" data-accfilter="${slug}"><span class="num ${s.awaiting_validation ? "low" : "faint"}">${s.awaiting_validation}</span><span class="lbl">à valider →</span></a>
    <a class="kpi" href="#validation/retouch" data-accfilter="${slug}"><span class="num ${s.retouch ? "low" : "faint"}">${s.retouch}</span><span class="lbl">à retoucher →</span></a>
    <a class="kpi" href="#validation/refused" data-accfilter="${slug}"><span class="num ${s.refused ? "zero" : "faint"}">${s.refused}</span><span class="lbl">refusées →</span></a>
    <div class="kpi"><span class="num ${s.drafted ? "" : "faint"}">${s.drafted}</span><span class="lbl">à finaliser dans l'app</span></div>
    <div class="kpi"><span class="num ${s.published ? "" : "faint"}">${s.published}</span><span class="lbl">publiées</span></div>
  </div>
  <div class="acc-layout"><div class="stack" style="gap:16px">
    <div class="panel"><div class="panel-head"><div><h2>File d'envoi</h2><p class="faint small">Une créa par soir, dans cet ordre, parmi les créas <strong>validées</strong>. Glisse une ligne pour la déplacer.</p></div>
      <div class="row">${d.queue.repeats?.length ? `<span class="chip chip-warn" title="${esc(d.queue.repeats.join(", "))}">${d.queue.repeats.length} même format à la suite</span>` : ""}<button class="btn btn-sm" id="q-interleave" title="Réordonne pour ne jamais envoyer deux fois le même format d'affilée">${icon("refresh")} Alterner les concepts</button></div></div>
      ${d.blocked ? `<div class="callout bad" style="margin:12px 16px 0">${icon("pause")}<div><b>Rien ne part pour ce compte</b>${esc(d.blocked)}</div></div>` : ""}
      ${movable.length ? `<div class="q-rows" id="sortable">${movable.map(rowHtml).join("")}</div>` : `<div class="empty"><strong>File vide</strong>Aucune créa en attente dans <code>06_CALENDAR/QUEUE.md</code> pour ce compte.</div>`}
      ${fixed.length ? `<div class="q-sect">Lignes sans fiche EXP (non envoyées)</div>${fixed.map((r) => `<div class="q-row static"><span></span><span class="ord">${esc(r.order)}</span><span class="thumb ph">${icon("alert")}</span><div class="body"><span class="hook faint">${esc(r.exp_raw)} ${esc(r.file || "")}</span><div class="meta">${esc(r.status)}</div></div><span></span></div>`).join("")}` : ""}
      ${others.length ? `<div class="q-sect">Créas du compte hors file (${others.length}) : elles ne partiront pas tant qu'elles n'y sont pas</div>${others.map((e) => `<div class="q-row static"><span></span><span class="ord">—</span>${thumb(e.media)}<a class="body" href="#validation/-/${e.id}"><div><span class="id">${e.id}</span><span class="hook">${esc(e.hook || e.title)}</span></div><div class="meta">${esc(e.concept || "")} ${esc(e.angle || "")}</div></a><div class="q-right">${chipVal(e)}<button class="btn btn-sm" data-add="${e.id}">+ Ajouter à la file</button></div></div>`).join("")}` : ""}
    </div></div>
  <div class="stack" style="gap:16px">
    <div class="panel"><div class="panel-head"><h2>Ce soir</h2>${d.tonight ? `<span class="chip ${d.tonight.status === "sent" ? "chip-ok" : d.tonight.status === "planned" ? "chip-info" : "chip-bad"}">${esc({ sent: "envoyé", planned: "prévu", no_stock: "rien de validé", error: "erreur", failed: "échec" }[d.tonight.status] || d.tonight.status)}</span>` : ""}</div>
      <div class="panel-body small">${d.tonight?.exp ? `<a href="#validation/-/${d.tonight.exp}"><b>${d.tonight.exp}</b></a> ${esc(d.tonight.hook || "")}` : d.tonight?.status === "no_stock" ? `Aucune créa validée à envoyer${d.tonight.awaiting_validation?.length ? ` (${d.tonight.awaiting_validation.length} en attente de validation)` : ""}.` : d.blocked ? esc(d.blocked) : `Plan calculé à ${esc(hm(state.daily))}.`}${d.tonight?.error ? `<div style="color:var(--red);margin-top:4px">${esc(d.tonight.error)}</div>` : ""}</div></div>
    <div class="panel"><div class="panel-head"><h2>Réglages du compte</h2></div><form class="panel-body stack" id="acc-form" style="gap:10px">
      <dl class="kv"><dt>Appareil</dt><dd>${esc(set.device || "—")}</dd><dt>ICP</dt><dd>${esc(set.icp || "—")}</dd><dt>DA</dt><dd>${esc(set.da || "—")}</dd>
        <dt>Envoi</dt><dd>${a.connected ? `${icon("check")} relié (${esc(a.backend || "")}${a.connected_at ? ", " + esc(a.connected_at) : ""})` : '<span style="color:var(--red)">non relié</span>'}</dd></dl>
      <label class="stack"><span class="small faint">Description fixe des carrousels (envoyée avec chaque brouillon)</span><textarea class="input" name="carousel_description" rows="2" maxlength="150">${esc(set.carousel_description)}</textarea></label>
      <label class="stack"><span class="small faint">Note (lue par l'agent)</span><textarea class="input" name="note" rows="3">${esc(set.note)}</textarea></label>
      <div class="row"><button class="btn btn-primary" type="submit">Enregistrer</button></div></form></div>
    <div class="panel"><div class="panel-head"><div><h2>Learnings du compte</h2><p class="faint small">${d.learnings.updated ? `Synthèse du ${esc(d.learnings.updated)}` : "Pas encore de synthèse"} · <code>${esc(d.learnings.file)}</code></p></div>${d.feedback_pending ? `<span class="chip chip-warn" title="Commentaires pas encore intégrés : synthèse par l'agent chaque matin">${d.feedback_pending} à synthétiser</span>` : ""}</div>
      <div class="panel-body md learn">${d.learnings.md ? md(d.learnings.md) : `<p class="faint small">Commente les créas dans l'onglet Validation : chaque matin, l'agent regroupe tes retours de ce compte en règles « à reproduire » et « à éviter », que la production relit avant d'écrire.</p>`}</div></div>
    <div class="panel"><div class="panel-head"><h2>Historique</h2><span class="faint small">${d.history.length}</span></div><div class="hist">${d.history.length ? d.history.slice(0, 30).map((e) => `<a href="#validation/-/${e.id}" class="hrow">${thumb(e.media)}<span class="b"><span class="t"><span class="id">${e.id}</span>${esc(e.hook || e.title)}</span><span class="m">${e.published_at ? "publiée " + esc(e.published_at) : "envoyée " + fmtDate(e.draft_sent_at)}</span></span>${chipVal(e)}</a>`).join("") : '<div class="empty small">Rien d\'envoyé pour l\'instant.</div>'}</div></div>
  </div></div>`;
  $("#main").querySelectorAll(".switch").forEach((b) => b.addEventListener("click", onToggle));
  $("#main").querySelectorAll("[data-accfilter]").forEach((l) => l.addEventListener("click", () => { try { localStorage.setItem("val-acc", l.dataset.accfilter); } catch { } }));
  $("#acc-form").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.currentTarget, b = f.querySelector("button"); b.setAttribute("aria-busy", "true");
    try { await post(`/accounts/${slug}`, { carousel_description: f.carousel_description.value, note: f.note.value }); toast("Réglages enregistrés"); await loadState(); }
    catch (err) { toast(err.message, true); } b.removeAttribute("aria-busy");
  });
  const commit = async (order) => { try { await post("/queue/order", { account: slug, order }); toast("Nouvel ordre enregistré"); await afterQueueChange(slug); } catch (e) { toast(e.message, true); renderCompte(); } };
  if ($("#sortable")) sortable($("#sortable"), commit);
  $("#main").querySelectorAll("[data-top]").forEach((b) => b.addEventListener("click", async () => {
    b.setAttribute("aria-busy", "1");
    try { const r = await post("/queue/move", { account: slug, exp: b.dataset.top, to: "top" }); toast(r.changed ? `${b.dataset.top} passe en tête` : "Déjà en tête"); await afterQueueChange(slug); } catch (e) { toast(e.message, true); b.removeAttribute("aria-busy"); }
  }));
  $("#main").querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", async () => {
    b.setAttribute("aria-busy", "1");
    try { const r = await post("/queue/add", { account: slug, exp: b.dataset.add }); toast(`${b.dataset.add} ajoutée en fin de file (n° ${r.order})`); await afterQueueChange(slug); } catch (e) { toast(e.message, true); b.removeAttribute("aria-busy"); }
  }));
  $("#q-interleave")?.addEventListener("click", async (ev) => {
    const b = ev.currentTarget; b.setAttribute("aria-busy", "1");
    try { const r = await post("/queue/interleave", { account: slug }); toast(r.changed ? `${r.moved} ligne(s) replacée(s) : les formats alternent` : "Les formats alternent déjà"); if (r.changed) await afterQueueChange(slug); else b.removeAttribute("aria-busy"); }
    catch (e) { toast(e.message, true); b.removeAttribute("aria-busy"); }
  });
}
// Après un changement d'ordre : recharger, réafficher, recalculer le plan du soir (sauf si ce compte a déjà reçu son brouillon)
async function afterQueueChange(slug) {
  await loadState();
  const tonight = state.accounts.find((a) => a.slug === slug)?.tonight;
  await renderCompte();
  if (tonight?.status === "sent") return toast("Le brouillon de ce compte est déjà parti aujourd'hui : le nouvel ordre vaut pour demain");
  try { await post("/run", { script: "daily-plan" }); } catch (e) { toast(`Ordre enregistré ; plan du soir à recalculer (${e.message})`, true); }
}

// Glisser-déposer à la souris ou au doigt (pointer events) + flèches haut / bas au clavier sur la poignée
function sortable(list, onChange) {
  const order = () => [...list.querySelectorAll(".s-row")].map((r) => r.dataset.exp);
  const renumber = () => list.querySelectorAll(".s-row .ord").forEach((o, i) => { o.textContent = i + 1; });
  let kbTimer = null;
  list.querySelectorAll(".grip").forEach((g) => {
    g.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const row = g.closest(".s-row"), sib = e.key === "ArrowUp" ? row.previousElementSibling : row.nextElementSibling;
      if (!sib?.classList.contains("s-row")) return;
      e.key === "ArrowUp" ? sib.before(row) : sib.after(row); g.focus(); renumber();
      clearTimeout(kbTimer); kbTimer = setTimeout(() => onChange(order()), 900);   // on attend la fin des appuis
    });
    g.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const row = g.closest(".s-row"), before = order().join();
      const r0 = row.getBoundingClientRect(), dy0 = e.clientY - r0.top;
      const ph = document.createElement("div"); ph.className = "s-ph"; ph.style.height = r0.height + "px";
      row.before(ph);
      Object.assign(row.style, { position: "fixed", left: r0.left + "px", top: r0.top + "px", width: r0.width + "px", zIndex: 40 });
      row.classList.add("dragging"); document.body.classList.add("is-dragging");
      try { g.setPointerCapture(e.pointerId); } catch { }
      let raf = null, lastY = e.clientY;
      const scroll = () => { const edge = 70, v = lastY < edge ? -(edge - lastY) / 4 : lastY > innerHeight - edge ? (lastY - innerHeight + edge) / 4 : 0; if (v) { scrollBy(0, v); place(); } raf = requestAnimationFrame(scroll); };
      const place = () => {
        row.style.top = lastY - dy0 + "px";
        const sibs = [...list.querySelectorAll(".s-row:not(.dragging)")];
        const target = sibs.find((s) => { const b = s.getBoundingClientRect(); return lastY < b.top + b.height / 2; });
        if (target) { if (target.previousElementSibling !== ph) target.before(ph); } else if (sibs.length && sibs.at(-1).nextElementSibling !== ph) sibs.at(-1).after(ph);
      };
      const move = (ev) => { lastY = ev.clientY; place(); };
      const up = () => {
        cancelAnimationFrame(raf); g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up);
        ph.replaceWith(row); row.removeAttribute("style"); row.classList.remove("dragging"); document.body.classList.remove("is-dragging"); renumber();
        const after = order(); if (after.join() !== before) onChange(after);
      };
      g.addEventListener("pointermove", move); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
      raf = requestAnimationFrame(scroll);
    });
  });
}

/* ================= Agent ================= */
let agentTimer = null;
async function renderAgent() {
  clearTimeout(agentTimer);
  let d; try { d = await api("/agent"); } catch (e) { $("#main").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const dl = d.daily, plan = d.plan.plan, S = state.scripts, running = d.runs.filter((r) => r.running);
  const pad = (n) => String(n).padStart(2, "0");
  const nextTxt = !dl.enabled ? "désactivé : rien ne part tant qu'il n'est pas réactivé" : dl.ran_today && new Date(dl.next).toDateString() !== new Date().toDateString() ? `parti aujourd'hui · prochain départ ${fmtSend(dl.next)}` : `prochain départ ${fmtSend(dl.next)}`;
  const unitState = (u) => {
    const st = u.status || {};
    if (st.installed === true) return `<span class="chip ${st.state && st.state !== "active" && st.state !== "running" ? "chip-warn" : "chip-ok"}">${esc(st.state || "installé")}</span>${st.last_exit != null && String(st.last_exit) !== "0" ? ` <span class="chip chip-bad" title="dernier code de sortie">code ${esc(String(st.last_exit))}</span>` : ""}${st.last_run ? `<div class="faint small">dernier : ${esc(st.last_run)}</div>` : ""}`;
    if (st.installed === false && d.platform === "linux") return `<span class="chip chip-bad">non installé</span><div class="faint small">sudo bash deploy/install.sh</div>`;
    return `<span class="chip chip-quiet" title="Les timers tournent sur le VPS ; leur état s'affiche quand ce tableau de bord y tourne">sur le VPS</span>`;
  };
  const runBtn = (k, cls = "") => { const s = S[k]; if (!s) return ""; const busy = running.find((r) => r.script === k); return `<button class="run-btn ${cls}" data-script="${k}" ${busy ? "disabled" : ""}><span class="l">${esc(s.label)}${s.confirm ? '<span class="chip chip-bad">envoie</span>' : ""}${busy ? '<span class="chip chip-warn">en cours…</span>' : ""}</span><span class="d">${esc(s.desc)}</span>${runGo(k, s, busy)}</button>`; };
  const planItem = (it) => `<div class="pl"><span class="h">${esc(it.handle)}</span>${it.exp ? `<a href="#validation/-/${it.exp}" class="id">${it.exp}</a>` : `<span class="faint">—</span>`}<span class="chip ${it.status === "sent" ? "chip-ok" : it.status === "planned" ? "chip-info" : "chip-bad"}">${esc({ sent: "envoyé", planned: "prévu", no_stock: "rien de validé", error: "erreur", failed: "échec" }[it.status] || it.status)}</span></div>`;
  $("#main").innerHTML = `<div class="page-head"><div><h1>Agent</h1><p class="sub">Ce qui tourne tout seul : quand, comment, et où ça en est. L'heure d'envoi des créas se règle ici.</p></div></div>
  <div class="agent-layout"><div class="stack" style="gap:16px">
    <div class="panel send-card"><div class="panel-head"><div><h2>Envoi du soir</h2><p class="faint small">Chaque compte relié et actif reçoit en brouillon TikTok sa prochaine créa <strong>validée</strong>, puis le message de consignes part (${esc(d.notify_channel)}).</p></div>${d.dry_run ? '<span class="chip chip-warn">dry-run</span>' : ""}</div>
      <form class="panel-body send-form" id="sched-form">
        <div class="clock"><select class="input" name="hour" aria-label="Heure">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === dl.hour ? "selected" : ""}>${pad(h)}</option>`).join("")}</select><span>:</span><select class="input" name="minute" aria-label="Minutes">${Array.from({ length: 12 }, (_, i) => i * 5).map((m) => `<option value="${m}" ${m === dl.minute ? "selected" : ""}>${pad(m)}</option>`).join("")}</select></div>
        <div class="stack" style="gap:8px"><div class="switch-row"><button type="button" class="switch" role="switch" aria-checked="${dl.enabled}" id="sched-enabled"></button><span class="lbl ${dl.enabled ? "" : "off"}">${dl.enabled ? "envoi automatique actif" : "envoi automatique coupé"}</span></div>
          <span class="muted small">${icon("clock")} ${esc(nextTxt)}</span>
          <span class="faint small">Tous les jours, heure de ${esc(d.timezone)}. Départ possible jusqu'à ${dl.window_min} min après l'heure, jamais de rattrapage la nuit. ${d.platform === "linux" ? "Prise en compte au prochain passage du timer (≤ 5 min)." : "Sur le VPS, la nouvelle heure arrive par la synchro git (≤ 10 min)."}</span></div>
        <button class="btn btn-primary" type="submit" id="sched-save" hidden>Enregistrer</button></form>
      <div class="plan-mini"><div class="q-sect">${plan ? `Plan du ${esc(fmtDay(plan.date))}, mis à jour ${esc(fmtDate(plan.updated_at || plan.created_at))}` : "Pas encore de plan aujourd'hui : il est calculé au moment de l'envoi"}</div>${plan?.items?.length ? plan.items.map(planItem).join("") : ""}</div>
      <div class="run-list two">${runBtn("daily-plan")}${runBtn("daily-drafts-dry")}${runBtn("daily-notify")}${runBtn("daily-drafts")}</div>
      <div class="panel-body"><a href="#soir" class="btn btn-sm">${icon("terminal")} Journal et détail du soir</a></div></div>

    <div class="panel"><div class="panel-head"><div><h2>Tâches planifiées</h2><p class="faint small">Timers systemd du VPS (<code>deploy/systemd/</code>) : scripts déterministes, sans modèle, sous un verrou commun.</p></div></div>
      <div class="units">${d.units.map((u) => `<div class="unit"><div class="u-what"><div class="u-name">${esc(u.description)}</div><code class="faint">${esc(u.name)}</code></div>
        <div class="u-when">${u.editable ? `<span class="chip chip-quiet">${icon("clock")} ${esc(u.when)}</span><button type="button" class="btn btn-sm" data-edit-time style="margin-top:6px">${icon("clock")} Changer l'heure</button>` : `<span class="chip chip-quiet">${icon("clock")} ${esc(u.when)}</span>`}${u.persistent ? '<div class="faint small">rattrapé si le VPS était éteint</div>' : ""}</div>
        <div class="u-how">${u.exec.map((c) => `<code>${esc(c)}</code>`).join("")}${u.how ? `<details class="more"><summary>Détail</summary><p class="small muted">${esc(u.how)}</p></details>` : ""}</div>
        <div class="u-state">${unitState(u)}</div></div>`).join("")}</div></div>

    <div class="panel"><div class="panel-head"><div><h2>Agents éditoriaux</h2><p class="faint small">Routines Claude Code dans le cloud (<code>deploy/routines/</code>) : elles clonent le dépôt, écrivent specs, fiches et mémos, poussent. Ni vidéos, ni secrets, ni publication. Horaires modifiables dans claude.ai → Routines (<code>/schedule</code>).</p></div></div>
      <div class="units">${d.routines.map((r) => `<div class="unit routine"><div class="u-what"><div class="u-name">${esc(r.name)}</div><code class="faint">${esc(r.file)}</code></div>
        <div class="u-when"><span class="chip chip-quiet">${icon("clock")} ${esc((r.schedule || "—").replace(/\s*\(cron UTC[^)]*\)/, ""))}</span></div>
        <div class="u-how"><p class="small">${esc(r.description)}</p>${r.parameters ? `<p class="faint small">${esc(r.parameters)}</p>` : ""}</div>
        <div class="u-state"><span class="chip chip-info">${esc((r.model || "").split(" ")[0] || "modèle ?")}</span>${/retours|learnings/.test(r.name) ? `<span class="chip ${d.retouch_pending ? "chip-info" : "chip-quiet"}">${d.retouch_pending} retouche${d.retouch_pending > 1 ? "s" : ""} à faire</span><span class="chip ${d.feedback_pending ? "chip-warn" : "chip-quiet"}">${d.feedback_pending} retour${d.feedback_pending > 1 ? "s" : ""} à synthétiser</span>` : ""}</div></div>`).join("")}</div></div>
  </div>
  <div class="stack" style="gap:16px">
    <div class="panel"><div class="panel-head"><h2>Lancer à la main</h2></div><div class="run-list">${["daily-stats", "queue-order", "photos-inbox", "photos-inbox-apply", "doctor"].map((k) => runBtn(k)).join("")}</div></div>
    <div class="panel"><div class="panel-head"><h2>Dernières exécutions</h2><a class="btn btn-sm" href="#journal">Tout voir ${icon("chevron")}</a></div><div class="runs">${d.runs.length ? d.runs.map((r) => `<a href="#journal/${r.id}"><span class="l">${r.running ? '<span class="chip chip-warn">en cours</span>' : r.code === 0 ? '<span class="chip chip-ok">ok</span>' : `<span class="chip chip-bad">code ${r.code}</span>`}${esc(r.label)}</span><span class="d">${fmtDate(r.started_at)}</span>${icon("chevron", "chev")}</a>`).join("") : '<div class="empty small">Rien lancé depuis le démarrage du serveur.</div>'}</div></div>
  </div></div>`;
  const f = $("#sched-form"), en = $("#sched-enabled");
  const initial = `${dl.hour}:${dl.minute}:${dl.enabled}`;
  const cur = () => `${f.hour.value}:${f.minute.value}:${en.getAttribute("aria-checked")}`;
  const sync = () => { $("#sched-save").hidden = cur() === initial; };
  f.hour.addEventListener("change", sync); f.minute.addEventListener("change", sync);
  en.addEventListener("click", () => { const on = en.getAttribute("aria-checked") !== "true"; en.setAttribute("aria-checked", on); en.nextElementSibling.textContent = on ? "envoi automatique actif" : "envoi automatique coupé"; en.nextElementSibling.classList.toggle("off", !on); sync(); });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const enabled = en.getAttribute("aria-checked") === "true";
    if (!enabled && dl.enabled && !confirm("Couper l'envoi automatique ? Plus aucun brouillon ne partira, sur aucun compte, tant qu'il n'est pas réactivé.")) return;
    const b = $("#sched-save"); b.setAttribute("aria-busy", "true");
    try { const r = await post("/schedule/daily", { hour: Number(f.hour.value), minute: Number(f.minute.value), enabled }); toast(r.daily.daily_enabled ? `Envoi du soir réglé à ${pad(r.daily.daily_hour)}:${pad(r.daily.daily_minute)}` : "Envoi automatique coupé"); await loadState(); renderAgent(); }
    catch (err) { toast(err.message, true); b.removeAttribute("aria-busy"); }
  });
  $("#main").querySelectorAll(".run-btn").forEach((b) => b.addEventListener("click", () => runScript(b.dataset.script, () => renderAgent())));
  $("#main").querySelectorAll("[data-edit-time]").forEach((b) => b.addEventListener("click", () => { const sel = $("#sched-form select"); sel.closest(".panel").scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(() => sel.focus(), 350); }));
  if (running.length) agentTimer = setTimeout(() => { if (view === "agent") renderAgent(); }, 3000);
}

// Mini markdown : titres, gras, code, citations, listes numérotées, tableaux
function md(src) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const lines = String(src).split("\n"), out = []; let tbl = null, ol = null;
  const flush = () => { if (tbl) { out.push(`<table><thead><tr>${tbl.h.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${tbl.r.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`); tbl = null; } if (ol) { const t = ol.ul ? "ul" : "ol"; out.push(`<${t}>${ol.map((l) => `<li>${inline(l)}</li>`).join("")}</${t}>`); ol = null; } };
  let fence = null;
  for (const l of lines) {
    if (/^```/.test(l)) { if (fence) { flush(); out.push(`<pre class="code">${esc(fence.join("\n"))}</pre>`); fence = null; } else fence = []; continue; }
    if (fence) { fence.push(l); continue; }
    if (l.startsWith("|")) { const cells = l.split("|").slice(1, -1).map((c) => c.trim()); if (/^\|\s*-/.test(l)) continue; if (!tbl) tbl = { h: cells, r: [] }; else tbl.r.push(cells); continue; }
    if (/^\d+\.\s/.test(l)) { if (!ol) ol = []; ol.push(l.replace(/^\d+\.\s/, "")); continue; }
    if (/^\s*[-*]\s/.test(l)) { if (!ol) ol = []; ol.ul = true; ol.push(l.replace(/^\s*[-*]\s(\[[ x]\]\s)?/, "")); continue; }
    flush();
    if (/^#{1,6}\s/.test(l)) out.push(`<h4>${inline(l.replace(/^#+\s/, ""))}</h4>`);
    else if (l.startsWith("> ")) out.push(`<blockquote>${inline(l.slice(2))}</blockquote>`);
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  flush(); return out.join("");
}

/* ================= Ce soir ================= */
let soirTimer = null;
async function renderSoir() {
  clearTimeout(soirTimer);
  const date = params[0] || state.date;
  let d; try { d = await api(`/daily?date=${date}`); } catch (e) { $("#main").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const plan = d.plan, sc = d.schedule, running = state.runs.filter((r) => r.running);
  const S = state.scripts;
  const itemHtml = (it) => {
    const st = it.status === "sent" ? '<span class="chip chip-ok">envoyé</span>' : it.status === "planned" ? '<span class="chip chip-info">prévu</span>' : it.status === "failed" || it.status === "error" ? '<span class="chip chip-bad">échec</span>' : it.status === "no_stock" ? '<span class="chip chip-bad">plus de stock</span>' : `<span class="chip chip-quiet">${esc(it.status)}</span>`;
    const ia = it.in_app || {};
    const lines = it.status === "no_stock" ? `<div class="muted">Rien à envoyer : produire pour ce compte (${it.queue_rows} ligne${it.queue_rows > 1 ? "s" : ""} dans QUEUE.md, aucune prête).</div>`
      : it.status === "error" || it.status === "failed" ? `<div style="color:var(--red)">${esc(it.error || it.reason || "échec")}</div>`
      : `${ia.title_to_type ? `<div><b>Titre à taper</b>${esc(ia.title_to_type)}</div>` : ""}${ia.front_page_text ? `<div><b>Texte natif</b>${esc(ia.front_page_text)}</div>` : ""}${it.media_type === "VIDEO" && ia.caption ? `<div><b>Caption</b>${esc(ia.caption)}</div>` : ""}${ia.sheet?.length ? `<div><b>Bulles</b><ul>${ia.sheet.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>` : ""}${ia.sound ? `<div><b>Son</b>${esc(ia.sound)}</div>` : ""}`;
    return `<div class="plan-item"><div class="who"><div class="h">${esc(it.handle)}</div><div class="d">${esc(it.slug)}${it.device ? " · " + esc(it.device) : ""}</div><div style="margin-top:6px">${st}</div></div>
      <div class="what">${it.exp ? `<div class="t"><a class="id" href="#file/${it.slug}/${it.exp}">${it.exp}</a>${fmtChip(it.format, it.rendition)}<span class="faint small">${it.media_type === "PHOTO" ? `carrousel ${it.files} slides` : "vidéo"}${it.publish_id ? ` · ${esc(it.publish_id)}` : ""}${it.finished_at ? " · " + fmtDate(it.finished_at) : ""}</span></div>` : ""}<div class="lines">${lines}</div>${it.exp && it.status !== "no_stock" ? `<div class="faint small" style="margin-top:6px">Stock restant après : ${it.stock_after}${it.stock_after <= 3 ? " ⚠️ à réapprovisionner" : ""}${it.stock_next?.length ? " · suite : " + it.stock_next.join(", ") : ""}</div>` : ""}</div></div>`;
  };
  const runBtn = (k, cls = "") => { const s = S[k], busy = running.find((r) => r.script === k); return `<button class="run-btn ${cls}" data-script="${k}" ${busy ? "disabled" : ""}><span class="l">${esc(s.label)}${busy ? '<span class="chip chip-warn">en cours…</span>' : ""}</span><span class="d">${esc(s.desc)}</span>${runGo(k, s, busy)}</button>`; };
  $("#main").innerHTML = `<div class="page-head"><div><h1>Ce soir</h1><p class="sub">${plan ? `Plan du ${fmtDay(plan.date)} — établi ${fmtDate(plan.created_at)}${plan.updated_at && plan.updated_at !== plan.created_at ? ", mis à jour " + fmtDate(plan.updated_at) : ""}${plan.mode === "dry-run" ? ' · <span class="chip chip-warn">dry-run</span>' : ""}` : `Aucun plan pour le ${fmtDay(date)} : il sera calculé à ${String(sc.daily.hour ?? 18).padStart(2, "0")}:${String(sc.daily.minute ?? 0).padStart(2, "0")}, ou maintenant avec « Recalculer ».`}</p></div>
    <div class="row"><input class="input" type="date" id="soir-date" value="${esc(date)}" style="min-width:0"></div></div>
  <div class="soir-layout"><div class="stack" style="gap:16px">
    <div class="panel">${plan ? (plan.items.length ? plan.items.map(itemHtml).join("") : '<div class="empty"><strong>Plan vide</strong>Aucun compte actif.</div>') : '<div class="empty"><strong>Pas encore de plan</strong>Le plan liste, pour chaque compte relié au fournisseur d\'envoi et non arrêté, le prochain contenu prêt de sa file.</div>'}
      ${plan?.skipped?.length ? `<div class="q-note">Ignorés : ${plan.skipped.map((s) => `${esc(s.handle)} (${esc(s.reason)})`).join(" · ")}</div>` : ""}</div>
    <div class="panel"><div class="panel-head"><h2>Journal du ${esc(date)}</h2><span class="faint small"><code>${esc(d.log_file)}</code></span></div><pre class="log" id="soir-log">${esc(d.log || "")}</pre></div></div>
  <div class="stack" style="gap:16px">
    <div class="panel"><div class="panel-head"><h2>Lancer</h2></div><div class="run-list">${runBtn("daily-plan")}${runBtn("daily-drafts-dry")}${runBtn("daily-notify")}${runBtn("daily-drafts")}</div></div>
    <div class="panel"><div class="panel-head"><h2>Automatisation</h2></div><div class="panel-body"><dl class="sched">
      <dt>Envoi du soir</dt><dd>${schedLine(sc.daily, `tous les jours à ${hm(sc.daily)}`)}</dd>
      <dt>Relevé stats</dt><dd>${schedLine(sc.weekly, `${weekdayName(sc.weekly.weekday)} ${hm(sc.weekly)}`)}</dd>
      <dt>Message</dt><dd>${esc(sc.notify_channel)}${sc.notify_channel === "stdout" ? ' <span class="faint">(NOTIFY_CHANNEL dans .env : imessage | telegram)</span>' : ""}</dd>
      <dt>Comptes</dt><dd>${sc.daily_accounts ? esc(sc.daily_accounts) + ' <span class="faint">(DAILY_ACCOUNTS)</span>' : "tous les comptes reliés non arrêtés"}</dd>
      <dt>Claude CLI</dt><dd>${sc.claude_cli ? `${icon("check")} disponible` : '<span style="color:var(--red)">introuvable — l\'envoi ne peut pas tourner</span>'}</dd></dl>
      <p class="faint small" style="margin-top:10px">Pour arrêter l'envoi d'un compte : onglet Comptes, interrupteur « Envoi ». Pour tout couper : <code>${sc.daily.scheduler === "systemd" ? `sudo systemctl disable --now ${esc(sc.daily.label)}.timer` : sc.daily.scheduler === "launchd" ? `launchctl bootout gui/$(id -u)/${esc(sc.daily.label)}` : "désactiver le planificateur de cette machine"}</code>.</p></div></div></div></div>`;
  $("#soir-date").addEventListener("change", (e) => { location.hash = `soir/${e.target.value}`; });
  $("#main").querySelectorAll(".run-btn").forEach((b) => b.addEventListener("click", () => runScript(b.dataset.script, () => renderSoir())));
  if (running.length || plan?.items?.some((i) => i.status === "planned")) soirTimer = setTimeout(async () => { if (view !== "soir") return; await loadState(); renderSoir(); }, 5000);
}
async function runScript(script, after) {
  const s = state.scripts[script];
  if (s.confirm && !confirm(`${s.label} ?\n\n${s.desc}.\nUn brouillon partira dans l'app TikTok de chaque compte actif ayant du stock. Continuer ?`)) return;
  try { const r = await post("/run", { script }); toast(`${s.label} — lancé (${r.run.id})`); await loadState(); after?.(); }
  catch (e) { toast(e.message, true); }
}

/* ================= Assets ================= */
let assetsCache = null;
async function renderAssets() {
  const tab = params[0] || "inbox";
  $("#main").innerHTML = `<div class="page-head"><div><h1>Assets</h1><p class="sub">Photos, enregistrements d'écran et rushs partagés entre tous les comptes (<code>07_ASSETS/</code>). Dépose ici, l'agent trie et catalogue.</p></div>
    <nav class="subtabs">${["inbox", "photos", "screens", "rushes"].map((t) => `<a href="#assets/${t}" class="${t === tab ? "active" : ""}">${{ photos: "Photos", screens: "Screen-records", rushes: "Rushs", inbox: "Boîte de dépôt" }[t]}${t === "inbox" ? ' <span class="badge" id="todo-badge" hidden></span>' : ""}</a>`).join("")}</nav></div>
    <div id="drop"></div><div id="uploads" class="uploads"></div><div id="assets-body"><div class="skeleton" style="height:120px"></div></div>`;
  try { assetsCache = await api("/assets"); } catch (e) { $("#assets-body").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  renderDrop(tab); renderAssetsBody(tab); todoBadge();
}
const todoBadge = () => { const b = $("#todo-badge"); if (b) { b.textContent = assetsCache.todo_count; b.hidden = !assetsCache.todo_count; } };
const todoChip = (i) => (i.todo ? '<span class="chip chip-warn todo">à traiter</span>' : "");
function renderDrop(tab) {
  const A = assetsCache, kind = tab === "screens" ? "screen" : tab === "rushes" ? "rush" : tab === "inbox" ? "inbox" : "photo";
  const txt = { photo: ["Déposer des photos", "JPG, PNG, HEIC, WebP → 07_ASSETS/photos/_inbox/ · ensuite « Préparer les photos déposées », puis l'agent remplit _triage.json"], screen: ["Déposer un enregistrement d'écran", `MP4 / MOV → 07_ASSETS/screen-records/<thème>/<thème>-<date>-S${A.screen_next_index}.mov · l'agent complète SCREENS.md et opinions.json`], rush: ["Déposer un rush de réaction", "MP4 / MOV → 07_ASSETS/rushes/ · l'agent renomme reaction-<qui>-<lieu>-<fichier>"], inbox: ["Déposer des photos ou des vidéos", "Tout est accepté (JPG, PNG, HEIC, MP4, MOV…) et marqué « à traiter » : l'agent range chaque fichier au bon endroit et le catalogue"] }[kind];
  $("#drop").innerHTML = `<div class="drop" id="dropzone"><div class="ic">${icon("upload")}</div><div class="txt"><strong>${txt[0]}</strong><span>${esc(txt[1])}</span></div><div class="ctl">
    ${kind === "screen" ? `<select class="input" id="up-theme" style="min-width:140px">${[...new Set([...A.screen_themes, "societe", "couple", "sport", "famille", "taf", "en"])].map((t) => `<option value="${t}">${t}</option>`).join("")}</select>` : ""}
    <label class="btn btn-primary">${icon("upload")} Choisir des fichiers<input type="file" multiple hidden id="up-input" accept="${kind === "photo" ? "image/*,.heic,.heif" : kind === "inbox" ? "image/*,.heic,.heif,video/*,.mov,.mp4,.m4v" : "video/*,.mov,.mp4"}"></label></div></div>`;
  const dz = $("#dropzone");
  ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("over"); }));
  dz.addEventListener("drop", (e) => uploadFiles([...e.dataTransfer.files], kind));
  $("#up-input").addEventListener("change", (e) => uploadFiles([...e.target.files], kind));
}
async function uploadFiles(files, kind) {
  if (!files.length) return;
  const theme = $("#up-theme")?.value; let index = assetsCache.screen_next_index;
  for (const f of files) {
    const row = document.createElement("div"); row.className = "u"; row.innerHTML = `<span>${esc(f.name)} <span class="faint">${mb(f.size)}</span></span><span class="bar"><i></i></span><span class="faint">envoi…</span>`; $("#uploads").appendChild(row);
    await new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `/api/upload?kind=${kind}&name=${encodeURIComponent(f.name)}${theme ? "&theme=" + encodeURIComponent(theme) : ""}&index=${index}`);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) row.querySelector("i").style.transform = `scaleX(${(e.loaded / e.total).toFixed(3)})`; };
      xhr.onload = () => { try { const j = JSON.parse(xhr.responseText); if (xhr.status >= 400) throw new Error(j.error); row.querySelector("span:last-child").innerHTML = `<span style="color:var(--green)">${icon("check")} ${esc(j.path.split("/").pop())}</span>`; row.querySelector("span:last-child").title = j.path; index++; } catch (e) { row.querySelector("span:last-child").innerHTML = `<span style="color:var(--red)">${esc(e.message)}</span>`; } resolve(); };
      xhr.onerror = () => { row.querySelector("span:last-child").textContent = "échec réseau"; resolve(); };
      xhr.send(f);
    });
  }
  toast(`${files.length} fichier${files.length > 1 ? "s" : ""} déposé${files.length > 1 ? "s" : ""}, marqué${files.length > 1 ? "s" : ""} « à traiter »`);
  assetsCache = await api("/assets"); renderAssetsBody(params[0] || "inbox"); todoBadge();
}
// Extraits d'un screen-record : showcase de l'app (menu, joueurs) puis une vignette par opinion avec verdict et % d'accord
const clipGrid = (clips) => `<div class="clip-grid">${clips.map((k) => `<div class="clip${k.showcase ? " showcase" : ""}"><video src="${k.url}#t=0.3" controls preload="metadata" playsinline muted></video><div class="cap">${k.showcase ? '<span class="chip chip-ink">showcase app</span>' : `<span class="chip">${k.pct_agree != null ? k.pct_agree + " % d'accord" : "sans verdict"}</span>`}<span class="ds">${esc(k.text || k.name)}</span><span class="mt">${esc(k.name.match(/^s\d+-(?:showcase-)?\d+/i)?.[0] || k.name)}${k.verdict ? " · " + k.verdict : ""}${k.dur ? " · " + k.dur + " s" : ""}${k.icp ? " · " + esc(k.icp) : ""}</span></div></div>`).join("")}</div>`;
function renderAssetsBody(tab) {
  const A = assetsCache, box = $("#assets-body");
  if (tab === "photos") {
    box.innerHTML = A.photos.map((t) => `<div class="theme-head"><h2>${esc(t.theme)}</h2><span class="n">${t.items.length} photo${t.items.length > 1 ? "s" : ""}${t.items.filter((i) => !i.used).length ? ` · ${t.items.filter((i) => !i.used).length} jamais utilisée${t.items.filter((i) => !i.used).length > 1 ? "s" : ""}` : ""}</span></div>
      <div class="photo-grid">${t.items.map((i) => `<a class="ph" href="${i.url}" data-zoom="${i.url}" title="${esc(i.desc || i.name)}${i.used ? "\nUtilisée : " + esc(i.used) : ""}"><img src="${i.url}" alt="" loading="lazy">${i.todo ? '<span class="chip chip-warn used">à traiter</span>' : i.used ? `<span class="chip chip-ink used" title="${esc(i.used)}">${i.used.split(",").length}×</span>` : '<span class="chip chip-ok used">libre</span>'}<div class="cap"><span class="nm">${esc(i.name)}</span><span class="ds">${esc(i.desc || "non cataloguée (PHOTOS.md)")}</span></div></a>`).join("")}</div>`).join("") || '<div class="empty">Aucune photo.</div>';
  } else if (tab === "screens") {
    box.innerHTML = A.screens.map((t) => `<div class="theme-head"><h2>${esc(t.theme)}</h2><span class="n">${t.items.length}</span></div><div class="panel vid-list">${t.items.map((i) => `<div class="vid-row"><video src="${i.url}#t=0.5" controls preload="metadata" playsinline muted></video><div><div class="nm">${esc(i.name)} ${todoChip(i)}</div><div class="ds">${esc(i.desc || "non catalogué (SCREENS.md + opinions.json à compléter par l'agent)")}</div><div class="mt">${mb(i.bytes)}${i.notes ? " · " + esc(i.notes) : ""}${i.clips?.length ? ` · ${i.clips.filter((k) => !k.showcase).length} opinion${i.clips.filter((k) => !k.showcase).length > 1 ? "s" : ""} découpée${i.clips.filter((k) => !k.showcase).length > 1 ? "s" : ""}${i.clips.some((k) => k.showcase) ? ` + ${i.clips.filter((k) => k.showcase).length} showcase` : ""}` : ""}</div></div></div>${i.clips?.length ? clipGrid(i.clips) : ""}`).join("")}</div>`).join("") || '<div class="empty">Aucun enregistrement.</div>';
  } else if (tab === "rushes") {
    box.innerHTML = A.rushes.length ? `<div class="panel vid-list">${A.rushes.map((i) => `<div class="vid-row"><video src="${i.url}#t=0.5" controls preload="metadata" playsinline muted></video><div><div class="nm">${esc(i.name)} ${todoChip(i)}</div><div class="mt">${mb(i.bytes)}</div></div></div>`).join("")}</div>` : '<div class="empty"><strong>Aucun rush</strong>Les rushs de réaction (visage) vont dans 07_ASSETS/rushes/.</div>';
  } else {
    const I = A.inbox, running = state.runs.filter((r) => r.running), S = state.scripts;
    const runBtn = (k, primary) => { const busy = running.find((r) => r.script === k); return `<button class="btn ${primary ? "btn-primary" : ""}" data-script="${k}" ${busy ? "disabled" : ""}>${busy ? "en cours…" : esc(S[k].label)}</button>`; };
    const V = I.videos || [];
    const vids = `<div class="panel" style="margin-bottom:16px"><div class="panel-head"><h2>Vidéos déposées <span class="faint" style="font-weight:400">07_ASSETS/_inbox/</span></h2><span class="faint small">${V.length ? `${V.length} à traiter : l'agent les range en screen-record (thème + SCREENS.md + opinions.json) ou en rush` : ""}</span></div>
      ${V.length ? `<div class="vid-list">${V.map((i) => `<div class="vid-row"><video src="${i.url}#t=0.5" controls preload="metadata" playsinline muted></video><div><div class="nm">${esc(i.name)} ${todoChip(i)}</div><div class="mt">${mb(i.bytes)}</div></div></div>`).join("")}</div>` : '<div class="empty small">Aucune vidéo en attente.</div>'}</div>`;
    box.innerHTML = vids + `<div class="panel"><div class="panel-head"><h2>Photos déposées <span class="faint" style="font-weight:400">07_ASSETS/photos/_inbox/</span></h2><div class="row">${runBtn("photos-inbox", true)}${runBtn("photos-inbox-apply")}</div></div>
      <div class="panel-body">${I.items.length ? `<p class="small muted" style="margin-bottom:10px">${I.items.length} image${I.items.length > 1 ? "s" : ""} en attente. Étapes : « Préparer » (conversion JPG + planche contact + _triage.json) → l'agent remplit le triage (thème, situation, précision) → « Ranger ».</p><div class="photo-grid">${I.items.map((i) => { const t = I.triage?.find((x) => x.file === i.name); return `<a class="ph" href="${i.url}" data-zoom="${i.url}"><img src="${i.url}" alt="" loading="lazy">${t ? (t.skip ? '<span class="chip chip-bad used">écartée</span>' : t.theme && t.situation ? `<span class="chip chip-ok used">${esc(t.theme)}</span>` : '<span class="chip chip-warn used">à trier</span>') : '<span class="chip chip-warn used">à traiter</span>'}<div class="cap"><span class="nm">${esc(i.name)}</span><span class="ds">${t ? esc([t.theme, t.situation, t.precision].filter(Boolean).join(" · ") || "triage vide") : mb(i.bytes)}</span></div></a>`; }).join("")}</div>` : '<div class="empty"><strong>Aucune photo en attente</strong>Dépose des photos ci-dessus : elles arrivent ici, « à traiter », avant d\'être triées par thème.</div>'}
      ${I.contact_sheets.length ? `<div class="theme-head"><h2>Planches contact</h2></div><div class="row">${I.contact_sheets.map((u, i) => `<a class="btn" href="${u}" data-zoom="${u}">${icon("image")} planche ${i + 1}</a>`).join("")}</div>` : ""}</div></div>`;
    box.querySelectorAll("[data-script]").forEach((b) => b.addEventListener("click", () => runScript(b.dataset.script, async () => { setTimeout(async () => { assetsCache = await api("/assets"); await loadState(); renderAssetsBody("inbox"); }, 4000); })));
  }
}

/* ================= Journal ================= */
let journalTimer = null;
async function renderJournal() {
  clearTimeout(journalTimer);
  const runs = await api("/runs"); const sel = params[0] || runs[0]?.id;
  const S = state.scripts, running = runs.filter((r) => r.running);
  $("#main").innerHTML = `<div class="page-head"><div><h1>Journal</h1><p class="sub">Scripts lancés depuis ce tableau de bord (journaux dans <code>infra/data/dashboard/runs/</code>). Les envois planifiés (systemd sur le VPS, launchd sur un Mac) écrivent dans <code>data/publish/daily/&lt;date&gt;.log</code> (onglet Ce soir).</p></div></div>
  <div class="journal-layout"><div class="stack" style="gap:16px">
    <div class="panel"><div class="panel-head"><h2>Lancer</h2></div><div class="run-list">${Object.keys(S).map((k) => { const busy = running.find((r) => r.script === k); return `<button class="run-btn" data-script="${k}" ${busy ? "disabled" : ""}><span class="l">${esc(S[k].label)}${S[k].confirm ? '<span class="chip chip-bad">envoie</span>' : ""}${busy ? '<span class="chip chip-warn">en cours…</span>' : ""}</span><span class="d">${esc(S[k].desc)}</span>${runGo(k, S[k], busy)}</button>`; }).join("")}</div></div>
    <div class="panel"><div class="panel-head"><h2>Exécutions</h2></div><div class="runs">${runs.length ? runs.map((r) => `<a href="#journal/${r.id}" class="${r.id === sel ? "active" : ""}"><span class="l">${r.running ? '<span class="chip chip-warn">en cours</span>' : r.code === 0 ? '<span class="chip chip-ok">ok</span>' : `<span class="chip chip-bad">code ${r.code}</span>`}${esc(r.label)}</span><span class="d">${fmtDate(r.started_at)}${r.finished_at ? " → " + fmtDate(r.finished_at) : ""}</span></a>`).join("") : '<div class="empty">Rien lancé depuis le démarrage du serveur.</div>'}</div></div></div>
  <div class="panel"><div class="panel-head"><h2 id="run-title">${sel ? esc(runs.find((r) => r.id === sel)?.label || sel) : "Journal"}</h2></div><pre class="log" id="run-log"></pre></div></div>`;
  $("#main").querySelectorAll(".run-btn").forEach((b) => b.addEventListener("click", () => runScript(b.dataset.script, () => renderJournal())));
  if (sel) { try { const r = await api(`/runs/${sel}`); $("#run-log").textContent = r.log; $("#run-log").scrollTop = 1e9; } catch { } }
  if (running.length) journalTimer = setTimeout(() => { if (view === "journal") renderJournal(); }, 2500);
}

/* ================= démarrage ================= */
(async () => { try { await loadState(); route(); } catch (e) { $("#main").innerHTML = `<div class="empty"><strong>Serveur injoignable</strong>${esc(e.message)}</div>`; } })();
