from __future__ import annotations

import pytest
from pydantic import ValidationError

from website_analyzer.models import (
    CompanyProfile,
    CompetitorGroup,
    CompetitorResult,
    CompetitorSelection,
    FilteredCompanyList,
    SearchQuery,
    SearchQueryList,
)


class TestCompanyProfile:
    def test_minimal(self):
        p = CompanyProfile(
            company_name="Acme",
            domain_url="https://acme.com",
            business_domain="widgets",
            products=[],
            audience=[],
            categories=[],
            terms=[],
        )
        assert p.company_name == "Acme"
        assert p.products == []

    def test_full(self):
        p = CompanyProfile(
            company_name="Acme",
            domain_url="https://acme.com",
            business_domain="widgets",
            products=["Widget Pro"],
            audience=["Enterprise"],
            categories=["Manufacturing"],
            terms=["widget", "gadget"],
        )
        assert len(p.products) == 1
        assert len(p.terms) == 2

    def test_required_fields(self):
        with pytest.raises(ValidationError):
            CompanyProfile()


class TestCompetitorSelection:
    def test_at_least_one_field(self):
        sel = CompetitorSelection(products=["foo"])
        assert sel.products == ["foo"]

    def test_empty_raises(self):
        with pytest.raises(ValidationError):
            CompetitorSelection()

    def test_audience_only(self):
        sel = CompetitorSelection(audience=["devs"])
        assert sel.audience == ["devs"]


class TestCompetitorResult:
    def test_minimal(self):
        r = CompetitorResult(
            name="Rival",
            domain="rival.com",
            url="https://rival.com",
            description="A rival",
            source="tavily",
        )
        assert r.name == "Rival"
        assert r.source == "tavily"

    def test_defaults(self):
        r = CompetitorResult(
            name="Rival",
            domain="rival.com",
            url="https://rival.com",
            description="",
            source="",
        )
        assert r.description == ""


class TestCompetitorGroup:
    def test_group(self, sample_profile):
        sel = CompetitorSelection(products=sample_profile.products)
        r = CompetitorResult(
            name="Rival",
            domain="rival.com",
            url="https://rival.com",
            description="desc",
            source="tavily",
        )
        g = CompetitorGroup(selection=sel, companies=[r])
        assert len(g.companies) == 1
        assert g.companies[0].domain == "rival.com"


class TestFilteredCompanyList:
    def test_empty(self):
        fl = FilteredCompanyList(companies=[])
        assert fl.companies == []

    def test_with_items(self):
        r = CompetitorResult(
            name="Rival",
            domain="rival.com",
            url="https://rival.com",
            description="desc",
            source="ddg",
        )
        fl = FilteredCompanyList(companies=[r])
        assert fl.companies[0].source == "ddg"


class TestSearchQuery:
    def test_query(self):
        q = SearchQuery(query="foo bar", reason="test")
        assert q.query == "foo bar"
        assert q.reason == "test"


class TestSearchQueryList:
    def test_queries(self):
        ql = SearchQueryList(queries=[
            SearchQuery(query="q1", reason="r1"),
            SearchQuery(query="q2", reason="r2"),
        ])
        assert len(ql.queries) == 2
