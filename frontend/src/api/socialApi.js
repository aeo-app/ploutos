import { withTokenExpiry, ApiError } from "./authApi"; // shared ApiError class
import { BASE, checkAuthTokens, getAuthHeaders } from "./seoApi"; // reuse the same auth plumbing

// 🔹 Generic POST helper (mirrors seoApi.js's post())
async function post(path, body) {
  try {
    checkAuthTokens();
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      localStorage.removeItem("id_token");
      localStorage.removeItem("access_token");
      localStorage.removeItem("user_id");
      throw new ApiError("TokenExpired", "Your session has expired. Please sign in again.");
    }
    if (!res.ok) {
      const errorCode = data?.code || data?.error_code || "ServerError";
      const errorMessage = data?.detail || data?.message || `Request failed (${res.status})`;
      throw new ApiError(errorCode, errorMessage);
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("ServerError", error.message || "Request failed");
  }
}

export const socialApi = {
  relocationCalendar: (req) => post("/social/relocation-calendar", req),

  /**
   * Streams POST /social/relocation-calendar/stream as Server-Sent Events.
   * Same manual SSE-over-fetch approach as seoApi.contentStrategyStream —
   * see that function's comment for why native EventSource can't be used.
   *
   * @param {object} req - RelocationSocialRequest body
   * @param {(event: string, data: any) => void} onEvent
   * @param {AbortSignal} [signal]
   */
  relocationCalendarStream: async (req, onEvent, signal) => {
    checkAuthTokens();
    const res = await fetch(`${BASE}/social/relocation-calendar/stream`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(req),
      signal,
    });

    if (res.status === 401) {
      localStorage.removeItem("id_token");
      localStorage.removeItem("access_token");
      localStorage.removeItem("user_id");
      throw new ApiError("TokenExpired", "Your session has expired. Please sign in again.");
    }
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(
        data?.code || "ServerError",
        data?.detail || data?.message || `Request failed (${res.status})`
      );
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        let eventName = "message";
        let dataLines = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length === 0) continue;

        let payload;
        try {
          payload = JSON.parse(dataLines.join("\n"));
        } catch {
          continue;
        }
        onEvent(eventName, payload);
      }
    }
  },
};

export { withTokenExpiry };
