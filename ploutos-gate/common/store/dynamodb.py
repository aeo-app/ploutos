import json
import os
from datetime import datetime, timezone

import boto3

from common.store.base import DbStore


class DynamoDbStore(DbStore):
    def __init__(self, table_name: str):
        region = os.getenv("AWS_REGION", "us-east-1")
        self._table = boto3.resource("dynamodb", region_name=region).Table(table_name)

    def exists(self, user_id: str, key: str) -> bool:
        result = self._table.get_item(
            Key={"userId": user_id, "url": key},
            ProjectionExpression="userId",
            ConsistentRead=True,
        )
        return "Item" in result

    def get(self, user_id: str, key: str) -> dict | None:
        result = self._table.get_item(
            Key={"userId": user_id, "url": key},
            ConsistentRead=True,
        )
        item = result.get("Item")
        if not item:
            return None
        return {
            "data": json.loads(item["data"]),
            "updatedAt": item["updatedAt"],
        }

    def put(self, user_id: str, key: str, data: dict) -> None:
        self._table.put_item(Item={
            "userId": user_id,
            "url": key,
            "data": json.dumps(data, default=str),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        })

    def delete(self, user_id: str, key: str) -> None:
        self._table.delete_item(Key={"userId": user_id, "url": key})

    def list(self, user_id: str) -> list[dict]:
        result = self._table.query(
            KeyConditionExpression="userId = :uid",
            ExpressionAttributeValues={":uid": user_id},
            ScanIndexForward=False,
        )
        items = result.get("Items", [])
        out = []
        for item in items:
            out.append({
                "url": item.get("url"),
                "data": json.loads(item["data"]),
                "updatedAt": item.get("updatedAt"),
            })
        return out
