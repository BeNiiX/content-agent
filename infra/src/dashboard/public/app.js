/* Tableau de bord — front vanilla. Vues : comptes, file, soir, assets, journal. Routage par hash. */
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
const fmtChip = (f, r) => `<span class="chip chip-quiet">${esc((f || "").replace("FORMAT-0", "F"))}${r ? " · " + esc(r) : ""}</span>`;
const thumb = (m, cls = "") => !m || !m.exists ? `<span class="thumb ph ${cls}">${icon("alert")}</span>` : m.type === "PHOTO" ? `<img class="thumb ${cls}" src="${m.cover}" alt="" loading="lazy">` : `<video class="thumb v ${cls}" src="${m.url}#t=0.5" muted preload="metadata"></video>`;
const toast = (msg, err = false) => { const t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.textContent = msg; $("#toasts").appendChild(t); setTimeout(() => t.remove(), err ? 6000 : 3200); };
const copy = async (btn, text) => { try { await navigator.clipboard.writeText(text); btn.classList.add("done"); btn.innerHTML = icon("check"); setTimeout(() => { btn.classList.remove("done"); btn.innerHTML = icon("copy"); }, 1400); } catch { toast("Copie impossible", true); } };

let state = null, view = "comptes", params = [];
async function loadState() { state = await api("/state"); renderBrand(); renderSchedChip(); }
// Nom de l'app (config/project.json) dans l'en-tête et l'onglet
function renderBrand() { const n = state.project?.name || "Content agent"; $("#brand-name").textContent = n; document.title = `Pilotage contenu — ${n}`; }
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
  const d = state.schedule.daily, el = $("#sched-chip");
  const h = d.hour != null ? `${String(d.hour).padStart(2, "0")}:${String(d.minute).padStart(2, "0")}` : "?";
  el.className = "chip " + (d.installed ? "chip-ok" : "chip-bad");
  el.innerHTML = `${icon("clock")} envoi auto ${h} · ${d.installed ? "planifié" : "non installé"}${state.schedule.dry_run ? " · dry-run" : ""}`;
}
function route() {
  const h = location.hash.replace(/^#/, "") || "comptes"; [view, ...params] = h.split("/").map(decodeURIComponent);
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
  ({ comptes: renderComptes, file: renderFile, soir: renderSoir, assets: renderAssets, journal: renderJournal }[view] || renderComptes)();
}
window.addEventListener("hashchange", route);
$("#refresh").addEventListener("click", async () => { await loadState(); route(); toast("Actualisé"); });
document.addEventListener("keydown", (e) => { if (e.key === "r" && !/input|textarea|select/i.test(e.target.tagName) && !e.metaKey) $("#refresh").click(); });
document.addEventListener("click", (e) => { const z = e.target.closest("[data-zoom]"); if (z) { e.preventDefault(); lightbox(z.dataset.zoom); } });
function lightbox(src) { let d = $("dialog.lb"); if (!d) { d = document.createElement("dialog"); d.className = "lb"; d.addEventListener("click", () => d.close()); document.body.appendChild(d); } d.innerHTML = `<img src="${esc(src)}" alt="aperçu">`; d.showModal(); }

/* ================= Comptes ================= */
function renderComptes() {
  const A = state.accounts;
  const willSend = A.filter((a) => a.will_send), noStock = A.filter((a) => a.connected && !a.paused && a.stock.ready_queue === 0), drafted = A.reduce((n, a) => n + a.stock.drafted, 0), stopped = A.filter((a) => a.paused || a.production_paused);
  const sched = state.schedule.daily;
  $("#main").innerHTML = `
  <div class="page-head">
    <div><h1>Comptes</h1>
      <p class="sub">Ce soir à ${String(sched.hour ?? 18).padStart(2, "0")}:${String(sched.minute ?? 0).padStart(2, "0")} : <strong>${willSend.length} compte${willSend.length > 1 ? "s" : ""}</strong> recevr${willSend.length > 1 ? "ont" : "a"} un brouillon${noStock.length ? ` · <strong class="chip chip-bad">${noStock.length} sans stock</strong>` : ""}${drafted ? ` · <strong>${drafted}</strong> brouillon${drafted > 1 ? "s" : ""} à finaliser dans l'app` : ""}${stopped.length ? ` · ${stopped.length} compte${stopped.length > 1 ? "s" : ""} en arrêt` : ""}.</p></div>
    <div class="row"><a class="btn" href="#soir">${icon("send")} Voir le plan du soir</a></div>
  </div>
  <div class="panel"><table class="grid">
    <thead><tr><th>Compte</th><th>Rôle</th><th>Stock (file)</th><th>À finaliser</th><th>Publiés</th><th>Prochain envoi</th><th>Envoi des brouillons</th><th>Création</th></tr></thead>
    <tbody>${A.map(rowAccount).join("")}</tbody></table></div>
  <p class="faint small" style="margin-top:10px">Stock = fiches <em>prêt</em> dans l'ordre de <code>06_CALENDAR/QUEUE.md</code> (ce que l'envoi du soir consomme). « Envoi » écrit <code>paused</code> dans <code>infra/config/accounts.json</code> ; « Création » écrit <code>production_paused</code> (lu par l'agent avant de produire).</p>`;
  $("#main").querySelectorAll(".switch").forEach((sw) => sw.addEventListener("click", onToggle));
  $("#main").querySelectorAll("tr[data-slug]").forEach((tr) => tr.addEventListener("click", (e) => { if (e.target.closest(".switch, a, button")) return; location.hash = `file/${tr.dataset.slug}`; }));
}
function rowAccount(a) {
  const s = a.stock, off = a.paused || !a.connected;
  const numCls = s.ready_queue === 0 ? "zero" : s.ready_queue <= 3 ? "low" : "";
  const conn = !a.connected ? `<span class="chip chip-bad">${icon("alert")} pas de connecteur</span>` : "";
  return `<tr data-slug="${a.slug}" class="${off ? "off" : ""}" style="cursor:pointer">
    <td><div class="acc-cell"><span class="handle">${esc(a.handle)}</span><span class="meta">${esc(a.slug)} · ${esc(a.device || "—")}</span>${conn}</div></td>
    <td class="muted small" style="max-width:260px">${esc(a.role || "")}</td>
    <td><span class="num ${numCls}">${s.ready_queue}</span><div class="num-sub">${s.ready_total > s.ready_queue ? `${s.ready_total - s.ready_queue} prêt${s.ready_total - s.ready_queue > 1 ? "s" : ""} hors file` : s.todo ? `${s.todo} à produire` : `${s.total} fiche${s.total > 1 ? "s" : ""}`}</div></td>
    <td><span class="num ${s.drafted ? "" : "faint"}">${s.drafted}</span><div class="num-sub">${a.last_sent ? "envoyé " + fmtDate(a.last_sent) : ""}</div></td>
    <td><span class="num ${s.published ? "" : "faint"}">${s.published}</span></td>
    <td>${a.next ? `<a class="next-cell" href="#file/${a.slug}/${a.next.id}">${thumb({ exists: true, type: a.next.type, cover: a.next.cover, url: a.next.cover }, "")}<span class="t"><span class="h" title="${esc(a.next.hook || "")}">${esc(a.next.hook || a.next.id)}</span><span class="m">${esc(a.next.id)} · ${esc((a.next.format || "").replace("FORMAT-0", "F"))} ${esc(a.next.rendition || "")}${a.tonight?.status === "sent" ? " · envoyé ce soir" : ""}</span></span></a>` : `<span class="faint">${a.paused ? "compte en pause" : !a.connected ? "compte non connecté" : "rien de prêt dans la file"}</span>`}</td>
    <td>${sw(a.slug, "paused", !a.paused, a.paused ? "arrêté" : "actif", !a.connected)}</td>
    <td>${sw(a.slug, "production_paused", !a.production_paused, a.production_paused ? "arrêtée" : "active")}</td></tr>`;
}
const sw = (slug, key, on, label, disabled = false) => `<div class="switch-row"><button class="switch" role="switch" aria-checked="${on}" data-slug="${slug}" data-key="${key}" ${disabled ? 'title="Compte non connecté : rien ne part de toute façon"' : ""}></button><span class="lbl ${on ? "" : "off"}">${label}</span></div>`;
async function onToggle(e) {
  const b = e.currentTarget, on = b.getAttribute("aria-checked") === "true", key = b.dataset.key, slug = b.dataset.slug;
  b.setAttribute("aria-busy", "true");
  try {
    await post(`/accounts/${slug}`, { [key]: on });   // on = actuellement actif → on arrête (paused = true)
    toast(key === "paused" ? `${slug} : envoi des brouillons ${on ? "arrêté — rien ne partira ce soir pour ce compte" : "réactivé"}` : `${slug} : création ${on ? "arrêtée — l'agent ne produit plus pour ce compte" : "réactivée"}`);
    await loadState(); route();
  } catch (err) { toast(err.message, true); b.removeAttribute("aria-busy"); }
}

/* ================= File d'attente ================= */
async function renderFile() {
  const slug = params[0] || state.accounts.find((a) => a.stock.ready_queue > 0)?.slug || state.accounts[0].slug;
  const expId = params[1] || null;
  const acc = state.accounts.find((a) => a.slug === slug);
  $("#main").innerHTML = `<div class="page-head"><div><h1>File d'attente</h1><p class="sub">Ordre d'envoi = ordre de <code>QUEUE.md</code>. Clique un contenu pour voir le média et ce qu'il faudra taper dans TikTok.</p></div></div>
  <div class="file-layout"><nav class="acc-list">${state.accounts.map((a) => `<a href="#file/${a.slug}" class="${a.slug === slug ? "active" : ""} ${a.paused ? "paused" : ""}"><span class="h">${esc(a.handle)}</span><span class="n">${a.stock.ready_queue}${a.stock.drafted ? ` <span class="chip chip-warn" style="height:16px;padding:0 5px">${a.stock.drafted}</span>` : ""}</span></a>`).join("")}</nav>
  <div class="panel" id="qlist"><div class="panel-body"><div class="skeleton" style="height:60px"></div></div></div>
  <div class="panel detail" id="qdetail"><div class="empty"><strong>Aucun contenu sélectionné</strong>Choisis une ligne à gauche.</div></div></div>`;
  let q; try { q = await api(`/queue?account=${encodeURIComponent(slug)}`); } catch (e) { $("#qlist").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const rows = q.rows, first = expId || rows.find((r) => r.exp_data?.status === "drafted")?.exp || rows.find((r) => r.exp_data?.status === "ready")?.exp || rows.find((r) => r.exp)?.exp || q.others[0]?.id;
  const head = `<div class="panel-head"><div><h2>${esc(acc.handle)} <span class="faint" style="font-weight:400">· ${esc(q.title || acc.role || "")}</span></h2></div><div class="row small">${acc.paused ? '<span class="chip chip-bad">envoi arrêté</span>' : ""}${acc.production_paused ? '<span class="chip chip-bad">création arrêtée</span>' : ""}<span class="chip chip-ok">${acc.stock.ready_queue} prêt${acc.stock.ready_queue > 1 ? "s" : ""}</span>${acc.stock.drafted ? `<span class="chip chip-warn">${acc.stock.drafted} à finaliser</span>` : ""}</div></div>`;
  const notes = q.notes.filter((n) => !/^\|/.test(n)).slice(0, 3).map((n) => `<div class="q-note">${md(n)}</div>`).join("");
  const rowHtml = (r) => {
    const e = r.exp_data;
    if (!e) return `<div class="q-row" style="cursor:default"><span class="ord">${esc(r.order)}</span><span class="thumb ph">${icon("alert")}</span><div class="body"><span class="hook faint">${esc(r.exp_raw)} — ${esc(r.file || "")}</span><div class="meta">${esc(r.format)} · ${esc(r.status)} · ${esc(r.todo)}</div></div><span></span></div>`;
    return `<div class="q-row ${e.id === first ? "active" : ""}" data-exp="${e.id}"><span class="ord">${esc(r.order)}</span>${thumb(e.media)}<div class="body"><div><span class="id">${e.id}</span><span class="hook" title="${esc(e.hook || "")}">${esc(e.hook || e.title)}</span></div><div class="meta">${esc(r.angle || e.angle || "")} · ${esc(r.format || "")}${r.wrong_account ? ' · <span style="color:var(--red)">fiche d\'un autre compte</span>' : ""}${r.todo ? " · " + esc(r.todo.replace(/( — dans les brouillons TikTok, à finaliser dans l'app)+/, "")) : ""}</div></div><div>${chipStatus(e.status, e.status_raw)}</div></div>`;
  };
  const othersHtml = q.others.length ? `<div class="q-sect">Fiches du compte hors tableau QUEUE (${q.others.length}) — non envoyées par l'automate</div>` + q.others.map((e) => `<div class="q-row ${e.id === first ? "active" : ""}" data-exp="${e.id}"><span class="ord">—</span>${thumb(e.media)}<div class="body"><div><span class="id">${e.id}</span><span class="hook">${esc(e.hook || e.title)}</span></div><div class="meta">${esc(e.angle || "")} · ${esc((e.format || "").replace("FORMAT-0", "F"))} ${esc(e.rendition || "")}</div></div><div>${chipStatus(e.status, e.status_raw)}</div></div>`).join("") : "";
  $("#qlist").innerHTML = head + notes + (rows.length || q.others.length ? `<div class="q-rows">${rows.map(rowHtml).join("")}${othersHtml}</div>` : `<div class="empty"><strong>Pas de file pour ce compte</strong>Aucune section <code>## ${esc(slug)}</code> dans QUEUE.md et aucune fiche EXP avec <code>account: ${esc(slug)}</code>.</div>`);
  $("#qlist").querySelectorAll(".q-row[data-exp]").forEach((el) => el.addEventListener("click", () => { history.replaceState(null, "", `#file/${slug}/${el.dataset.exp}`); $("#qlist").querySelectorAll(".q-row").forEach((x) => x.classList.toggle("active", x === el)); renderDetail(el.dataset.exp); }));
  if (first) renderDetail(first);
}
async function renderDetail(id) {
  const box = $("#qdetail"); box.innerHTML = `<div class="panel-head"><h2>${id}</h2></div><div class="panel-body stack"><div class="skeleton" style="height:190px"></div><div class="skeleton"></div><div class="skeleton" style="width:60%"></div></div>`;
  let d; try { d = await api(`/exp/${id}`); } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const m = d.media, job = d.job, ia = job?.in_app || {};
  const media = !m ? `<div class="media-missing">Fiche sans <code>media_file</code></div>` : !m.exists ? `<div class="media-missing">Média introuvable : <code>${esc(m.path)}</code></div>` : m.type === "PHOTO" ? `<div class="media-strip">${m.slides.map((u, i) => `<a class="n" href="${u}" data-zoom="${u}"><img src="${u}" alt="slide ${i + 1}" loading="lazy"><span>${i + 1}/${m.count}</span></a>`).join("")}</div>` : `<div class="media-video"><video src="${m.url}" controls playsinline preload="metadata"></video></div>`;
  const field = (k, v, big = false) => v ? `<div class="field"><span class="k">${k}</span><span class="v ${big ? "big" : ""}">${esc(v)}</span><button class="btn btn-sm btn-icon copy" data-copy="${esc(v)}" title="Copier">${icon("copy")}</button></div>` : "";
  const isPhoto = (job?.media_type || m?.type) === "PHOTO";
  const sheet = job?.sheet_rows ? `<table class="sheet"><thead><tr>${job.sheet_rows.header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${job.sheet_rows.rows.map((r) => `<tr>${r.map((c, i) => `<td>${esc(c)}${i === r.length - 1 ? ` <button class="btn btn-sm btn-icon copy" data-copy="${esc(c)}" title="Copier">${icon("copy")}</button>` : ""}</td>`).join("")}</tr>`).join("")}</tbody></table>` : ia.sheet ? `<div class="md">${md(ia.sheet)}</div>` : "";
  const inApp = `<div class="sect"><h3>À saisir dans TikTok ${isPhoto ? '<span class="chip chip-quiet">carrousel</span>' : '<span class="chip chip-quiet">vidéo</span>'}</h3>
    ${isPhoto ? field("Titre à taper", ia.tiktok_title_field, true) : ""}
    ${field(isPhoto ? "Texte natif slide 1" : "Texte natif", ia.front_page_text, !isPhoto)}
    ${field(isPhoto ? "Description" : "Caption", isPhoto ? job?.title_param : ia.caption)}
    ${isPhoto && ia.caption && ia.caption !== job?.title_param ? field("Caption (fiche)", ia.caption) : ""}
    ${field("Son", ia.sound)}
    ${sheet ? `<div style="margin-top:10px"><div class="k small faint" style="margin-bottom:4px">${job?.sheet_rows ? "Bulles (texte natif + voix TTS) — " + esc(ia.textes_md || "") : "Fiche POSTS.md — " + esc(ia.posts_md || "")}</div>${sheet}</div>` : ""}
    ${!job ? `<p class="muted small">Fiche « à saisir » indisponible : ${esc(d.job_error || "")}</p>` : ""}
    ${job?.problems?.length ? `<ul class="problems">${job.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}</div>`;
  const drafted = d.status === "drafted", published = d.status === "published";
  const actions = `<div class="sect"><h3>Actions</h3><div class="actions">
    ${drafted ? `<form class="inline-form" id="posted-form"><input class="input" name="url" placeholder="URL du post TikTok (optionnel)" type="url"><button class="btn btn-primary" type="submit">${icon("check")} Marquer posté</button></form>` : ""}
    ${m?.exists && state.platform === "darwin" ? `<button class="btn" data-reveal="${esc(m.path)}">${icon("folder")} Voir dans le Finder</button>` : ""}
    ${state.platform === "darwin" ? `<button class="btn" data-reveal="${esc(d.file)}">${icon("external")} Fiche EXP</button>` : `<span class="faint small"><code>${esc(d.file)}</code></span>`}
    ${d.post_url ? `<a class="btn" href="${esc(d.post_url)}" target="_blank" rel="noopener">${icon("external")} Post publié</a>` : ""}</div>
    ${drafted ? `<p class="faint small" style="margin-top:8px">Le brouillon est dans l'app TikTok du compte ${esc(d.account || "")}${d.draft_sent_at ? " depuis le " + fmtDate(d.draft_sent_at) : ""}. Une fois posté, marque-le ici : la fiche passe en <em>publié</em> et la ligne QUEUE est mise à jour.</p>` : ""}</div>`;
  const meta = `<div class="sect"><h3>Fiche</h3><dl class="kv">
    <dt>Statut</dt><dd>${chipStatus(d.status, d.status_raw)} ${d.status_raw && d.status_raw !== STATUS[d.status]?.[1] ? `<span class="faint">${esc(d.status_raw)}</span>` : ""}</dd>
    <dt>Compte</dt><dd>${esc(d.account || "—")} ${d.fm.da ? `· DA ${esc(d.fm.da)}` : ""}</dd>
    <dt>Angle</dt><dd>${esc(d.angle || "—")}</dd><dt>Format</dt><dd>${esc(d.format || "—")} ${esc(d.rendition || "")}</dd>
    ${d.fm.test_group ? `<dt>Test</dt><dd>${esc(d.fm.test_group)} · variante ${esc(d.fm.variant || "")}</dd>` : ""}
    ${d.fm.opinion ? `<dt>${esc(cap(voc("item_plural")))}</dt><dd style="white-space:normal">${esc(d.fm.opinion)}</dd>` : ""}
    ${d.fm.photo ? `<dt>Photo</dt><dd>${esc(d.fm.photo)}</dd>` : ""}
    <dt>Média</dt><dd><code>${esc(m?.path || "—")}</code>${m?.exists ? ` · ${m.type === "PHOTO" ? m.count + " slides" : mb(m.bytes)}` : ""}</dd>
    ${d.draft_sent_at ? `<dt>Brouillon</dt><dd>${fmtDate(d.draft_sent_at)}${d.tiktok_publish_id ? ` · <code>${esc(d.tiktok_publish_id)}</code>` : ""}</dd>` : ""}
    ${d.published_at ? `<dt>Publié</dt><dd>${esc(d.published_at)}</dd>` : ""}
    <dt>Mis à jour</dt><dd>${esc(d.updated || "—")}</dd></dl></div>`;
  box.innerHTML = `<div class="panel-head"><h2 title="${esc(d.title)}">${esc(d.title)}</h2>${chipStatus(d.status, d.status_raw)}</div>${media}${inApp}${actions}${meta}`;
  box.querySelectorAll(".copy").forEach((b) => b.addEventListener("click", () => copy(b, b.dataset.copy)));
  box.querySelectorAll("[data-reveal]").forEach((b) => b.addEventListener("click", () => post("/reveal", { path: b.dataset.reveal }).catch((e) => toast(e.message, true))));
  const form = $("#posted-form"); if (form) form.addEventListener("submit", async (e) => {
    e.preventDefault(); const btn = form.querySelector("button"); btn.setAttribute("aria-busy", "true");
    try { const r = await post(`/exp/${id}/posted`, { post_url: form.url.value.trim() || null }); toast(r.output.split("\n")[0]); await loadState(); renderFile(); }
    catch (err) { toast(err.message, true); btn.removeAttribute("aria-busy"); }
  });
}
// Mini markdown : titres, gras, code, citations, listes numérotées, tableaux
function md(src) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const lines = String(src).split("\n"), out = []; let tbl = null, ol = null;
  const flush = () => { if (tbl) { out.push(`<table><thead><tr>${tbl.h.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${tbl.r.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`); tbl = null; } if (ol) { out.push(`<ol>${ol.map((l) => `<li>${inline(l)}</li>`).join("")}</ol>`); ol = null; } };
  for (const l of lines) {
    if (l.startsWith("|")) { const cells = l.split("|").slice(1, -1).map((c) => c.trim()); if (/^\|\s*-/.test(l)) continue; if (!tbl) tbl = { h: cells, r: [] }; else tbl.r.push(cells); continue; }
    if (/^\d+\.\s/.test(l)) { if (!ol) ol = []; ol.push(l.replace(/^\d+\.\s/, "")); continue; }
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
  const runBtn = (k, cls = "") => { const s = S[k], busy = running.find((r) => r.script === k); return `<button class="run-btn ${cls}" data-script="${k}" ${busy ? "disabled" : ""}><span class="l">${esc(s.label)}${busy ? '<span class="chip chip-warn">en cours…</span>' : ""}</span><span class="d">${esc(s.desc)}</span></button>`; };
  $("#main").innerHTML = `<div class="page-head"><div><h1>Ce soir</h1><p class="sub">${plan ? `Plan du ${fmtDay(plan.date)} — établi ${fmtDate(plan.created_at)}${plan.updated_at && plan.updated_at !== plan.created_at ? ", mis à jour " + fmtDate(plan.updated_at) : ""}${plan.mode === "dry-run" ? ' · <span class="chip chip-warn">dry-run</span>' : ""}` : `Aucun plan pour le ${fmtDay(date)} : il sera calculé à ${String(sc.daily.hour ?? 18).padStart(2, "0")}:${String(sc.daily.minute ?? 0).padStart(2, "0")}, ou maintenant avec « Recalculer ».`}</p></div>
    <div class="row"><input class="input" type="date" id="soir-date" value="${esc(date)}" style="min-width:0"></div></div>
  <div class="soir-layout"><div class="stack" style="gap:16px">
    <div class="panel">${plan ? (plan.items.length ? plan.items.map(itemHtml).join("") : '<div class="empty"><strong>Plan vide</strong>Aucun compte actif.</div>') : '<div class="empty"><strong>Pas encore de plan</strong>Le plan liste, pour chaque compte connecté et non arrêté, le prochain contenu prêt de sa file.</div>'}
      ${plan?.skipped?.length ? `<div class="q-note">Ignorés : ${plan.skipped.map((s) => `${esc(s.handle)} (${esc(s.reason)})`).join(" · ")}</div>` : ""}</div>
    <div class="panel"><div class="panel-head"><h2>Journal du ${esc(date)}</h2><span class="faint small"><code>${esc(d.log_file)}</code></span></div><pre class="log" id="soir-log">${esc(d.log || "")}</pre></div></div>
  <div class="stack" style="gap:16px">
    <div class="panel"><div class="panel-head"><h2>Lancer</h2></div><div class="run-list">${runBtn("daily-plan")}${runBtn("daily-drafts-dry")}${runBtn("daily-notify")}${runBtn("daily-drafts")}</div></div>
    <div class="panel"><div class="panel-head"><h2>Automatisation</h2></div><div class="panel-body"><dl class="sched">
      <dt>Envoi du soir</dt><dd>${schedLine(sc.daily, `tous les jours à ${hm(sc.daily)}`)}</dd>
      <dt>Relevé stats</dt><dd>${schedLine(sc.weekly, `${weekdayName(sc.weekly.weekday)} ${hm(sc.weekly)}`)}</dd>
      <dt>Message</dt><dd>${esc(sc.notify_channel)}${sc.notify_channel === "stdout" ? ' <span class="faint">(NOTIFY_CHANNEL dans .env : imessage | telegram)</span>' : ""}</dd>
      <dt>Comptes</dt><dd>${sc.daily_accounts ? esc(sc.daily_accounts) + ' <span class="faint">(DAILY_ACCOUNTS)</span>' : "tous les comptes connectés non arrêtés"}</dd>
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
  const tab = params[0] || "photos";
  $("#main").innerHTML = `<div class="page-head"><div><h1>Assets</h1><p class="sub">Photos, enregistrements d'écran et rushs partagés entre tous les comptes (<code>07_ASSETS/</code>). Dépose ici, l'agent trie et catalogue.</p></div>
    <nav class="subtabs">${["photos", "screens", "rushes", "inbox"].map((t) => `<a href="#assets/${t}" class="${t === tab ? "active" : ""}">${{ photos: "Photos", screens: "Screen-records", rushes: "Rushs", inbox: "Boîte de dépôt" }[t]}</a>`).join("")}</nav></div>
    <div id="drop"></div><div id="uploads" class="uploads"></div><div id="assets-body"><div class="skeleton" style="height:120px"></div></div>`;
  try { assetsCache = await api("/assets"); } catch (e) { $("#assets-body").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  renderDrop(tab); renderAssetsBody(tab);
}
function renderDrop(tab) {
  const A = assetsCache, kind = tab === "screens" ? "screen" : tab === "rushes" ? "rush" : "photo";
  const txt = { photo: ["Déposer des photos", "JPG, PNG, HEIC, WebP → 07_ASSETS/photos/_inbox/ · ensuite « Préparer les photos déposées », puis l'agent remplit _triage.json"], screen: ["Déposer un enregistrement d'écran", `MP4 / MOV → 07_ASSETS/screen-records/<thème>/<thème>-<date>-S${A.screen_next_index}.mov · l'agent complète SCREENS.md et opinions.json`], rush: ["Déposer un rush de réaction", "MP4 / MOV → 07_ASSETS/rushes/ · l'agent renomme reaction-<qui>-<lieu>-<fichier>"] }[kind];
  $("#drop").innerHTML = `<div class="drop" id="dropzone"><div class="ic">${icon("upload")}</div><div class="txt"><strong>${txt[0]}</strong><span>${esc(txt[1])}</span></div><div class="ctl">
    ${kind === "screen" ? `<select class="input" id="up-theme" style="min-width:140px">${[...new Set([...A.screen_themes, "societe", "couple", "sport", "famille", "taf", "en"])].map((t) => `<option value="${t}">${t}</option>`).join("")}</select>` : ""}
    <label class="btn btn-primary">${icon("upload")} Choisir des fichiers<input type="file" multiple hidden id="up-input" accept="${kind === "photo" ? "image/*,.heic,.heif" : "video/*,.mov,.mp4"}"></label></div></div>`;
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
  toast(`${files.length} fichier${files.length > 1 ? "s" : ""} déposé${files.length > 1 ? "s" : ""}`);
  assetsCache = await api("/assets"); renderAssetsBody(params[0] || "photos");
}
function renderAssetsBody(tab) {
  const A = assetsCache, box = $("#assets-body");
  if (tab === "photos") {
    box.innerHTML = A.photos.map((t) => `<div class="theme-head"><h2>${esc(t.theme)}</h2><span class="n">${t.items.length} photo${t.items.length > 1 ? "s" : ""}${t.items.filter((i) => !i.used).length ? ` · ${t.items.filter((i) => !i.used).length} jamais utilisée${t.items.filter((i) => !i.used).length > 1 ? "s" : ""}` : ""}</span></div>
      <div class="photo-grid">${t.items.map((i) => `<a class="ph" href="${i.url}" data-zoom="${i.url}" title="${esc(i.desc || i.name)}${i.used ? "\nUtilisée : " + esc(i.used) : ""}"><img src="${i.url}" alt="" loading="lazy">${i.used ? `<span class="chip chip-ink used" title="${esc(i.used)}">${i.used.split(",").length}×</span>` : '<span class="chip chip-ok used">libre</span>'}<div class="cap"><span class="nm">${esc(i.name)}</span><span class="ds">${esc(i.desc || "non cataloguée (PHOTOS.md)")}</span></div></a>`).join("")}</div>`).join("") || '<div class="empty">Aucune photo.</div>';
  } else if (tab === "screens") {
    box.innerHTML = A.screens.map((t) => `<div class="theme-head"><h2>${esc(t.theme)}</h2><span class="n">${t.items.length}</span></div><div class="panel vid-list">${t.items.map((i) => `<div class="vid-row"><video src="${i.url}#t=0.5" controls preload="metadata" playsinline muted></video><div><div class="nm">${esc(i.name)}</div><div class="ds">${esc(i.desc || "non catalogué (SCREENS.md + opinions.json à compléter par l'agent)")}</div><div class="mt">${mb(i.bytes)}${i.notes ? " · " + esc(i.notes) : ""}</div></div></div>`).join("")}</div>`).join("") || '<div class="empty">Aucun enregistrement.</div>';
  } else if (tab === "rushes") {
    box.innerHTML = A.rushes.length ? `<div class="panel vid-list">${A.rushes.map((i) => `<div class="vid-row"><video src="${i.url}#t=0.5" controls preload="metadata" playsinline muted></video><div><div class="nm">${esc(i.name)}</div><div class="mt">${mb(i.bytes)}</div></div></div>`).join("")}</div>` : '<div class="empty"><strong>Aucun rush</strong>Les rushs de réaction (visage) vont dans 07_ASSETS/rushes/.</div>';
  } else {
    const I = A.inbox, running = state.runs.filter((r) => r.running), S = state.scripts;
    const runBtn = (k, primary) => { const busy = running.find((r) => r.script === k); return `<button class="btn ${primary ? "btn-primary" : ""}" data-script="${k}" ${busy ? "disabled" : ""}>${busy ? "en cours…" : esc(S[k].label)}</button>`; };
    box.innerHTML = `<div class="panel"><div class="panel-head"><h2>Boîte de dépôt <span class="faint" style="font-weight:400">07_ASSETS/photos/_inbox/</span></h2><div class="row">${runBtn("photos-inbox", true)}${runBtn("photos-inbox-apply")}</div></div>
      <div class="panel-body">${I.items.length ? `<p class="small muted" style="margin-bottom:10px">${I.items.length} image${I.items.length > 1 ? "s" : ""} en attente. Étapes : « Préparer » (conversion JPG + planche contact + _triage.json) → l'agent remplit le triage (thème, situation, précision) → « Ranger ».</p><div class="photo-grid">${I.items.map((i) => { const t = I.triage?.find((x) => x.file === i.name); return `<a class="ph" href="${i.url}" data-zoom="${i.url}"><img src="${i.url}" alt="" loading="lazy">${t ? (t.skip ? '<span class="chip chip-bad used">écartée</span>' : t.theme && t.situation ? `<span class="chip chip-ok used">${esc(t.theme)}</span>` : '<span class="chip chip-warn used">à trier</span>') : '<span class="chip chip-quiet used">brut</span>'}<div class="cap"><span class="nm">${esc(i.name)}</span><span class="ds">${t ? esc([t.theme, t.situation, t.precision].filter(Boolean).join(" · ") || "triage vide") : mb(i.bytes)}</span></div></a>`; }).join("")}</div>` : '<div class="empty"><strong>Boîte vide</strong>Dépose des photos ci-dessus : elles arrivent ici avant d\'être triées par thème.</div>'}
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
    <div class="panel"><div class="panel-head"><h2>Lancer</h2></div><div class="run-list">${Object.keys(S).map((k) => { const busy = running.find((r) => r.script === k); return `<button class="run-btn" data-script="${k}" ${busy ? "disabled" : ""}><span class="l">${esc(S[k].label)}${S[k].confirm ? '<span class="chip chip-bad">envoie</span>' : ""}${busy ? '<span class="chip chip-warn">en cours…</span>' : ""}</span><span class="d">${esc(S[k].desc)}</span></button>`; }).join("")}</div></div>
    <div class="panel"><div class="panel-head"><h2>Exécutions</h2></div><div class="runs">${runs.length ? runs.map((r) => `<a href="#journal/${r.id}" class="${r.id === sel ? "active" : ""}"><span class="l">${r.running ? '<span class="chip chip-warn">en cours</span>' : r.code === 0 ? '<span class="chip chip-ok">ok</span>' : `<span class="chip chip-bad">code ${r.code}</span>`}${esc(r.label)}</span><span class="d">${fmtDate(r.started_at)}${r.finished_at ? " → " + fmtDate(r.finished_at) : ""}</span></a>`).join("") : '<div class="empty">Rien lancé depuis le démarrage du serveur.</div>'}</div></div></div>
  <div class="panel"><div class="panel-head"><h2 id="run-title">${sel ? esc(runs.find((r) => r.id === sel)?.label || sel) : "Journal"}</h2></div><pre class="log" id="run-log"></pre></div></div>`;
  $("#main").querySelectorAll(".run-btn").forEach((b) => b.addEventListener("click", () => runScript(b.dataset.script, () => renderJournal())));
  if (sel) { try { const r = await api(`/runs/${sel}`); $("#run-log").textContent = r.log; $("#run-log").scrollTop = 1e9; } catch { } }
  if (running.length) journalTimer = setTimeout(() => { if (view === "journal") renderJournal(); }, 2500);
}

/* ================= démarrage ================= */
(async () => { try { await loadState(); route(); } catch (e) { $("#main").innerHTML = `<div class="empty"><strong>Serveur injoignable</strong>${esc(e.message)}</div>`; } })();
