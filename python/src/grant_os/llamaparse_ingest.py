from __future__ import annotations

import json
import os
from pathlib import Path

from pydantic import BaseModel, Field

from grant_os.llm_config import anthropic_model
from grant_os.llm_json import parse_json_object
from grant_os.redaction import redact_sensitive_info


class ChecklistSection(BaseModel):
    name: str
    items: list[str] = Field(default_factory=list)


class GrantChecklist(BaseModel):
    evaluation_criteria: ChecklistSection = Field(
        default_factory=lambda: ChecklistSection(name="Evaluation Criteria")
    )
    submission_requirements: ChecklistSection = Field(
        default_factory=lambda: ChecklistSection(name="Submission Requirements")
    )


def _text_from_pdf_pypdf(pdf_path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(pdf_path))
    parts: list[str] = []
    for page in reader.pages:
        t = page.extract_text() or ""
        parts.append(t)
    return "\n\n".join(parts).strip()


def _structured_via_claude(text: str) -> GrantChecklist:
    import anthropic

    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("Set ANTHROPIC_API_KEY for checklist extraction (fallback path).")

    safe = redact_sensitive_info(text[:200_000])
    client = anthropic.Anthropic(api_key=key)
    schema = GrantChecklist.model_json_schema()
    msg = client.messages.create(
        model=anthropic_model(),
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": (
                    "You extract grant NOFO / solicitation structure. "
                    "Return ONLY valid JSON matching this JSON Schema:\n"
                    f"{json.dumps(schema)}\n\n"
                    "Rules:\n"
                    "- evaluation_criteria.items: bullet-level criteria used to score proposals.\n"
                    "- submission_requirements.items: volumes, forms, page limits, deadlines, "
                    "registration (SAM.gov), certifications, assurances.\n"
                    "- If a section is not present in the text, use an empty items list.\n\n"
                    f"Document text:\n{safe}"
                ),
            }
        ],
    )
    block = msg.content[0]
    if block.type != "text":
        raise RuntimeError("Unexpected Anthropic response shape.")
    raw = parse_json_object(block.text)
    return GrantChecklist.model_validate(raw)


def ingest_grant_pdf(pdf_path: Path) -> GrantChecklist:
    """
    Prefer LlamaParse when `llama-parse` is installed and LLAMA_CLOUD_API_KEY is set.
    Otherwise extract text with pypdf and structure with Claude.
    """

    path = pdf_path.expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(path)

    use_llama = os.environ.get("LLAMA_CLOUD_API_KEY") or os.environ.get("LLAMA_PARSE_API_KEY")
    if use_llama:
        try:
            from llama_parse import LlamaParse  # type: ignore[import-not-found]

            parser = LlamaParse(
                api_key=os.environ.get("LLAMA_CLOUD_API_KEY")
                or os.environ.get("LLAMA_PARSE_API_KEY"),
                result_type="markdown",
                verbose=False,
            )
            documents = parser.load_data(str(path))
            text = "\n\n".join(d.text for d in documents if getattr(d, "text", None))
            if not text.strip():
                text = _text_from_pdf_pypdf(path)
        except Exception:
            text = _text_from_pdf_pypdf(path)
    else:
        text = _text_from_pdf_pypdf(path)

    if len(text) < 80:
        raise ValueError("Very little text extracted from PDF; try OCR or LlamaParse.")

    return _structured_via_claude(text)


def gap_analysis_report(checklist: GrantChecklist, company_profile_md: str) -> dict:
    """Compare checklist against Company_Profile.md; return structured gap analysis."""

    import anthropic

    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("Set ANTHROPIC_API_KEY for gap analysis.")

    client = anthropic.Anthropic(api_key=key)
    profile = redact_sensitive_info(company_profile_md[:80_000])
    checklist_json = checklist.model_dump_json(indent=2)
    msg = client.messages.create(
        model=anthropic_model(),
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": (
                    "You are a capture manager. Compare the grant checklist JSON to the "
                    "company profile markdown.\n"
                    "Produce JSON with keys:\n"
                    '- "missing_certifications": string[]\n'
                    '- "eligibility_gaps": string[]\n'
                    '- "strategic_gap_analysis": string (multi-paragraph executive narrative)\n'
                    "Be specific; do not invent company facts not in the profile.\n\n"
                    f"CHECKLIST:\n{checklist_json}\n\nCOMPANY PROFILE:\n{profile}"
                ),
            }
        ],
    )
    block = msg.content[0]
    if block.type != "text":
        raise RuntimeError("Unexpected Anthropic response shape.")
    return parse_json_object(block.text)
