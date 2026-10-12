import { ApiError } from "./authApi";
import { BASE, checkAuthTokens, getAuthHeaders } from "./seoApi";

/** POSTs to one of our download endpoints and returns the image as a Blob. */
export async function fetchImageBlob(path, body) {
  checkAuthTokens();
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(body) });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new ApiError("ServerError", d?.detail || `Download failed (${res.status})`);
  }
  return res.blob();
}

const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" };

function save(blob, name) {
  const a = document.createElement("a");
  const href = URL.createObjectURL(blob);
  a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
}

/**
 * Saves a post image to the device. `viaServer` fetches our own stored images
 * through the API (no bucket CORS needed); data: and other URLs are fetched directly,
 * and as a last resort opened in a new tab.
 */
export async function downloadImage(src, baseName, viaServer) {
  const name = (ext) => `${(baseName || "post-image").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60)}.${ext}`;
  let blob = null;
  if (src && !src.startsWith("data:")) {
    try { blob = await viaServer(); } catch (_) { blob = null; }
  }
  if (!blob) {
    try { blob = await (await fetch(src)).blob(); } catch (_) { blob = null; }
  }
  if (!blob) { window.open(src, "_blank", "noopener"); return false; }
  save(blob, name(EXT[blob.type] || "png"));
  return true;
}
