from website_analyzer.search_sources.base import SearchSource
from website_analyzer.search_sources.tavily_source import TavilySearchSource
from website_analyzer.search_sources.duckduckgo_source import DuckDuckGoSearchSource

_REGISTRY: dict[str, type[SearchSource]] = {
    "tavily": TavilySearchSource,
    "duckduckgo": DuckDuckGoSearchSource,
}


def register_source(name: str, cls: type[SearchSource]):
    _REGISTRY[name.lower()] = cls


def get_source(name: str) -> SearchSource:
    cls = _REGISTRY.get(name.lower())
    if not cls:
        raise ValueError(f"Unknown search source: {name}. Available: {list(_REGISTRY.keys())}")
    return cls()


def list_sources() -> list[str]:
    return list(_REGISTRY.keys())
