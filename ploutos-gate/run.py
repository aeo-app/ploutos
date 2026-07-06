import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import common.startup  # noqa: F401 — patches scheduler endpoint before uvicorn

if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    workers = int(os.environ.get("WORKERS", os.cpu_count() or 1))

    uvicorn.run(
        "api:app",
        host=host,
        port=port,
        workers=workers,
        log_level="info",
    )
