from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from grant_os.pdf_branded import generate_branded_proposal


def run_pdf_queue(
    queue_dir: Path,
    output_dir: Path | None,
    brand_config_path: Path,
    logo_path: Path | None,
) -> int:
    """
    One-shot worker: for each *.json in queue_dir (excluding *.done.json),
    render a PDF into output_dir and rename the job to *.done.json.
    """

    q = queue_dir.expanduser().resolve()
    out = (output_dir or q / "out").expanduser().resolve()
    done_dir = q / "processed"
    err_dir = q / "failed"
    out.mkdir(parents=True, exist_ok=True)
    done_dir.mkdir(parents=True, exist_ok=True)
    err_dir.mkdir(parents=True, exist_ok=True)

    jobs = sorted(
        p for p in q.glob("*.json") if p.is_file() and not p.name.endswith(".done.json")
    )
    processed = 0
    logo = logo_path if logo_path and logo_path.is_file() else None

    for job in jobs:
        try:
            data: dict[str, Any] = json.loads(job.read_text(encoding="utf-8"))
            pdf_name = f"{job.stem}.pdf"
            dest = out / pdf_name
            generate_branded_proposal(dest, data, logo, brand_config_path)
            shutil.move(str(job), str(done_dir / job.name))
            processed += 1
        except (OSError, ValueError, KeyError) as exc:
            bad = err_dir / job.name
            try:
                shutil.move(str(job), str(bad))
            except OSError:
                pass
            print(f"[grant-pdf-worker] {job.name}: {exc}", flush=True)

    return processed
