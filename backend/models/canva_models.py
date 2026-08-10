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
    brand_template_id: str
    design_id: str
    edit_url: str
    thumbnail_url: str
    image_field_values: dict = {}
    text_field_values: dict = {}
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PosterListResponse(BaseModel):
    items: list[PosterResponse]


class ExportPosterResponse(BaseModel):
    export_urls: list[str]
