# Grant OS

Monorepo for a grant-capture platform: a **Next.js** desk app for PDF requirement intelligence, plus **Python** services for portal scraping (Firecrawl), PDF ingestion (pypdf + optional LlamaParse on Python 3.12–3.13), compliance matrices (Claude), remediation writing, **ReportLab** PDFs, **USASpending** intel, and a **LangGraph** supervisor sketch.

## Repository layout

| Path | Role |
| --- | --- |
| `web/` | Next.js 15 + Tailwind 4 + LangChain + OpenAI + `pdf-parse` |
| `python/` | Installable package (`grant-os`) with CLI entry points |
| `data/` | Templates: `Company_Profile.md`, `Company_DNA.md`, `Voice_DNA.md`, `brand_config.json` |
| `supabase/migrations/` | SQL for `grant_opportunities`, `pdf_analyses`, `grant_os_embeddings` + pgvector |
| `.github/workflows/` | Optional daily Firecrawl scrape → artifact |

## Quick start — web

From the **repo root**, you can run the app without `cd web` (scripts delegate to `web/`):

```bash
cp web/.env.example web/.env.local
# set OPENAI_API_KEY and optional Supabase vars (see below)
npm install --prefix web
npm run dev
```

Or work inside `web/`:

```bash
cd web
cp .env.example .env.local
# set OPENAI_API_KEY
npm install
npm run dev
```

Open the app: the home page lists opportunities from `grant_opportunities` (via `GET /api/grants`) and lets you upload a text-based PDF for requirement summarization. With Supabase configured, summaries are stored in `pdf_analyses`.

### Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run the SQL in `supabase/migrations/20260406000000_grant_os_core.sql` (SQL Editor, or `supabase db push` if you use the CLI).
3. In `web/.env.local`, set:
   - `NEXT_PUBLIC_SUPABASE_URL` — Project URL  
   - `SUPABASE_SERVICE_ROLE_KEY` — **server-only**; never expose to the browser or commit to git  

Optional: point scrapers or other backends at the same Supabase project using `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in a server-side `.env` (never commit keys).

### Semantic search (pgvector + OpenAI embeddings)

1. Apply the migration `supabase/migrations/20260406150000_grant_os_pgvector_embeddings.sql` (after the core migration) via SQL Editor or `supabase db push`.
2. Each successful PDF summarization upserts an embedding for that row (`pdf_analysis`). Grant rows from scrapers are indexed when you run a backfill.
3. **Backfill** existing rows: `POST /api/embeddings/backfill` (same origin as the app). If `GRANT_OS_INTERNAL_KEY` is set in `web/.env.local`, send header `x-grant-os-key: <value>`.
4. **Search**: the home page includes a semantic search box, or call `GET /api/search?q=...&limit=10&type=all` (`type` can be `grant_opportunity`, `pdf_analysis`, or `all`). Uses `text-embedding-3-small` (1536 dimensions) unless you override `OPENAI_EMBEDDING_MODEL` (keep dimensions aligned with the migration).

Search calls OpenAI on every request; protect or rate-limit if you expose the app publicly.

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

## Security

- Never commit `.env`, `web/.env.local`, or keys. `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security—use only on the server (Next.js API routes, CI secrets, local tooling).

## Roadmap / extensions

- **Chunked PDF embeddings:** split long solicitations into chunks with multiple vectors per analysis.
- **Production PDF pipeline:** replace the LangGraph `pdf` stub node with a queue worker calling `grant-pdf`.
