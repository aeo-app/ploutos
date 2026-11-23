import json
import os
from pathlib import Path

import modal

APP_NAME = "aeo-reels-engine"
ENGINE_REPO = "https://github.com/harry0703/MoneyPrinterTurbo.git"
# The version tested with the AEO app; change it only after testing a newer one.
ENGINE_COMMIT = "ef3c333fd475595176fc90b67c78555bf4b739a2"
ENGINE_DIR = "/engine"
MAX_PARALLEL_REELS = 2

app = modal.App(APP_NAME)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg")
    .run_commands(
        f"git init {ENGINE_DIR}",
        f"git -C {ENGINE_DIR} fetch --depth 1 {ENGINE_REPO} {ENGINE_COMMIT}",
        f"git -C {ENGINE_DIR} checkout FETCH_HEAD",
        f"pip install -r {ENGINE_DIR}/requirements.txt",
    )
    .env({"MPT_HOME": ENGINE_DIR, "PYTHONPATH": ENGINE_DIR})
)


def write_engine_config(engine_dir: str, key: str) -> None:
    if not key:
        # The engine skips the key check when none is set, which would open it to anyone on the internet.
        raise RuntimeError(f"REELS_ENGINE_KEY is missing from the '{APP_NAME}' Modal secret")
    section, lines = "", []
    for line in Path(engine_dir, "config.example.toml").read_text(encoding="utf-8").splitlines():
        if line.startswith("["):
            section = line.strip()
        if section == "[app]" and line.strip() == 'api_key = ""':
            line = f"api_key = {json.dumps(key)}"
        elif section == "[app]" and line.strip().startswith("max_concurrent_tasks ="):
            line = f"max_concurrent_tasks = {MAX_PARALLEL_REELS}"
        lines.append(line)
    Path(engine_dir, "config.toml").write_text("\n".join(lines) + "\n", encoding="utf-8")


@app.function(
    image=image,
    secrets=[modal.Secret.from_name(APP_NAME)],
    cpu=4.0,
    memory=8192,
    # One copy only: the engine keeps uploaded photos on its own disk and each reel's progress in memory.
    max_containers=1,
    # The AEO app checks progress every few seconds; staying up between checks keeps a reel from being cut off.
    scaledown_window=300,
    timeout=600,
)
@modal.concurrent(max_inputs=20)
@modal.asgi_app()
def web():
    os.chdir(ENGINE_DIR)
    write_engine_config(ENGINE_DIR, os.environ.get("REELS_ENGINE_KEY", "").strip())
    from app.asgi import app as engine

    return engine
