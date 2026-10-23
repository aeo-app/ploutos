import { ApiError } from "./authApi";
import { fetchImageBlob } from "./downloadImage";
import { BASE, checkAuthTokens, getAuthHeaders } from "./seoApi";

// Same error mapping as seoApi's post(): 402 -> PaymentRequired (AppContext.runApi
// turns that into the shared UnlockModal), 403 -> DomainMismatch, 401 -> TokenExpired.
async function call(method, path, body) {
  try {
    checkAuthTokens();
    const res = await fetch(`${BASE}/aeo${path}`, {
      method,
      headers: getAuthHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      localStorage.removeItem("id_token"); localStorage.removeItem("access_token"); localStorage.removeItem("user_id");
      throw new ApiError("TokenExpired", "Your session has expired. Please sign in again.");
    }
    if (res.status === 402) throw new ApiError("PaymentRequired", data?.detail || "Payment required to access this feature.");
    if (res.status === 403) throw new ApiError("DomainMismatch", data?.detail || "This account is linked to a different domain.");
    if (!res.ok) {
      const detail = Array.isArray(data?.detail) ? data.detail.map(d => d.msg).join("; ") : data?.detail;
      throw new ApiError(data?.code || "ServerError", detail || data?.message || `Request failed (${res.status})`);
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("ServerError", error.message || "Request failed");
  }
}

async function upload(path, file) {
  try {
    checkAuthTokens();
    const headers = getAuthHeaders();
    delete headers["Content-Type"]; // the browser sets the multipart boundary itself
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/aeo${path}`, { method: "POST", headers, body: form });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      localStorage.removeItem("id_token"); localStorage.removeItem("access_token"); localStorage.removeItem("user_id");
      throw new ApiError("TokenExpired", "Your session has expired. Please sign in again.");
    }
    if (!res.ok) throw new ApiError(data?.code || "ServerError", (Array.isArray(data?.detail) ? data.detail.map(d => d.msg).join("; ") : data?.detail) || `Upload failed (${res.status})`);
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("ServerError", error.message || "Upload failed");
  }
}

export const aeoApi = {
  prompts:     (req) => call("POST", "/prompts", req),
  strategy:    (req) => call("POST", "/strategy", req),
  blogDraft:   (req) => call("POST", "/blog-draft", req),
  socialPosts: (req) => call("POST", "/social-posts", req),
  siteChecks:  (url) => call("POST", "/site-checks", { url }),
  getState:    () => call("GET", "/state"),
  putState:    (patch) => call("PUT", "/state", patch),
  imageUrl:    (url) => call("POST", "/image-url", { url }),
  downloadBlob:(url) => fetchImageBlob("/aeo/image-download", { url }),
  editPost:    (prompt, channel, index, post, cycle = 0) => call("PUT", "/social-post", { prompt, channel, index, post, cycle }),
  teamIndex:   () => call("GET", "/team-index"),
  // Brand kit — logo + contact details printed on every generated image / Short
  getBrand:    () => call("GET", "/brand"),
  saveBrand:   (b) => call("PUT", "/brand", b),
  uploadLogo:  (file) => upload("/brand/logo", file),
  detectBrand: (url, company_name) => call("POST", "/brand/detect", { url, company_name }),
  logoFromSite:(image_url) => call("POST", "/brand/logo-from-site", { image_url }),
  // Calendar keywords
  suggestKeywords: (req) => call("POST", "/keywords/suggest", req),
  // YouTube Shorts (vertical video): generate in the background, or upload your own
  startShort:  (req) => call("POST", "/short-video", req),
  shortStatus: (id) => call("GET", `/short-video/${encodeURIComponent(id)}`),
  uploadShort: (file) => upload("/short-upload", file),
  linkSocial:  (platform, url) => call("PUT", "/social-links", { platform, url }),
  unlinkSocial:(platform) => call("DELETE", `/social-links/${encodeURIComponent(platform)}`),
};
