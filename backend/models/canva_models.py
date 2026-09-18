"""
models/canva_models.py — Canva Connect API integration (posters for the
relocation social media calendar)
"""
from pydantic import BaseModel, Field
from typing import Optional


class CanvaStatusResponse(BaseModel):
    connected: bool


class CanvaConnectResponse(BaseModel):
    authorize_url: str


class BrandTemplateInfo(BaseModel):
    id: str
    title: str
    thumbnail_url: Optional[str] = None


class BrandTemplateFieldInfo(BaseModel):
    name: str
    type: str  # "text" | "image" | "chart"


class BrandTemplateDatasetResponse(BaseModel):
    brand_template_id: str
    fields: list[BrandTemplateFieldInfo]


class CreatePosterRequest(BaseModel):
    day_date: str = Field(..., example="2026-09-03")
    post_number: int = Field(..., ge=1, le=2)
    brand_template_id: str
    # Maps the brand template's autofillable field names (see
    # BrandTemplateDatasetResponse) to values. Image fields can be given
    # either as a URL we already host (image_urls — fetched and uploaded to
    # Canva server-side) or as an asset_id from a prior direct file upload
    # via POST /canva/assets/upload (image_asset_ids — the normal path for
    # a user picking a photo from their own device).
    text_fields: dict[str, str] = {}
    image_urls: dict[str, str] = {}
    image_asset_ids: dict[str, str] = {}


class RegeneratePosterRequest(BaseModel):
    """Recreates the poster from the SAME brand template with a new full set
    of field values — most commonly used to replace all the images, but text
    can be changed too. Canva's autofill always produces a new design per
    job (there's no "edit this exact image in place" operation), so this is
    the correct model for "replace images and recreate"."""
    text_fields: dict[str, str] = {}
    image_urls: dict[str, str] = {}
    image_asset_ids: dict[str, str] = {}


class AssetUploadResponse(BaseModel):
    asset_id: str
    name: str


class PosterResponse(BaseModel):
    poster_id: str
    day_date: str
    post_number: int
    # "openai" (the normal case — a poster is just the generated image,
    # no Canva design involved at all) or "canva" (an admin has since
    # sent it to Canva for editing — see EditInCanvaRequest below).
    source: str = "openai"
    poster_image_url: Optional[str] = None
    # Canva-specific fields — only populated once/if an admin has taken
    # the "edit in Canva" step. All optional now, unlike before, since a
    # poster no longer requires a Canva design to exist at all.
    brand_template_id: Optional[str] = None
    design_id: Optional[str] = None
    edit_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    image_field_values: dict = {}
    text_field_values: dict = {}
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PosterListResponse(BaseModel):
    items: list[PosterResponse]


class ExportPosterResponse(BaseModel):
    export_urls: list[str]


class GeneratePosterRequest(BaseModel):
    """The new primary poster-generation request — no Canva Brand
    Template, category/tone bias, or field values needed at all, since
    the resulting OpenAI image IS the poster directly. Deliberately does
    not change visual_suggestion's role or wording — it's still exactly
    what drives what the poster looks like, just handed to a different
    image-generation backend now (see services/openai_image_service.py).
    """
    day_date: str = Field(..., example="2026-09-03")
    post_number: int = Field(..., ge=1, le=2)
    visual_suggestion: str = Field(..., min_length=1, description="Used as the image generation prompt — unchanged in meaning, just now sent to OpenAI instead of Bedrock/Canva")
    caption: str = Field("", description="Stored as metadata on the poster record — not burned into the image itself, since there is no text-overlay/autofill step in this flow")
    cta: str = Field("", description="Same as caption — stored as metadata only")


class EditInCanvaRequest(BaseModel):
    """Admin-only: sends an existing, already-generated poster's image to
    Canva for manual editing. Does not generate a new image — this is
    strictly a follow-up step on a poster that already exists from
    GeneratePosterRequest above."""
    poster_id: str = Field(..., min_length=1)


class AutoGeneratePosterRequest(BaseModel):
    """Fully automatic poster generation for one calendar post — no
    brand_template_id or field values required. The system picks a Brand
    Template (rotating across the account's available templates, matched
    to category/tone where possible so the same category tends to land on
    the same template) and generates a genuinely new image from
    visual_suggestion via Bedrock, rather than reusing whatever image was
    manually uploaded last time. See services/canva_service.py's
    select_template_for_post and services/image_generation_service.py.

    NOT the primary poster-generation path anymore — see
    GeneratePosterRequest above, which is what the "Create Poster" button
    now calls for every user. Left in place, unused by the new flow,
    rather than deleted, in case anything else still depends on this
    Brand-Template-driven mechanism specifically."""
    day_date: str = Field(..., example="2026-09-03")
    post_number: int = Field(..., ge=1, le=2)
    visual_suggestion: str = Field(..., min_length=1, description="Used as the image generation prompt — this is what drives what the poster actually looks like")
    caption: str = Field(..., min_length=1)
    cta: str = Field("", description="Falls back to caption if a template has a separate CTA field and none is given")
    category: str = Field("", description="e.g. 'Educational', 'Practical Tips' — used to bias template selection, not required")
    tone: str = Field("", description="e.g. 'warm', 'confident' — used to bias template selection, not required")

