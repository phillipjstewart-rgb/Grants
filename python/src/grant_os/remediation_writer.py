from __future__ import annotations

import json
import os
from pathlib import Path

import anthropic

from grant_os.llm_config import anthropic_model
from grant_os.redaction import redact_sensitive_info


def run_remediation_session(
    gaps: list[dict],
    voice_dna_path: Path,
    output_path: Path,
) -> None:
    """
    For each gap, prompt stdin for raw facts, then ask Claude to rewrite using Voice_DNA.md.
    Saves list of {gap_id, facts, remediated_text} to JSON.
    """

    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("Set ANTHROPIC_API_KEY.")

    voice = redact_sensitive_info(voice_dna_path.read_text(encoding="utf-8")[:120_000])
    client = anthropic.Anthropic(api_key=key)
    results: list[dict] = []

    for i, gap in enumerate(gaps):
        gid = gap.get("id", f"gap_{i}")
        desc = gap.get("description") or gap.get("remediation_action") or json.dumps(gap)
        print(f"\n--- {gid} ---\n{desc}\nEnter raw facts (end with EOF / Ctrl-D):")
        lines: list[str] = []
        try:
            while True:
                line = input()
                lines.append(line)
        except EOFError:
            pass
        facts = "\n".join(lines).strip()
        if not facts:
            facts = "(no facts supplied)"

        msg = client.messages.create(
            model=anthropic_model(),
            max_tokens=4096,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "You are a world-class grant and proposal strategist. Rewrite the facts "
                        "into polished narrative that strictly mimics the voice in VOICE_DNA.\n"
                        "Rules: match sentence length and vocabulary; active voice; no unsupported "
                        "claims beyond the facts; one cohesive section under 350 words.\n\n"
                        f"VOICE_DNA:\n{voice}\n\nGAP:\n{desc}\n\nFACTS:\n{facts}"
                    ),
                }
            ],
        )
        block = msg.content[0]
        text = block.text if block.type == "text" else ""
        results.append({"gap_id": gid, "facts": facts, "remediated_text": text})

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
