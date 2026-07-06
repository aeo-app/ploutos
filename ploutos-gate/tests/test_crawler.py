from __future__ import annotations

from website_analyzer.crawler import _normalize_url


class TestNormalizeUrl:
    def test_absolute_url(self):
        result = _normalize_url("https://example.com", "https://other.com/page")
        assert result == "https://other.com/page"

    def test_relative_path(self):
        result = _normalize_url("https://example.com/about", "/contact")
        assert result == "https://example.com/contact"

    def test_fragment_returns_none(self):
        result = _normalize_url("https://example.com", "#section")
        assert result is None

    def test_javascript_returns_none(self):
        result = _normalize_url("https://example.com", "javascript:void(0)")
        assert result is None

    def test_relative_subpage(self):
        result = _normalize_url("https://example.com/about/", "team")
        assert result == "https://example.com/about/team"

    def test_same_page_reference(self):
        result = _normalize_url("https://example.com", "/")
        assert result == "https://example.com/"

    def test_http_scheme(self):
        result = _normalize_url("https://example.com", "http://other.com")
        assert result == "http://other.com"

    def test_ftp_scheme_returns_none(self):
        result = _normalize_url("https://example.com", "ftp://files.example.com")
        assert result is None

    def test_mailto_returns_none(self):
        result = _normalize_url("https://example.com", "mailto:test@example.com")
        assert result is None
