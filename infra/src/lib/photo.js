// Carrousels photo TikTok : yt-dlp ne renvoie que l'audio. On lit la page pour récupérer les images (imagePost).
import fs from "node:fs";
import path from "node:path";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
export async function fetchPhotoPost(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" } });
  const html = await r.text();
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/s);
  if (!m) throw new Error("données de page introuvables (blocage ?)");
  const j = JSON.parse(m[1]);
  const item = j?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;
  if (!item?.imagePost) throw new Error("pas un carrousel photo");
  return { title: item.imagePost.title || "", images: item.imagePost.images.map((im) => im.imageURL?.urlList?.[0]).filter(Boolean), cover: item.imagePost.cover?.imageURL?.urlList?.[0] || null };
}
export async function downloadPhotoPost(url, dir) {
  const p = await fetchPhotoPost(url);
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const [i, src] of p.images.entries()) {
    const r = await fetch(src, { headers: { "User-Agent": UA } });
    if (!r.ok) continue;
    fs.writeFileSync(path.join(dir, `img_${String(i + 1).padStart(2, "0")}.jpg`), Buffer.from(await r.arrayBuffer()));
    n++;
  }
  fs.writeFileSync(path.join(dir, "post.json"), JSON.stringify(p, null, 2));
  return { ...p, saved: n };
}
