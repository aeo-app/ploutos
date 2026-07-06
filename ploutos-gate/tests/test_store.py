from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from common.store.base import DbStore
from common.store.dynamodb import DynamoDbStore


class InMemoryStore(DbStore):
    def __init__(self):
        self._data: dict[tuple[str, str], dict] = {}

    def exists(self, user_id: str, key: str) -> bool:
        return (user_id, key) in self._data

    def get(self, user_id: str, key: str) -> dict | None:
        return self._data.get((user_id, key))

    def put(self, user_id: str, key: str, data: dict) -> None:
        self._data[(user_id, key)] = {
            "data": data,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }

    def delete(self, user_id: str, key: str) -> None:
        self._data.pop((user_id, key), None)

    def list(self, user_id: str) -> list[dict]:
        return [
            v for (uid, _), v in self._data.items() if uid == user_id
        ]


@pytest.fixture
def store() -> InMemoryStore:
    return InMemoryStore()


class TestInMemoryStore:
    def test_exists_returns_false_when_missing(self, store: InMemoryStore):
        assert store.exists("u1", "https://example.com") is False

    def test_put_and_exists(self, store: InMemoryStore):
        store.put("u1", "https://example.com", {"name": "Acme"})
        assert store.exists("u1", "https://example.com") is True

    def test_get_returns_none_when_missing(self, store: InMemoryStore):
        assert store.get("u1", "missing") is None

    def test_put_and_get(self, store: InMemoryStore):
        data = {"name": "Acme", "products": ["CRM"]}
        store.put("u1", "https://acme.com", data)
        item = store.get("u1", "https://acme.com")
        assert item is not None
        assert item["data"] == data
        assert "updatedAt" in item

    def test_get_scoped_to_user(self, store: InMemoryStore):
        store.put("u1", "https://acme.com", {"name": "Acme"})
        assert store.get("u2", "https://acme.com") is None

    def test_get_scoped_to_key(self, store: InMemoryStore):
        store.put("u1", "https://acme.com", {"name": "Acme"})
        assert store.get("u1", "https://other.com") is None

    def test_delete_removes_item(self, store: InMemoryStore):
        store.put("u1", "https://acme.com", {"name": "Acme"})
        store.delete("u1", "https://acme.com")
        assert store.exists("u1", "https://acme.com") is False

    def test_put_overwrites_existing(self, store: InMemoryStore):
        store.put("u1", "https://acme.com", {"name": "Old"})
        store.put("u1", "https://acme.com", {"name": "New"})
        item = store.get("u1", "https://acme.com")
        assert item["data"]["name"] == "New"

    def test_list_returns_user_items(self, store: InMemoryStore):
        store.put("u1", "https://a.com", {"name": "A"})
        store.put("u1", "https://b.com", {"name": "B"})
        store.put("u2", "https://c.com", {"name": "C"})
        items = store.list("u1")
        assert len(items) == 2
        urls = {i["data"]["name"] for i in items}
        assert urls == {"A", "B"}

    def test_list_empty_when_no_items(self, store: InMemoryStore):
        assert store.list("u1") == []


class TestDynamoDbStore:
    @patch("common.store.dynamodb.boto3.resource")
    def test_exists(self, mock_resource: MagicMock):
        table = MagicMock()
        mock_resource.return_value.Table.return_value = table
        table.get_item.return_value = {"Item": {"userId": "u1"}}

        ddb = DynamoDbStore("test-table")
        assert ddb.exists("u1", "https://acme.com") is True
        table.get_item.assert_called_once_with(
            Key={"userId": "u1", "url": "https://acme.com"},
            ProjectionExpression="userId",
            ConsistentRead=True,
        )

    @patch("common.store.dynamodb.boto3.resource")
    def test_exists_returns_false(self, mock_resource: MagicMock):
        table = MagicMock()
        mock_resource.return_value.Table.return_value = table
        table.get_item.return_value = {}

        ddb = DynamoDbStore("test-table")
        assert ddb.exists("u1", "https://acme.com") is False

    @patch("common.store.dynamodb.boto3.resource")
    def test_put(self, mock_resource: MagicMock):
        table = MagicMock()
        mock_resource.return_value.Table.return_value = table

        ddb = DynamoDbStore("test-table")
        ddb.put("u1", "https://acme.com", {"name": "Acme"})

        call_kwargs = table.put_item.call_args[1]
        item = call_kwargs["Item"]
        assert item["userId"] == "u1"
        assert item["url"] == "https://acme.com"
        assert "updatedAt" in item

    @patch("common.store.dynamodb.boto3.resource")
    def test_get_returns_none(self, mock_resource: MagicMock):
        table = MagicMock()
        mock_resource.return_value.Table.return_value = table
        table.get_item.return_value = {}

        ddb = DynamoDbStore("test-table")
        assert ddb.get("u1", "https://acme.com") is None

    @patch("common.store.dynamodb.boto3.resource")
    def test_get(self, mock_resource: MagicMock):
        import json
        table = MagicMock()
        mock_resource.return_value.Table.return_value = table
        table.get_item.return_value = {
            "Item": {
                "userId": "u1",
                "url": "https://acme.com",
                "data": json.dumps({"name": "Acme"}),
                "updatedAt": "2026-07-01T00:00:00+00:00",
            }
        }

        ddb = DynamoDbStore("test-table")
        item = ddb.get("u1", "https://acme.com")
        assert item is not None
        assert item["data"] == {"name": "Acme"}
        assert item["updatedAt"] == "2026-07-01T00:00:00+00:00"

    @patch("common.store.dynamodb.boto3.resource")
    def test_delete(self, mock_resource: MagicMock):
        table = MagicMock()
        mock_resource.return_value.Table.return_value = table

        ddb = DynamoDbStore("test-table")
        ddb.delete("u1", "https://acme.com")
        table.delete_item.assert_called_once_with(
            Key={"userId": "u1", "url": "https://acme.com"},
        )

    @patch("common.store.dynamodb.boto3.resource")
    def test_list(self, mock_resource: MagicMock):
        import json
        table = MagicMock()
        mock_resource.return_value.Table.return_value = table
        table.query.return_value = {
            "Items": [
                {"userId": "u1", "url": "https://a.com", "data": json.dumps({"name": "A"}), "updatedAt": "t1"},
                {"userId": "u1", "url": "https://b.com", "data": json.dumps({"name": "B"}), "updatedAt": "t2"},
            ]
        }

        ddb = DynamoDbStore("test-table")
        items = ddb.list("u1")
        assert len(items) == 2
        assert items[0]["data"]["name"] == "A"
        assert items[1]["url"] == "https://b.com"

    @patch("common.store.dynamodb.boto3.resource")
    def test_list_empty(self, mock_resource: MagicMock):
        table = MagicMock()
        mock_resource.return_value.Table.return_value = table
        table.query.return_value = {"Items": []}

        ddb = DynamoDbStore("test-table")
        assert ddb.list("u1") == []
