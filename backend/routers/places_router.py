from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Path, Query

from models.places_models import CountryChoice, CountrySearchResponse
from services.places_service import NotACountryError, PlacesError, country_of_place, search_countries

# No login required: the sign-up form calls these before the account exists.
# Plain `def` handlers because they block on Google's API; FastAPI runs them in its thread pool.
router = APIRouter(prefix="/api/v1/places", tags=["Places"])

SESSION_PATTERN = r"^[A-Za-z0-9-]{8,64}$"
PLACE_ID_PATTERN = r"^[A-Za-z0-9_-]{10,512}$"


@router.get("/countries", response_model=CountrySearchResponse, summary="Search countries by name (countries only, no cities)")
def countries(
    q: str = Query(..., min_length=1, max_length=60, description="What the user has typed so far"),
    session: Optional[str] = Query(None, pattern=SESSION_PATTERN, description="One token per search, reused for the lookup"),
):
    text = q.strip()
    if not text:
        return CountrySearchResponse(countries=[])
    try:
        return CountrySearchResponse(countries=search_countries(text, session))
    except PlacesError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/countries/{place_id}", response_model=CountryChoice, summary="The 2-letter country code of a picked search result")
def country(
    place_id: str = Path(..., pattern=PLACE_ID_PATTERN),
    session: Optional[str] = Query(None, pattern=SESSION_PATTERN),
):
    try:
        return CountryChoice(**country_of_place(place_id, session))
    except NotACountryError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except PlacesError as e:
        raise HTTPException(status_code=502, detail=str(e))
