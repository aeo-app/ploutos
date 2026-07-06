from pydantic import BaseModel, Field


class CompanyProfile(BaseModel):
    company_name: str = Field(description="Name of the company")
    domain_url: str = Field(description="Domain URL of the company website")
    business_domain: str = Field(description="Business domain / industry the company operates in")
    products: list[str] = Field(description="Products or services offered by the company")
    audience: list[str] = Field(description="Target audience or customer segments")
    categories: list[str] = Field(description="Business categories the company falls under")
    terms: list[str] = Field(description="Relevant terms or term combinations related to the business")


class UserConfig(BaseModel):
    website_analysis_enabled: bool = True
    competitor_search_enabled: bool = True
    schedule_generation_enabled: bool = True
