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
    if (res.status === 429) throw new ApiError("AnalysisLimit", data?.detail || "You have reached the limit for now. Please try again later.");
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
    form.append("file", file, file.name || "photo.jpg");
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

/** The analysis asks every prompt to each AI tool for real, which takes a few minutes, so the backend runs it as a job:
 *  start it, then poll until the result is ready. Resolves with the same result shape as before. */
const ANALYSIS_POLL_MS = 5000;
const ANALYSIS_TIMEOUT_MS = 20 * 60 * 1000;
async function runAnalysisJob(req) {
  const { job_id: jobId } = await call("POST", "/prompts", req);
  const until = Date.now() + ANALYSIS_TIMEOUT_MS;
  while (Date.now() < until) {
    await new Promise(resolve => setTimeout(resolve, ANALYSIS_POLL_MS));
    const job = await call("GET", `/prompts/job/${encodeURIComponent(jobId)}`);
    if (job.status === "done") return job.result;
    if (job.status === "error") throw new ApiError("ServerError", job.error || "The analysis could not finish. Please try again.");
  }
  throw new ApiError("ServerError", "The analysis is taking longer than usual. Please refresh the page in a few minutes.");
}

export const aeoApi = {
  prompts:     (req) => runAnalysisJob(req),
  answers:     (prompt) => call("GET", `/answers?prompt=${encodeURIComponent(prompt)}`),
  strategy:    (req) => call("POST", "/strategy", req),
  blogDraft:   (req) => call("POST", "/blog-draft", req),
  seoStrategy: (req) => call("POST", "/seo-strategy", req),
  seoStrategySaved: (keyword) => call("GET", `/seo-strategy?keyword=${encodeURIComponent(keyword)}`),
  seoContent:  (req) => call("POST", "/seo-content", req),
  seoPage:     (req) => call("POST", "/seo-page", req),
  seoPages:    (keyword) => call("GET", `/seo-pages?keyword=${encodeURIComponent(keyword)}`),
  strategyPage: (req) => call("POST", "/strategy/page", req),
  siteStyle: (url, company_name) => call("POST", "/site-style", { url, company_name: company_name || "Company" }),
  strategyPages: (prompt) => call("GET", `/strategy/pages?prompt=${encodeURIComponent(prompt)}`),
  editBlog:    (req) => call("PUT", "/blog-draft", req),
  socialPosts: (req) => call("POST", "/social-posts", req),
  siteChecks:  (url) => call("POST", "/site-checks", { url }),
  siteChecksSaved: () => call("GET", "/site-checks"),
  // Insights page — real measurements of the customer's own website
  speedTest:    () => call("GET", "/insights/speed"),
  runSpeedTest: () => call("POST", "/insights/speed"),
  posterStatus: (week) => call("GET", `/poster-status${week == null ? "" : `?week=${week}`}`),
  getState:    () => call("GET", "/state"),
  putState:    (patch) => call("PUT", "/state", patch),
  imageUrl:    (url) => call("POST", "/image-url", { url }),
  downloadBlob:(url) => fetchImageBlob("/aeo/image-download", { url }),
  editPost:    (prompt, channel, index, post, cycle = 0) => call("PUT", "/social-post", { prompt, channel, index, post, cycle }),
  teamIndex:   () => call("GET", "/team-index"),
  analysisQuota: () => call("GET", "/analysis-quota"),
  // Brand kit — logo + contact details printed on every generated image / Short
  getBrand:    () => call("GET", "/brand"),
  saveBrand:   (b) => call("PUT", "/brand", b),
  uploadLogo:  (file) => upload("/brand/logo", file),
  detectBrand: (url, company_name) => call("POST", "/brand/detect", { url, company_name }),
  logoFromSite:(image_url) => call("POST", "/brand/logo-from-site", { image_url }),
  // Calendar keywords
  suggestKeywords: (req) => call("POST", "/keywords/suggest", req),
  siteKeywords: (req) => call("POST", "/keywords/site", req),
  // YouTube Shorts (vertical video): generate in the background, or upload your own
  startShort:  (req) => call("POST", "/short-video", req),
  shortStatus: (id) => call("GET", `/short-video/${encodeURIComponent(id)}`),
  reelOptions: () => call("GET", "/reel-options"),
  uploadShort: (file) => upload("/short-upload", file),
  // One of the customer's own photos (already shrunk by utils/photoPrep) to build an image or reel from
  uploadPhoto: (blob) => upload("/photos", blob),
  linkSocial:  (platform, url) => call("PUT", "/social-links", { platform, url }),
  unlinkSocial:(platform) => call("DELETE", `/social-links/${encodeURIComponent(platform)}`),
};
