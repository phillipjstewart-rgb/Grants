from __future__ import annotations

import re


def redact_sensitive_info(text: str) -> str:
    """Baseline PII / coordinate redaction before sending text to external LLMs."""

    email_pattern = r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}"
    text = re.sub(email_pattern, "[REDACTED_EMAIL]", text, flags=re.IGNORECASE)

    phone_pattern = r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"
    text = re.sub(phone_pattern, "[REDACTED_PHONE]", text)

    gps_pattern = r"(\d+\.\d+)\s*°?\s*([NSWE])"
    text = re.sub(gps_pattern, "[REDACTED_COORDINATES]", text)

    return text
