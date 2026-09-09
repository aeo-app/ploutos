import { ApiError } from "./authApi";
import { BASE, checkAuthTokens, getAuthHeaders } from "./seoApi";

async function get(path) {
  return _handle(() => fetch(`${BASE}${path}`, { method: "GET", headers: getAuthHeaders() }));
}

async function post(path, body) {
  return _handle(() => fetch(`${BASE}${path}`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }));
}

async function _handle(doFetch) {
  try {
    checkAuthTokens();
    const res = await doFetch();
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      localStorage.removeItem("id_token");
      localStorage.removeItem("access_token");
      localStorage.removeItem("user_id");
      throw new ApiError("TokenExpired", "Your session has expired. Please sign in again.");
    }
    if (res.status === 428) {
      // Distinct from a generic error — the frontend should prompt
      // "Connect Canva" specifically, not show a generic failure.
      throw new ApiError("CanvaNotConnected", data?.detail || "Canva is not connected yet.");
    }
    if (!res.ok) {
      throw new ApiError(data?.code || "ServerError", data?.detail || data?.message || `Request failed (${res.status})`);
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("ServerError", error.message || "Request failed");
  }
}

export const canvaApi = {
  connect: () => get("/canva/connect"),
  status: () => get("/canva/status"),
  brandTemplates: () => get("/canva/brand-templates"),
  brandTemplateDataset: (brandTemplateId) => get(`/canva/brand-templates/${encodeURIComponent(brandTemplateId)}/dataset`),

  /** @param {File} file - a browser File object (e.g. from an <input type="file">) */
  uploadAsset: async (file) => {
    try {
      checkAuthTokens();
      const headers = getAuthHeaders();
      delete headers["Content-Type"]; // let the browser set the multipart boundary itself
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${BASE}/canva/assets/upload`, { method: "POST", headers, body: form });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem("id_token"); localStorage.removeItem("access_token"); localStorage.removeItem("user_id");
        throw new ApiError("TokenExpired", "Your session has expired. Please sign in again.");
      }
      if (res.status === 428) throw new ApiError("CanvaNotConnected", data?.detail || "Canva is not connected yet.");
      if (!res.ok) throw new ApiError(data?.code || "ServerError", data?.detail || `Upload failed (${res.status})`);
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError("ServerError", error.message || "Upload failed");
    }
  },

  /** @param {object} req - {day_date, post_number, brand_template_id, text_fields, image_urls, image_asset_ids} */
  createPoster: (req) => post("/canva/posters", req),
  /** @param {object} req - {day_date, post_number, visual_suggestion, caption, cta?, category?, tone?} - no template/image selection needed, the backend picks a template and generates a unique image */
  autoGeneratePoster: (req) => post("/canva/posters/auto-generate", req),
  /** @param {object} req - {text_fields, image_urls, image_asset_ids} — only send what's changing */
  regeneratePoster: (posterId, req) => post(`/canva/posters/${encodeURIComponent(posterId)}/regenerate`, req),
  listPosters: () => get("/canva/posters"),
  exportPoster: (posterId) => post(`/canva/posters/${encodeURIComponent(posterId)}/export`),
};
