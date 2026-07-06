from common.store.base import DbStore
from common.store.dynamodb import DynamoDbStore


def create_store(table_name: str) -> DbStore:
    return DynamoDbStore(table_name)


__all__ = ["DbStore", "DynamoDbStore", "create_store"]
