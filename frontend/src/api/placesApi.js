import { ApiError } from "./authApi";
import { BASE } from "./seoApi";

// No auth headers: the sign-up form uses these before the account exists.
async function get(path) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`);
  } catch (_) {
    throw new ApiError("NetworkError", "Network error. Please check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof data.detail === "string" ? data.detail : "Country search is not available right now. Please try again in a moment.";
    throw new ApiError("PlacesError", message);
  }
  return data;
}

export const placesApi = {
  /** Countries whose name matches the text: { countries: [{ place_id, name }] }. Never cities or villages. */
  searchCountries: (text, session) => get(`/places/countries?${new URLSearchParams({ q: text, session })}`),
  /** The picked result's 2-letter code: { code: "IN", name: "India" }. */
  countryOf: (placeId, session) => get(`/places/countries/${encodeURIComponent(placeId)}?${new URLSearchParams({ session })}`),
};
