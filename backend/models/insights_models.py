"""
models/insights_models.py — response shapes for the Insights page
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Status = Literal["good", "warn", "bad", "info"]


# ── Website speed (Google PageSpeed Insights) ─────────────────────────────────
class SpeedMetric(BaseModel):
    key: str
    label: str                 # plain words, e.g. "Main content visible"
    value: str                 # already formatted, e.g. "2.4 s"
    status: Status = "info"


class SpeedFix(BaseModel):
    title: str                 # plain words, e.g. "Images are bigger than they need to be"
    action: str = ""           # what to do, e.g. "Compress images and use modern formats like WebP or AVIF."
    google_title: str = ""     # Google's own name, for the customer's developer; empty when same as title
    detail: str = ""           # Google's estimate, e.g. "Could save about 120 KiB"


class DeviceSpeed(BaseModel):
    score: Optional[int] = None                       # 0-100; None when this device's test failed
    status: Status = "info"
    lab: list[SpeedMetric] = Field(default_factory=list)
    field: list[SpeedMetric] = Field(default_factory=list)   # real Chrome visitors, last 28 days
    field_scope: Literal["page", "site", "none"] = "none"    # "none": too few visitors for Google's data
    fixes: list[SpeedFix] = Field(default_factory=list)
    error: Optional[str] = None


class SpeedReport(BaseModel):
    url: str
    checked_at: str            # ISO timestamp, UTC
    mobile: DeviceSpeed
    desktop: DeviceSpeed


class SpeedHistoryPoint(BaseModel):
    date: str                  # YYYY-MM-DD
    mobile: Optional[int] = None
    desktop: Optional[int] = None


class SpeedResponse(BaseModel):
    report: Optional[SpeedReport] = None               # None until the first test
    history: list[SpeedHistoryPoint] = Field(default_factory=list)
