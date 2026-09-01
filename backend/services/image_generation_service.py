"""
services/image_generation_service.py — AI image generation for auto-posters
================================================================================
Uses Amazon Nova Canvas on Bedrock (verified against AWS's current docs) —
a genuinely different API surface than the rest of this app's Bedrock
usage: text generation goes through the Converse API
(bedrock_service._converse), image generation uses the older, model-
specific InvokeModel API instead, since Converse doesn't support image
generation models. Both share the same underlying bedrock-runtime client
and STS-assumed-role credentials, though — see bedrock_service._get_client().

Nova Canvas replaces Amazon Titan Image Generator v2 (amazon.titan-image-
generator-v2:0), which reached end-of-life — AWS's own migration guidance
for that model points here. Nova Canvas uses the identical request/response
shape, so this was a model-ID-only change, not a rewrite.

  Model ID: amazon.nova-canvas-v1:0
  Request:  {"taskType": "TEXT_IMAGE",
             "textToImageParams": {"text": "..."},
             "imageGenerationConfig": {"numberOfImages": 1, "height": ...,
                                        "width": ..., "quality": "...",
                                        "cfgScale": ..., "seed": ...}}
  Response: {"images": ["<base64-encoded PNG>", ...]}
"""
from __future__ import annotations

import base64
import json
import logging
import os

from botocore.exceptions import ClientError

from services.bedrock_service import _get_client
from services.bedrock_service import AWS_REGION as REGION

logger = logging.getLogger(__name__)

IMAGE_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "")
IMAGE_WIDTH = int(os.getenv("BEDROCK_IMAGE_WIDTH", "1024"))
IMAGE_HEIGHT = int(os.getenv("BEDROCK_IMAGE_HEIGHT", "1024"))

# Checked inside generate_image_from_prompt() (NOT at module-import time —
# this module gets imported unconditionally by routers/canva_router.py,
# which is always mounted, so a check here would crash the entire backend
# at startup over a misconfiguration in one feature, not just fail this
# feature specifically) — catches BEDROCK_MODEL_ID being accidentally
# set to a text/chat model's ID (e.g. copy-pasted from BEDROCK_MODEL_ID)
# instead of an actual image-generation model. That exact mistake produces
# a confusing "'messages' must not be empty" error from Bedrock (Claude's
# API expects a messages array; this module never sends one, since it
# uses the image-generation taskType/textToImageParams schema instead),
# which looks like a region/access problem but is actually just the wrong
# model ID.
_KNOWN_TEXT_MODEL_MARKERS = ("claude", "anthropic", "titan-text", "titan-premier", "llama", "mistral", "cohere", "jamba")


def _validate_image_model_id() -> None:
    if any(marker in IMAGE_MODEL_ID.lower() for marker in _KNOWN_TEXT_MODEL_MARKERS):
        raise ImageGenerationError(
            f"BEDROCK_MODEL_ID is set to , which looks like a text/chat model, "
            f"not an image-generation model. This is almost certainly a copy-paste mistake (e.g. reusing "
            f"BEDROCK_MODEL_ID's value). Set BEDROCK_MODEL_ID to an actual image model instead, "
            f"e.g. 'amazon.nova-canvas-v1:0'."
        )


class ImageGenerationError(Exception):
    pass


def generate_image_from_prompt(prompt: str, *, width: int | None = None, height: int | None = None) -> bytes:
    """Generates one image from a text prompt (e.g. a calendar post's
    visual_suggestion) and returns the raw PNG bytes, ready to upload as a
    Canva asset. Titan adds a built-in (mostly invisible) watermark
    identifying AI-generated images — this is a Titan platform feature, not
    something this app adds or can remove."""
    _validate_image_model_id()
    client = _get_client()
    body = {
        "taskType": "TEXT_IMAGE",
        "textToImageParams": {"text": prompt[:512]},  # Titan caps the prompt length
        "imageGenerationConfig": {
            "numberOfImages": 1,
            "height": height or IMAGE_HEIGHT,
            "width": width or IMAGE_WIDTH,
            "quality": "standard",
            "cfgScale": 8.0,
        },
    }
    try:
        response = client.invoke_model(
            modelId=IMAGE_MODEL_ID,
            body=json.dumps(body),
            accept="application/json",
            contentType="application/json",
        )
        response_body = json.loads(response["body"].read())
    except ClientError as e:
        error_msg = e.response["Error"].get("Message", str(e))
        logger.error(f"[image_generation] InvokeModel failed for region={REGION!r}: {error_msg}")
        # A "'messages' must not be empty" / "required key [messages] not
        # found" error here — despite this request correctly using Nova
        # Canvas's taskType/textToImageParams schema, never "messages" —
        # is a known, documented Nova quirk: it surfaces when the model is
        # invoked somewhere on-demand throughput isn't actually supported
        # for it (wrong region, or an account/region needing a
        # cross-region inference profile ID instead of the bare model ID),
        # and Bedrock's error in that case is this confusing validation
        # message rather than a clear "unsupported region/throughput" one.
        hint = ""
        if "messages" in error_msg.lower():
            if REGION != "us-east-1":
                hint = (
                    f" This specific error usually means can't be invoked on-demand "
                    f"in region '{REGION}' — try setting BEDROCK_AWS_REGION=us-east-1 (confirmed to "
                    f"support on-demand Nova Canvas), or use a cross-region inference profile ID "
                    f"(e.g. 'us.amazon.nova-canvas-v1:0') instead of the bare model ID."
                )
            else:
                hint = (
                    f" Region is already '{REGION}', which normally supports this model on-demand, so "
                    f"this is more likely: (1) model access hasn't been requested/granted for "
                    f" in the Bedrock console for this region yet, or (2) this "
                    f"specific account/region combination needs a cross-region inference profile ID "
                    f"(e.g. 'us.amazon.nova-canvas-v1:0') instead of the bare model ID — try setting "
                    f"BEDROCK_MODEL_ID to that and see if it resolves."
                )
        raise ImageGenerationError(f"Image generation failed: {error_msg}{hint}")

    error = response_body.get("error")
    if error:
        raise ImageGenerationError(f"Titan Image Generator returned an error: {error}")

    images = response_body.get("images") or []
    if not images:
        raise ImageGenerationError("Titan Image Generator returned no images")

    return base64.b64decode(images[0])
