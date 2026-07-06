from __future__ import annotations

import pytest

from website_analyzer.search_sources import get_source, list_sources, register_source
from website_analyzer.search_sources.base import SearchSource
from website_analyzer.search_sources.tavily_source import _extract_domain as tavily_extract
from website_analyzer.search_sources.duckduckgo_source import _extract_domain as ddg_extract


class TestExtractDomain:
    def test_simple_url(self):
        assert tavily_extract("https://example.com/page") == "example.com"

    def test_with_subdomain(self):
        assert ddg_extract("https://sub.example.co.uk/path") == "sub.example.co.uk"

    def test_no_scheme_returns_empty(self):
        assert tavily_extract("example.com") == ""

    def test_empty(self):
        assert ddg_extract("") == ""

    def test_invalid_returns_empty(self):
        assert tavily_extract(":::") == ""


class TestRegistry:
    def test_list_sources(self):
        sources = list_sources()
        assert "tavily" in sources
        assert "duckduckgo" in sources

    def test_get_tavily(self):
        source = get_source("tavily")
        assert source.name == "tavily"

    def test_get_duckduckgo(self):
        source = get_source("duckduckgo")
        assert source.name == "duckduckgo"

    def test_get_unknown_raises(self):
        with pytest.raises(ValueError, match="Unknown search source"):
            get_source("nonexistent")

    def test_register_custom(self):
        class FakeSource(SearchSource):
            @property
            def name(self) -> str:
                return "fake"

            async def search(self, query, max_results=5):
                return []

        register_source("fake", FakeSource)
        assert "fake" in list_sources()
        source = get_source("fake")
        assert source.name == "fake"
