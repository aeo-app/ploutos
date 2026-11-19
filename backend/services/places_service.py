from __future__ import annotations

import logging
import os

import requests

logger = logging.getLogger(__name__)

AUTOCOMPLETE_URL = "https://maps.googleapis.com/maps/api/place/autocomplete/json"
DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"
TIMEOUT_SECONDS = 8.0
UNAVAILABLE = "Country search is not available right now. Please try again in a moment."


class PlacesError(Exception):
    pass


class NotACountryError(PlacesError):
    pass


def search_countries(text: str, session: str | None) -> list[dict]:
    data = _call_google(AUTOCOMPLETE_URL, {"input": text, "types": "country", "language": "en", "sessiontoken": session})
    return [
        {"place_id": p["place_id"], "name": (p.get("structured_formatting") or {}).get("main_text") or p["description"]}
        for p in data.get("predictions", [])
    ]


def country_of_place(place_id: str, session: str | None) -> dict:
    # Same session token as the searches, so Google bills the searches and this lookup as one session
    data = _call_google(DETAILS_URL, {"place_id": place_id, "fields": "address_components", "language": "en", "sessiontoken": session})
    for part in (data.get("result") or {}).get("address_components", []):
        if "country" in part.get("types", []):
            return {"code": part["short_name"], "name": part["long_name"]}
    raise NotACountryError("Please pick a country from the list.")


def _call_google(url: str, params: dict) -> dict:
    key = os.getenv("GOOGLE_MAPS_API_KEY", "")
    if not key:
        logger.error("[places] GOOGLE_MAPS_API_KEY is not set")
        raise PlacesError(UNAVAILABLE)
    try:
        response = requests.get(url, params={**{k: v for k, v in params.items() if v}, "key": key}, timeout=TIMEOUT_SECONDS)
        data = response.json()
    except (requests.RequestException, ValueError) as e:
        # Only the error type is logged: requests puts the full URL, API key included, in its error text
        logger.error(f"[places] request to Google failed: {type(e).__name__}")
        raise PlacesError(UNAVAILABLE) from None
    status = data.get("status")
    if status in ("OK", "ZERO_RESULTS"):
        return data
    if status == "NOT_FOUND":
        raise NotACountryError("Please pick a country from the list.")
    logger.error(f"[places] Google returned {status}: {data.get('error_message', '')}")
    raise PlacesError(UNAVAILABLE)
