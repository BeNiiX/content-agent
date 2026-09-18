// Normalisation des URLs TikTok / Instagram → { platform, id, url, handle }
export function parseUrl(raw) {
  if (!raw) return null;
  let u;
  try { u = new URL(raw.trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\./, "");
  if (host.endsWith("tiktokv.com")) {
    // Format de l'export officiel : https://www.tiktokv.com/share/video/7300000000000000001/
    const m = u.pathname.match(/\/share\/video\/(\d+)/);
    if (m) return { platform: "tiktok", handle: null, id: m[1], kind: "video", url: `https://www.tiktok.com/@_/video/${m[1]}` };
    return null;
  }
  if (host.endsWith("tiktok.com")) {
    // https://www.tiktok.com/@handle/video/7234567890123456789 | /photo/… | vm.tiktok.com/xxxx (court, résolu par yt-dlp)
    const m = u.pathname.match(/^\/@([^/]+)\/(video|photo)\/(\d+)/);
    if (m) return { platform: "tiktok", handle: m[1], id: m[3], kind: m[2], url: `https://www.tiktok.com/@${m[1]}/${m[2]}/${m[3]}` };
    const short = u.pathname.match(/^\/(?:t\/)?([A-Za-z0-9]+)\/?$/);
    if (host.startsWith("vm.") || host.startsWith("vt.") || short) return { platform: "tiktok", handle: null, id: null, kind: "short", url: u.href };
    const m2 = u.pathname.match(/^\/v\/(\d+)/);
    if (m2) return { platform: "tiktok", handle: null, id: m2[1], kind: "video", url: u.href };
    return null;
  }
  if (host.endsWith("instagram.com")) {
    const m = u.pathname.match(/^\/(?:[^/]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
    if (m) return { platform: "instagram", handle: null, id: m[2], kind: m[1] === "p" ? "post" : "reel", url: `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/` };
    return null;
  }
  return null;
}
export const videoKey = (v) => `${v.platform}-${v.id}`;
