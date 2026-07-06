import logging

logging.basicConfig(level=logging.WARNING)
logging.getLogger("startup").setLevel(logging.INFO)

import common.startup  # noqa: F401 — patches api.app before exposing it
from api import app  # noqa: F401 — uvicorn imports this as "main:app"
