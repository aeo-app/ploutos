from __future__ import annotations

from pydantic import BaseModel


class CountryOption(BaseModel):
    place_id: str
    name: str


class CountrySearchResponse(BaseModel):
    countries: list[CountryOption]


class CountryChoice(BaseModel):
    code: str
    name: str
