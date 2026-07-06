from abc import ABC, abstractmethod


class DbStore(ABC):
    @abstractmethod
    def exists(self, user_id: str, key: str) -> bool:
        ...

    @abstractmethod
    def get(self, user_id: str, key: str) -> dict | None:
        ...

    @abstractmethod
    def put(self, user_id: str, key: str, data: dict) -> None:
        ...

    @abstractmethod
    def delete(self, user_id: str, key: str) -> None:
        ...

    @abstractmethod
    def list(self, user_id: str) -> list[dict]:
        ...
