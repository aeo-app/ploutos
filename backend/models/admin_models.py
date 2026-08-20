"""
models/admin_models.py — Admin panel: user directory + reviewing/editing
every user's saved relocation social media calendars ("scheduling") and
blog posts, including AI-assisted revisions from admin-supplied instructions.
"""
from pydantic import BaseModel, Field
from typing import Optional


class UserSummary(BaseModel):
    user_id: str
    email: str
    full_name: str
    company_name: str
    domain: str
    created_at: str
    is_admin: bool = False
    is_paid: bool = False


class UserListResponse(BaseModel):
    users: list[UserSummary]


class SetAdminRequest(BaseModel):
    is_admin: bool


# ── Calendars ("scheduling") ─────────────────────────────────────────────────
class AdminCalendarSummary(BaseModel):
    analysis_id: str
    user_id: str
    company_name: str
    country: str  # stored under the generic "market" field — see routers/social_router.py's _save_social
    created_at: str
    status: str


class AdminCalendarListResponse(BaseModel):
    items: list[AdminCalendarSummary]


class AdminCalendarDetailResponse(BaseModel):
    analysis_id: str
    user_id: str
    company_name: str
    country: str
    created_at: str
    status: str
    result: dict   # the saved RelocationSocialResponse payload
    request: dict  # the original RelocationSocialRequest that generated it


class UpdateCalendarRequest(BaseModel):
    result: dict  # the full, edited RelocationSocialResponse payload to save


class ReviseCalendarPostRequest(BaseModel):
    """Admin-assisted edit: point at one post inside a saved calendar by
    date + post_number, give a free-text instruction, and the backend asks
    Bedrock to revise just that post (preserving everything else)."""
    date: str = Field(..., example="2026-09-03")
    post_number: int = Field(..., ge=1, le=2)
    instruction: str = Field(..., min_length=1, example="Make the Instagram caption punchier and mention our new Dubai office.")


# ── Blogs ────────────────────────────────────────────────────────────────────
class AdminBlogSummary(BaseModel):
    analysis_id: str
    user_id: str
    company_name: str
    created_at: str
    status: str
    # No `topic` here — the blog's topic lives inside its `result` blob, not
    # in the list-level metadata (see db.dynamo.list_analyses), so showing
    # it would mean an extra fetch per row. It's available in the detail
    # view below instead.


class AdminBlogListResponse(BaseModel):
    items: list[AdminBlogSummary]


class AdminBlogDetailResponse(BaseModel):
    analysis_id: str
    user_id: str
    company_name: str
    created_at: str
    status: str
    result: dict   # the saved GenerateBlogResponse payload ({topic, target_keyword, post})
    request: dict  # the original GenerateBlogRequest that generated it


class UpdateBlogRequest(BaseModel):
    result: dict  # the full, edited GenerateBlogResponse payload to save


class ReviseBlogRequest(BaseModel):
    """Admin-assisted edit for a whole blog post — same free-text-instruction
    model as ReviseCalendarPostRequest, just no date/post_number targeting
    needed since a blog post isn't nested inside a calendar."""
    instruction: str = Field(..., min_length=1, example="Add a short section about visa requirements before the conclusion.")


class CreateBlogForUserRequest(BaseModel):
    """Admin creates a brand-new blog post ON BEHALF OF a specific customer
    — saved under THAT user's account (not the admin's own), using the
    customer's own company/market/industry plus the admin's topic and
    instruction. This is genuinely different from POST /blog/generate
    (which always saves under whoever is calling it) — an admin calling
    that endpoint would create the post under their OWN account, not the
    customer's, which is why this dedicated admin endpoint exists."""
    topic: str = Field(..., min_length=1, example="Moving to Germany from Singapore: A Complete Checklist")
    target_keyword: str = Field("", example="moving to Germany from Singapore")
    instruction: str = Field(
        "", example="Focus on the visa process and mention our 24/7 support line.",
        description="Optional extra guidance beyond the topic itself — folded into the generation prompt.",
    )


class CreateCalendarForUserRequest(BaseModel):
    """Admin creates a brand-new relocation social media calendar ON BEHALF
    OF a specific customer — saved under THAT user's account, same
    "create, not just revise" capability CreateBlogForUserRequest gives for
    blogs. Company contact details default to the customer's own registry
    info if left blank, but can be overridden here."""
    country: str = Field(..., min_length=1, example="Canada")
    start_date: str = Field(..., example="2026-09-01", description="YYYY-MM-DD, inclusive")
    end_date: str = Field(..., example="2026-09-14", description="YYYY-MM-DD, inclusive")
    phone: str = Field("", example="+65 6520 1914")
    email: str = Field("", example="contact@example.com")
    website: str = Field("", example="www.example.com")
    instagram: str = ""
    facebook: str = ""
    linkedin: str = ""
    content_suggestions: str = Field(
        "", max_length=2000, example="Focus more on families with school-age kids.",
        description="Optional free-text guidance — same field as the regular user-facing calendar form.",
    )
