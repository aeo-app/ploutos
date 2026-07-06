from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from api import app, config_store
from tests.test_store import InMemoryStore
from website_analyzer.deps import require_auth
from website_analyzer.models import CompetitorGroup, CompetitorResult, CompetitorSelection


def _override_auth() -> dict:
    return {"sub": "u1", "email": "a@b.com"}


def _setup_inmemory_config():
    import api
    api.config_store = InMemoryStore()
    api.config_store.put("u1", api.CONFIG_SK, {
        "website_analysis_enabled": True,
        "competitor_search_enabled": True,
        "schedule_generation_enabled": True,
    })


def test_health(client: TestClient):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


class TestAuth:
    @patch("api.register_user")
    def test_register(self, mock_register: Any, client: TestClient):
        mock_register.return_value = {"message": "Code sent", "email": "a@b.com"}
        resp = client.post("/auth/register", json={"name": "A", "email": "a@b.com"})
        assert resp.status_code == 200
        assert resp.json()["email"] == "a@b.com"

    @patch("api.register_user")
    def test_register_existing(self, mock_register: Any, client: TestClient):
        mock_register.side_effect = ValueError("already exists")
        resp = client.post("/auth/register", json={"name": "A", "email": "a@b.com"})
        assert resp.status_code == 400

    @patch("api.verify_user")
    def test_verify(self, mock_verify: Any, client: TestClient):
        mock_verify.return_value = {
            "access_token": "at",
            "refresh_token": "rt",
            "id_token": "it",
            "expires_in": 3600,
            "token_type": "Bearer",
        }
        resp = client.post("/auth/verify", json={"email": "a@b.com", "code": "123456"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["access_token"] == "at"
        assert data["id_token"] == "it"

    @patch("api.verify_user")
    def test_verify_bad_code(self, mock_verify: Any, client: TestClient):
        mock_verify.side_effect = ValueError("Invalid verification code")
        resp = client.post("/auth/verify", json={"email": "a@b.com", "code": "wrong"})
        assert resp.status_code == 400

    @patch("api.request_otp")
    def test_login_request_otp(self, mock_otp: Any, client: TestClient):
        mock_otp.return_value = {"message": "OTP sent", "email": "a@b.com"}
        resp = client.post("/auth/login", json={"email": "a@b.com"})
        assert resp.status_code == 200

    @patch("api.request_otp")
    def test_login_request_otp_not_found(self, mock_otp: Any, client: TestClient):
        mock_otp.side_effect = ValueError("No account found with this email.")
        resp = client.post("/auth/login", json={"email": "nobody@example.com"})
        assert resp.status_code == 400

    @patch("api.verify_otp")
    def test_login_verify(self, mock_verify: Any, client: TestClient):
        mock_verify.return_value = {
            "access_token": "at",
            "refresh_token": "rt",
            "id_token": "it",
            "expires_in": 3600,
            "token_type": "Bearer",
        }
        resp = client.post("/auth/login/verify", json={"email": "a@b.com", "code": "123456"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    @patch("api.verify_otp")
    def test_login_verify_bad_code(self, mock_verify: Any, client: TestClient):
        mock_verify.side_effect = ValueError("Invalid OTP code.")
        resp = client.post("/auth/login/verify", json={"email": "a@b.com", "code": "wrong"})
        assert resp.status_code == 400

    @patch("api.refresh_access_token")
    def test_refresh(self, mock_refresh: Any, client: TestClient):
        mock_refresh.return_value = {
            "access_token": "new_at",
            "expires_in": 3600,
            "token_type": "Bearer",
        }
        resp = client.post("/auth/refresh", json={"refresh_token": "rt"})
        assert resp.status_code == 200
        assert resp.json()["access_token"] == "new_at"

    @patch("api.refresh_access_token")
    def test_refresh_fails(self, mock_refresh: Any, client: TestClient):
        mock_refresh.side_effect = ValueError("Token refresh failed")
        resp = client.post("/auth/refresh", json={"refresh_token": "bad"})
        assert resp.status_code == 400


class TestAnalyze:
    def setup_method(self):
        app.dependency_overrides[require_auth] = _override_auth
        _setup_inmemory_config()

    def teardown_method(self):
        app.dependency_overrides.clear()

    @patch("api.crawl_website", new_callable=AsyncMock)
    @patch("api.generate_search_queries", new_callable=AsyncMock)
    @patch("api.analyze_company", new_callable=AsyncMock)
    def test_analyze(
        self,
        mock_analyze: Any,
        mock_queries: Any,
        mock_crawl: Any,
        client: TestClient,
    ):
        mock_crawl.return_value = "page content"
        mock_queries.return_value = []

        class FakeProfile:
            def model_dump(self):
                return {
                    "company_name": "Acme",
                    "domain_url": "https://acme.com",
                    "business_domain": "tech",
                    "products": [],
                    "audience": [],
                    "categories": [],
                    "terms": [],
                }

        mock_analyze.return_value = FakeProfile()

        resp = client.post(
            "/analyze",
            json={"url": "https://acme.com", "max_terms": 5},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["company_name"] == "Acme"

    def test_analyze_no_url(self, client: TestClient):
        resp = client.post(
            "/analyze",
            json={"url": "", "max_terms": 5},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 400

    @patch("api.analyze_store")
    def test_get_cached_analyze_not_found(self, mock_store: Any, client: TestClient):
        mock_store.get.return_value = None
        resp = client.get("/analyze/https://acme.com", headers={"Authorization": "Bearer test"})
        assert resp.status_code == 404

    @patch("api.analyze_store")
    def test_get_cached_analyze_found(self, mock_store: Any, client: TestClient):
        mock_store.get.return_value = {
            "data": {"company_name": "Acme", "products": []},
            "updatedAt": "2026-07-01T00:00:00+00:00",
        }
        resp = client.get("/analyze/https://acme.com", headers={"Authorization": "Bearer test"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["profile"]["company_name"] == "Acme"
        assert "updatedAt" in data

    @patch("api.crawl_website", new_callable=AsyncMock)
    def test_analyze_crawl_fails(self, mock_crawl: Any, client: TestClient):
        mock_crawl.side_effect = RuntimeError("crawl failed")
        resp = client.post(
            "/analyze",
            json={"url": "https://acme.com"},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 400
        assert "crawl" in resp.json()["detail"].lower()


class TestCompetitors:
    def setup_method(self):
        app.dependency_overrides[require_auth] = _override_auth
        _setup_inmemory_config()

    def teardown_method(self):
        app.dependency_overrides.clear()

    @patch("api.search_competitors", new_callable=AsyncMock)
    def test_competitors(self, mock_search: Any, client: TestClient):
        mock_search.return_value = [
            CompetitorGroup(
                selection=CompetitorSelection(products=["CRM"]),
                companies=[
                    CompetitorResult(name="Rival", domain="rival.com", url="https://rival.com", description="A rival", source="tavily"),
                ],
            )
        ]

        resp = client.post(
            "/competitors",
            json={"selections": [{"products": ["CRM"]}], "max_results": 5},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "results" in data
        assert len(data["results"]) == 1

    def test_competitors_empty_selections(self, client: TestClient):
        resp = client.post(
            "/competitors",
            json={"selections": [], "max_results": 5},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 400


class TestAnalyzeStream:
    def setup_method(self):
        app.dependency_overrides[require_auth] = _override_auth
        _setup_inmemory_config()

    def teardown_method(self):
        app.dependency_overrides.clear()

    @patch("api.crawl_website", new_callable=AsyncMock)
    @patch("api.generate_search_queries", new_callable=AsyncMock)
    @patch("api.format_search_context")
    @patch("api.analyze_company", new_callable=AsyncMock)
    def test_stream_returns_events(
        self,
        mock_analyze: Any,
        mock_format: Any,
        mock_queries: Any,
        mock_crawl: Any,
        client: TestClient,
    ):
        mock_crawl.return_value = "page content"
        mock_queries.return_value = []
        mock_format.return_value = ""

        class FakeProfile:
            def model_dump(self):
                return {
                    "company_name": "Acme",
                    "domain_url": "https://acme.com",
                    "business_domain": "tech",
                    "products": [],
                    "audience": [],
                    "categories": [],
                    "terms": [],
                }

        mock_analyze.return_value = FakeProfile()

        resp = client.post(
            "/analyze/stream",
            json={"url": "https://acme.com", "max_terms": 5},
            headers={"Authorization": "Bearer test"},
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
