from __future__ import annotations

from website_analyzer.competitors import BLOCKED_DOMAINS, _deduplicate, _build_queries
from website_analyzer.models import CompetitorResult, CompetitorSelection


class TestBuildQueries:
    def test_products_only(self):
        sel = CompetitorSelection(products=["CRM", "Analytics"])
        queries = _build_queries(sel)
        assert "CRM Analytics companies" in queries
        assert "top CRM Analytics providers" in queries

    def test_all_fields(self):
        sel = CompetitorSelection(
            products=["CRM"],
            categories=["Cloud"],
            terms=["enterprise"],
            audience=["SMB"],
        )
        queries = _build_queries(sel)
        assert len(queries) == 2
        assert all("CRM" in q for q in queries)

    def test_empty_selection_returns_empty(self):
        sel = CompetitorSelection(products=[""])
        queries = _build_queries(sel)
        assert queries == []


class TestDeduplicate:
    def test_removes_duplicates(self):
        r1 = CompetitorResult(name="A", domain="a.com", url="https://a.com", description="", source="t")
        r2 = CompetitorResult(name="A", domain="a.com", url="https://a.com", description="", source="t")
        result = _deduplicate([r1, r2])
        assert len(result) == 1

    def test_case_insensitive(self):
        r1 = CompetitorResult(name="A", domain="A.COM", url="https://a.com", description="", source="t")
        r2 = CompetitorResult(name="A", domain="a.com", url="https://a.com", description="", source="t")
        result = _deduplicate([r1, r2])
        assert len(result) == 1

    def test_keeps_unique(self):
        r1 = CompetitorResult(name="A", domain="a.com", url="https://a.com", description="", source="t")
        r2 = CompetitorResult(name="B", domain="b.com", url="https://b.com", description="", source="t")
        result = _deduplicate([r1, r2])
        assert len(result) == 2

    def test_empty_input(self):
        assert _deduplicate([]) == []

    def test_strips_whitespace(self):
        r1 = CompetitorResult(name="A", domain="  a.com  ", url="https://a.com", description="", source="t")
        result = _deduplicate([r1])
        assert len(result) == 1


class TestBlockedDomains:
    def test_common_blocked_present(self):
        assert "reddit.com" in BLOCKED_DOMAINS
        assert "wikipedia.org" in BLOCKED_DOMAINS
        assert "facebook.com" in BLOCKED_DOMAINS
        assert "linkedin.com" in BLOCKED_DOMAINS

    def test_both_www_and_root(self):
        assert "reddit.com" in BLOCKED_DOMAINS
        assert "www.reddit.com" in BLOCKED_DOMAINS
