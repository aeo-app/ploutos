from __future__ import annotations

from collections.abc import Generator
from typing import Any

import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient

from api import app
from website_analyzer.models import CompanyProfile

load_dotenv()


@pytest.fixture
def client() -> Generator[TestClient, Any, None]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def sample_profile() -> CompanyProfile:
    return CompanyProfile(
        company_name="TestCorp",
        domain_url="https://testcorp.com",
        business_domain="SaaS",
        products=["CRM", "Analytics"],
        audience=["Enterprise", "SMB"],
        categories=["Cloud Software"],
        terms=["customer relationship", "business intelligence"],
    )
