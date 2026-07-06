from abc import ABC, abstractmethod

from website_analyzer.models import CompetitorResult


class SearchSource(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        ...

    @abstractmethod
    async def search(self, query: str, max_results: int = 5) -> list[CompetitorResult]:
        ...
