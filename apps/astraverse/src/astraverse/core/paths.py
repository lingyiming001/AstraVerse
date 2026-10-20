"""Resolve source-independent configuration and writable runtime paths."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Source layout: apps/astraverse/src/astraverse/core/paths.py.
# Installed distributions use the configured root or the process working directory.
_source_project = Path(__file__).resolve().parents[3]
_source_root = _source_project.parents[1] if (_source_project / "pyproject.toml").is_file() else Path.cwd()
PROJECT_ROOT = Path(os.environ.get("ASTRAVERSE_PROJECT_ROOT", str(_source_root))).expanduser().resolve()
_env_file = _source_project / ".env" if (_source_project / "pyproject.toml").is_file() else PROJECT_ROOT / ".env"
load_dotenv(_env_file)
DATA_DIR = Path(os.environ.get("ASTRAVERSE_DATA_DIR", str(PROJECT_ROOT / ".local"))).expanduser().resolve()
