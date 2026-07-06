import logging
import os

import boto3
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("ploutos.contact")


def _client():
    region = os.getenv("CONTACT_REGION", "us-east-1")
    return boto3.client("sesv2", region_name=region)


def _sender() -> str:
    return os.getenv("CONTACT_SENDER", "noreply@aeo-app.ai")


def _recipient() -> str:
    return os.getenv("CONTACT_EMAIL", "sales@aeo-app.ai")


def send_contact_email(name: str, email: str, message: str, plan: str | None = None) -> dict:
    subject = f"New contact from {name} — {plan or 'No plan selected'}"
    body = f"""Name: {name}
Email: {email}
Plan: {plan or 'Not specified'}

Message:
{message}
"""
    try:
        resp = _client().send_email(
            FromEmailAddress=_sender(),
            Destination={
                "ToAddresses": [_recipient()],
            },
            Content={
                "Simple": {
                    "Subject": {"Data": subject},
                    "Body": {"Text": {"Data": body}},
                }
            },
        )
        logger.info("Contact email sent (MessageId=%s)", resp.get("MessageId"))
        return {"message": "Message sent successfully."}
    except Exception as e:
        logger.error("Failed to send contact email: %s", e)
        raise RuntimeError(f"Failed to send message: {e}")
