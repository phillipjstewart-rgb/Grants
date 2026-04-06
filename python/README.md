# Grant OS — Python services

Install (from repository root):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e "./python[dev]"
```

Copy environment variables from the repository `.env.example` into `.env` and export them (or use `direnv`).

Console entry points:

| Command | Purpose |
| --- | --- |
| `grant-scrape` | Firecrawl JSON extract → `python/output/grants.json` |
| `grant-llamaparse` | LlamaParse → evaluation criteria & submission checklist JSON |
| `grant-compliance` | Compliance matrix vs `data/Company_Profile.md` |
| `grant-draft` | Claude formal response letter (markdown) from matrix + page refs |
| `grant-remediate` | Interactive gap remediation → `remediated_sections.json` |
| `grant-pdf` | ReportLab branded PDF from remediated JSON |
| `grant-graph` | LangGraph supervisor demo (USASpending + writer + auditor) |

Run with `--help` on each command for flags.
