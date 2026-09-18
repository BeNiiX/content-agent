/*
 * Extraction navigateur TikTok — à coller dans la console (F12) sur tiktok.com connecté,
 * ou à exécuter via l'outil Chrome MCP `javascript_tool`.
 *
 *  - Sur https://www.tiktok.com/@<toi>?lang=fr, onglet "Favoris" ou "J'aime" ouvert  → extrait les vidéos.
 *  - Après avoir cliqué sur "Abonnements" (fenêtre modale)                              → extrait les comptes.
 *
 * Le script scrolle automatiquement (max ~2 min), puis :
 *   1. stocke le résultat dans window.__CONTENT_EXPORT (lisible par le MCP),
 *   2. tente de télécharger tiktok-<kind>-<date>.json (à déposer dans infra/data/raw/tiktok/).
 * Ensuite : node src/tiktok/import-export.js data/raw/tiktok/tiktok-favorites-<date>.json
 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const dialog = document.querySelector('[role="dialog"]');
  const kind = dialog ? "following" : (location.search + document.body.innerText).toLowerCase().includes("favor") ? "favorites" : "likes";
  const scroller = dialog ? (dialog.querySelector('[class*="Scroll"], [style*="overflow"]') || dialog) : window;
  const seen = new Map();
  const collect = () => {
    const root = dialog || document;
    if (kind === "following") {
      root.querySelectorAll('a[href^="/@"]').forEach((el) => {
        const m = el.getAttribute("href").match(/^\/@([^/?]+)/);
        if (m) seen.set(m[1], { handle: m[1], name: el.textContent.trim().slice(0, 60) });
      });
    } else {
      root.querySelectorAll('a[href*="/video/"], a[href*="/photo/"]').forEach((el) => {
        const m = el.getAttribute("href").match(/\/@([^/]+)\/(video|photo)\/(\d+)/);
        if (!m) return;
        const views = el.closest("div")?.querySelector('[data-e2e*="views"], strong')?.textContent?.trim() || null;
        seen.set(m[3], { url: `https://www.tiktok.com/@${m[1]}/${m[2]}/${m[3]}`, handle: m[1], views_label: views });
      });
    }
  };
  let stable = 0, last = -1;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000 && stable < 6) {
    collect();
    if (scroller === window) window.scrollTo(0, document.body.scrollHeight); else scroller.scrollTop = scroller.scrollHeight;
    await sleep(900);
    stable = seen.size === last ? stable + 1 : 0;
    last = seen.size;
  }
  collect();
  const out = { kind, extracted_at: new Date().toISOString(), page: location.href, items: [...seen.values()] };
  window.__CONTENT_EXPORT = out;
  console.log(`[content-agent] ${kind}: ${out.items.length} éléments. window.__CONTENT_EXPORT prêt.`);
  try {
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tiktok-${kind}-${out.extracted_at.slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { console.warn("[content-agent] téléchargement impossible, copie window.__CONTENT_EXPORT :", e); }
  return out.items.length;
})();
