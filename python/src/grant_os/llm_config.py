from __future__ import annotations

import os

# User blueprint specified Claude 3.5 Sonnet; override with ANTHROPIC_MODEL if needed.
DEFAULT_ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022"


def anthropic_model() -> str:
    return os.environ.get("ANTHROPIC_MODEL", DEFAULT_ANTHROPIC_MODEL)
