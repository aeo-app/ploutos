"""
models/db_models.py — Pydantic schemas for DynamoDB-backed endpoints
"""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Any, Optional


class TokenUsage(BaseModel):
    """Bedrock token usage measured for one flow — see
    services.bedrock_service.TokenUsageTracker for how this is accumulated
    (a single call for /profile, several for /full-report or
    /content-strategy, one per day for the relocation calendar, etc.)."""
    input_tokens:      int = 0
    output_tokens:     int = 0
    total_tokens:      int = 0
    bedrock_call_count: int = 0


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
    token_usage:   TokenUsage = TokenUsage()


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
    """Aggregate counts AND Bedrock token usage per analysis type ("per
    flow") for a user — see db.dynamo.get_user_stats."""
    user_id:            str
    total:              int
    by_type:            dict[str, int]
    token_usage_by_type: dict[str, TokenUsage] = {}
    token_usage_total:  TokenUsage = TokenUsage()


class DeleteResponse(BaseModel):
    deleted:     bool
    analysis_id: str
    message:     str
