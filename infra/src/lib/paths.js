import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const INFRA_ROOT = path.resolve(here, "..", "..");
export const CONTENT_ROOT = path.resolve(INFRA_ROOT, "..");
export const DATA = path.join(INFRA_ROOT, "data");
export const RAW = path.join(DATA, "raw");
export const VIDEOS = path.join(DATA, "videos");
export const MEDIA = path.join(DATA, "media");
export const TIKTOK = path.join(DATA, "tiktok");
export const INSTAGRAM = path.join(DATA, "instagram");
export const AUTHORS = path.join(TIKTOK, "authors");
export const ADS = path.join(DATA, "ads");
export const VEILLE = path.join(CONTENT_ROOT, "02_VEILLE");
export const CONFIG = path.join(INFRA_ROOT, "config");
