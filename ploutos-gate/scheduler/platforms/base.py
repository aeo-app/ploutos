from abc import ABC, abstractmethod


class PlatformAdapter(ABC):
    @property
    @abstractmethod
    def platform_id(self) -> str:
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        ...

    @property
    @abstractmethod
    def post_types(self) -> list[str]:
        ...

    @property
    @abstractmethod
    def max_caption_length(self) -> int:
        ...

    @property
    @abstractmethod
    def max_hashtags(self) -> int:
        ...

    @property
    @abstractmethod
    def supports_paid_ads(self) -> bool:
        ...

    def extra_fields(self) -> list[str]:
        return []
