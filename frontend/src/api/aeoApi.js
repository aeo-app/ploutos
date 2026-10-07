import { ApiError } from "./authApi";
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

export const aeoApi = {
  prompts:     (req) => call("POST", "/prompts", req),
  strategy:    (req) => call("POST", "/strategy", req),
  blogDraft:   (req) => call("POST", "/blog-draft", req),
  socialPosts: (req) => call("POST", "/social-posts", req),
  siteChecks:  (url) => call("POST", "/site-checks", { url }),
  getState:    () => call("GET", "/state"),
  putState:    (patch) => call("PUT", "/state", patch),
  linkSocial:  (platform, url) => call("PUT", "/social-links", { platform, url }),
  unlinkSocial:(platform) => call("DELETE", `/social-links/${encodeURIComponent(platform)}`),
};
