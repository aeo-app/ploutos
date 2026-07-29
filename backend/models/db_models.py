"""
models/db_models.py — Pydantic schemas for DynamoDB-backed endpoints
"""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Any, Optional


class AnalysisMeta(BaseModel):
    """Lightweight summary row — used in list responses (no full result payload)."""
    analysis_id:   str
    analysis_type: str
    company_name:  str
    url:           str
    market:        str
    industry:      str
    created_at:    str
    status:        str


class AnalysisRecord(AnalysisMeta):
    """Full record including the result payload and original request."""
    result:  Any              # deserialised analysis result (dict)
    request: dict[str, Any]   # original AnalyseRequest fields


class SavedAnalysisResponse(BaseModel):
    """Returned by every analysis endpoint after successful DB save."""
    analysis_id: str
    message:     str = "Analysis saved to DynamoDB"
    user_id:     str


class ListAnalysesResponse(BaseModel):
    """Paginated list of analyses for a user."""
    user_id:            str
    items:              list[AnalysisMeta]
    count:              int
    last_evaluated_key: Optional[dict] = None   # pass back for next page


class UserStatsResponse(BaseModel):
    """Aggregate counts per analysis type for a user."""
    user_id: str
    total:   int
    by_type: dict[str, int]


class DeleteResponse(BaseModel):
    deleted:     bool
    analysis_id: str
    message:     str
