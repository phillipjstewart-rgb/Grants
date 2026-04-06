from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _load_env() -> None:
    load_dotenv(_repo_root() / ".env")
    load_dotenv(_repo_root() / "python" / ".env")


def main_scrape() -> None:
    _load_env()
    from grant_os.scrape_firecrawl import save_grants_json, scrape_grants_portal

    p = argparse.ArgumentParser(description="Firecrawl → grants JSON")
    p.add_argument("url", nargs="?", default="https://www.grants.gov")
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=_repo_root() / "python" / "output" / "grants.json",
    )
    p.add_argument(
        "--push-supabase",
        action="store_true",
        help="Upsert rows into Supabase grant_opportunities (needs SUPABASE_* env).",
    )
    p.add_argument(
        "--embeddings-backfill",
        action="store_true",
        help="POST to GRANT_OS_APP_URL/api/embeddings/backfill after scrape (optional).",
    )
    args = p.parse_args()
    rows = scrape_grants_portal(args.url)
    save_grants_json(rows, args.output)
    print(f"Wrote {len(rows)} records to {args.output}")
    if args.push_supabase:
        from grant_os.supabase_ingest import upsert_grant_rows

        n = upsert_grant_rows(rows, args.url)
        print(f"Supabase upsert: {n} rows")
    if args.embeddings_backfill:
        from grant_os.supabase_ingest import trigger_embeddings_backfill

        trigger_embeddings_backfill()


def main_llamaparse() -> None:
    _load_env()
    from grant_os.llamaparse_ingest import gap_analysis_report, ingest_grant_pdf

    p = argparse.ArgumentParser(description="PDF → checklist JSON + gap analysis")
    p.add_argument("pdf", type=Path)
    p.add_argument(
        "--profile",
        type=Path,
        default=_repo_root() / "data" / "Company_Profile.md",
    )
    p.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        default=_repo_root() / "python" / "output",
    )
    args = p.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    checklist = ingest_grant_pdf(args.pdf)
    path_a = args.output_dir / "grant_checklist.json"
    path_a.write_text(checklist.model_dump_json(indent=2), encoding="utf-8")
    profile = args.profile.read_text(encoding="utf-8")
    gaps = gap_analysis_report(checklist, profile)
    path_b = args.output_dir / "strategic_gap_analysis.json"
    path_b.write_text(json.dumps(gaps, indent=2), encoding="utf-8")
    print(f"Wrote {path_a} and {path_b}")


def main_compliance() -> None:
    _load_env()
    from grant_os.compliance_matrix import build_compliance_matrix, load_json_path

    p = argparse.ArgumentParser(description="Grant JSON + Company DNA → compliance matrix")
    p.add_argument("requirements_json", type=Path)
    p.add_argument(
        "--dna",
        type=Path,
        default=_repo_root() / "data" / "Company_DNA.md",
    )
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=_repo_root() / "python" / "output" / "compliance_matrix.json",
    )
    args = p.parse_args()
    req = load_json_path(args.requirements_json)
    dna = args.dna.read_text(encoding="utf-8")
    matrix = build_compliance_matrix(req, dna)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(matrix.model_dump_json(indent=2), encoding="utf-8")
    print(f"Wrote {args.output}")


def main_draft() -> None:
    _load_env()
    from grant_os.anthropic_draft import draft_response_letter

    p = argparse.ArgumentParser(description="Compliance matrix → formal letter (markdown)")
    p.add_argument("matrix_json", type=Path)
    p.add_argument(
        "--pages",
        type=Path,
        help="JSON object mapping requirement keys to page refs",
    )
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=_repo_root() / "python" / "output" / "response_letter.md",
    )
    args = p.parse_args()
    matrix = json.loads(args.matrix_json.read_text(encoding="utf-8"))
    refs: dict[str, str] = {}
    if args.pages:
        refs = json.loads(args.pages.read_text(encoding="utf-8"))
    text = draft_response_letter(matrix, refs)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(text, encoding="utf-8")
    print(f"Wrote {args.output}")


def main_remediate() -> None:
    _load_env()
    from grant_os.remediation_writer import run_remediation_session

    p = argparse.ArgumentParser(description="Interactive remediation → remediated_sections.json")
    p.add_argument("gaps_json", type=Path)
    p.add_argument(
        "--voice",
        type=Path,
        default=_repo_root() / "data" / "Voice_DNA.md",
    )
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=_repo_root() / "python" / "output" / "remediated_sections.json",
    )
    args = p.parse_args()
    gaps = json.loads(args.gaps_json.read_text(encoding="utf-8"))
    if isinstance(gaps, dict):
        gaps = gaps.get("gaps") or gaps.get("items") or []
    run_remediation_session(gaps, args.voice, args.output)
    print(f"Wrote {args.output}")


def main_pdf() -> None:
    _load_env()
    from grant_os.pdf_branded import generate_branded_proposal

    p = argparse.ArgumentParser(description="JSON sections → branded PDF")
    p.add_argument("content_json", type=Path)
    p.add_argument(
        "--brand",
        type=Path,
        default=_repo_root() / "data" / "brand_config.json",
    )
    p.add_argument(
        "--logo",
        type=Path,
        default=_repo_root() / "data" / "assets" / "company_logo.png",
    )
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=_repo_root() / "python" / "output" / "proposal.pdf",
    )
    args = p.parse_args()
    data = json.loads(args.content_json.read_text(encoding="utf-8"))
    logo = args.logo if args.logo.is_file() else None
    generate_branded_proposal(args.output, data, logo, args.brand)
    print(f"Wrote {args.output}")


def main_pdf_worker() -> None:
    _load_env()
    from grant_os.pdf_queue import run_pdf_queue

    p = argparse.ArgumentParser(
        description="Queue worker: render each *.json in a folder with ReportLab (grant-pdf)"
    )
    p.add_argument(
        "queue_dir",
        type=Path,
        help="Directory containing proposal JSON jobs (*.json)",
    )
    p.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="PDF output directory (default: <queue_dir>/out)",
    )
    p.add_argument(
        "--brand",
        type=Path,
        default=_repo_root() / "data" / "brand_config.json",
    )
    p.add_argument(
        "--logo",
        type=Path,
        default=_repo_root() / "data" / "assets" / "company_logo.png",
    )
    args = p.parse_args()
    logo = args.logo if args.logo.is_file() else None
    n = run_pdf_queue(args.queue_dir, args.output_dir, args.brand, logo)
    print(f"Processed {n} job(s)")


def main_langgraph() -> None:
    _load_env()
    from grant_os.langgraph_pipeline import run_demo

    p = argparse.ArgumentParser(description="LangGraph supervisor demo")
    p.add_argument(
        "--keywords",
        nargs="+",
        default=["critical minerals", "SBIR"],
    )
    p.add_argument(
        "--matrix",
        type=Path,
        help="Optional compliance matrix JSON for the auditor",
    )
    args = p.parse_args()
    matrix = None
    if args.matrix:
        matrix = json.loads(args.matrix.read_text(encoding="utf-8"))
    out = run_demo(args.keywords, matrix)
    printable = {k: v for k, v in out.items() if k != "proposal_draft"}
    print(json.dumps(printable, indent=2))
    draft = out.get("proposal_draft", "")
    print("\n--- DRAFT PREVIEW ---\n", draft[:1200], file=sys.stderr)


def main() -> None:
    print("Use grant-scrape, grant-llamaparse, grant-compliance, …", file=sys.stderr)
    sys.exit(2)
