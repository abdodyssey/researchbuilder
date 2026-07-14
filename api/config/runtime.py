"""
Runtime Configuration — shared app-level state and paths.
Imported by routers and background tasks.
"""

import os
from pathlib import Path
OUTPUT_DIR = "./output"
Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
Path(os.path.join(OUTPUT_DIR, "runs")).mkdir(parents=True, exist_ok=True)

# In-memory tracker for background pipeline tasks.
# Key = pipeline_id, Value = "running" | "completed" | "failed: <error>"
# ⚠ Single-worker only — ganti Redis pub/sub kalau scale ke multi-worker.
active_runs: dict[str, str] = {}
