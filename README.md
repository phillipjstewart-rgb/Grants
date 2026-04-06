# Grant OS

Monorepo for a grant-capture platform: a **Next.js** desk app for PDF requirement intelligence, plus **Python** services for portal scraping (Firecrawl), PDF ingestion (pypdf + optional LlamaParse on Python 3.12–3.13), compliance matrices (Claude), remediation writing, **ReportLab** PDFs, **USASpending** intel, and a **LangGraph** supervisor sketch.

## Repository layout

| Path | Role |
| --- | --- |
| `web/` | Next.js 15 + Tailwind 4 + LangChain + OpenAI + `pdf-parse` |
| `python/` | Installable package (`grant-os`) with CLI entry points |
| `data/` | Templates: `Company_Profile.md`, `Company_DNA.md`, `Voice_DNA.md`, `brand_config.json` |
| `.github/workflows/` | Optional daily Firecrawl scrape → artifact |

## Quick start — web

```bash
cd web
cp .env.example .env.local
# set OPENAI_API_KEY
npm install
npm run dev
```

Open the app, upload a text-based PDF, and call the summarization API.

## Quick start — Python

Use **Python 3.11–3.13** for the full dependency set. On **3.14**, core services work; install optional LlamaParse only when you use 3.12 or 3.13:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e "./python"
# Optional: pip install -e "./python[llama]"
cp .env.example .env
```

CLI commands (see `python/README.md`):

- `grant-scrape` — Firecrawl JSON extract → `python/output/grants.json` (flags **High Priority** when eligibility mentions for-profit applicants)
- `grant-llamaparse` — PDF → `grant_checklist.json` + `strategic_gap_analysis.json`
- `grant-compliance` — requirements JSON + `Company_DNA.md` → `compliance_matrix.json`
- `grant-draft` — matrix + optional page map → `response_letter.md`
- `grant-remediate` — interactive gap loop → `remediated_sections.json`
- `grant-pdf` — remediated JSON + brand config → PDF (try `data/examples/proposal_content.json`)
- `grant-graph` — LangGraph demo (USASpending → writer → auditor loop)

## Environment variables

See `.env.example` at the repo root. The web app reads `OPENAI_API_KEY` from `web/.env.local` in development.

## Scheduling

Configure `FIRECRAWL_API_KEY` in GitHub Actions secrets to enable `.github/workflows/daily-grant-scrape.yml`, or point a cron job at `grant-scrape`.

## Next integrations (your blueprint)

- **Supabase / Pinecone:** persist `grants.json` and embeddings from PDFs for cross-opportunity search.
- **Production PDF pipeline:** replace the LangGraph `pdf` stub node with a call to `grant-pdf` or a queue worker.
