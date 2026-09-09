"""
models/blog_models.py — SEO-informed blog topic planning + generation.

Two-step flow, mirroring the keyword picker in content-strategy:
  1. POST /blog/suggest-topics — given the company's SEO profile, get a list
     of topic ideas (title, angle, target keyword).
  2. POST /blog/generate — pick one suggested (or custom) topic, get a full,
     ready-to-publish blog post for it (reuses GeneratedContentPiece, same
     shape content-strategy already produces per keyword).
"""
from pydantic import BaseModel, Field

from models.seo_models import GeneratedContentPiece


class BlogTopicSuggestion(BaseModel):
    title: str
    angle: str            # one sentence on why this topic / what it covers
    target_keyword: str
    locked: bool = False  # zero-cost placeholder slot for unpaid users — see the
                           # free-preview pattern already used across the other
                           # single-call analyses (services/bedrock_service.py)


class SuggestBlogTopicsRequest(BaseModel):
    company_name: str = Field(..., example="Your Company")
    url: str = Field(..., example="https://www.example.com")
    market: str = Field(..., example="Austin, Texas")
    industry: str = Field(..., example="Bakery & Café")
    count: int = Field(8, ge=3, le=15, description="How many topic ideas to suggest")


class SuggestBlogTopicsResponse(BaseModel):
    company: str
    url: str
    topics: list[BlogTopicSuggestion]


class GenerateBlogRequest(BaseModel):
    company_name: str
    url: str
    market: str
    industry: str
    topic: str = Field(..., example="Moving to Germany from Singapore: A Complete Checklist")
    target_keyword: str = Field("", example="moving to Germany from Singapore")


class GenerateBlogResponse(BaseModel):
    topic: str
    target_keyword: str
    post: GeneratedContentPiece
