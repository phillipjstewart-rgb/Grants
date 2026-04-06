# Grant OS

Monorepo for a grant-capture platform: a **Next.js** desk app for PDF requirement intelligence, plus **Python** services for portal scraping (Firecrawl), PDF ingestion (pypdf + optional LlamaParse on Python 3.12–3.13), compliance matrices (Claude), remediation writing, **ReportLab** PDFs, **USASpending** intel, and a **LangGraph** supervisor sketch.

## Repository layout

| Path | Role |
| --- | --- |
| `web/` | Next.js 15 + Tailwind 4 + LangChain + OpenAI + `pdf-parse` |
| `python/` | Installable package (`grant-os`) with CLI entry points |
| `data/` | Templates: `Company_Profile.md`, `Company_DNA.md`, `Voice_DNA.md`, `brand_config.json` |
| `supabase/migrations/` | SQL for `grant_opportunities`, `pdf_analyses`, `grant_os_embeddings` + pgvector |
| `.github/workflows/` | Optional daily Firecrawl scrape → artifact (optional Supabase + embeddings) |

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

Open the app: the home page lists opportunities from `grant_opportunities` (via `GET /api/grants`), semantic search, and PDF upload for requirement summarization. With Supabase configured, summaries are stored in `pdf_analyses`.

**Document analyzer** (`/tools/document-analyzer`): split-screen PDF viewer + chat. After upload, the server extracts text (shared pipeline with the home PDF flow), **embeds chunks**, and optionally **persists them to Supabase** (`document_analyzer_*` tables) when `SUPABASE_SERVICE_ROLE_KEY` is set. It also builds a **LlamaIndex.TS** [`VectorStoreIndex`](https://ts.llamaindex.ai/) in memory for fast queries. If the in-memory index is gone (restart, another instance), chat falls back to **pgvector retrieval + OpenAI** using the stored chunks. Quick actions cover summary, requirements, and a draft response letter using `data/brand_config.json` + `Company_DNA.md`.

### Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Apply migrations **in order** (SQL Editor or `supabase db push`):
   - `20260406000000_grant_os_core.sql`
   - `20260406150000_grant_os_pgvector_embeddings.sql`
   - `20260406200000_grant_os_embedding_chunks.sql` (multiple chunks per PDF / source)
   - `20260406210000_document_analyzer_storage.sql` (document analyzer sessions + chunk vectors + `match_analyzer_chunks` RPC)
3. In `web/.env.local`, set:
   - `NEXT_PUBLIC_SUPABASE_URL` — Project URL  
   - `SUPABASE_SERVICE_ROLE_KEY` — **server-only**; never expose to the browser or commit to git  

Optional: for Python PostgREST upserts, set `SUPABASE_URL` (or reuse `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` in the repo root `.env`.

### Semantic search (pgvector + OpenAI embeddings)

- **PDF uploads:** extracted text is split into overlapping chunks (capped at 48), each embedded and stored with `chunk_index`. Grants stay a single vector (`chunk_index = 0`).
- **Backfill:** `POST /api/embeddings/backfill`. If `GRANT_OS_INTERNAL_KEY` is set, send `x-grant-os-key: <value>`.
- **Home UI:** uses a **server action** (no browser API key).
- **HTTP API:** `GET /api/search?q=...&limit=10&type=all`. If `SEARCH_API_KEY` is set, send `Authorization: Bearer <key>` or `x-search-key`.
- **Rate limiting:** per-IP, default **30 requests/minute** for both UI and API (`SEARCH_RATE_LIMIT_PER_MIN`).
- Model: `text-embedding-3-small` (1536 dimensions) unless `OPENAI_EMBEDDING_MODEL` overrides (keep dimensions aligned with migrations).

Search uses OpenAI on every query; tighten `SEARCH_API_KEY` and limits when exposed publicly.

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

- `grant-scrape` — Firecrawl JSON extract → `python/output/grants.json`. Optional **`--push-supabase`** (PostgREST upsert) and **`--embeddings-backfill`** (POST to `GRANT_OS_APP_URL/api/embeddings/backfill`). Requires `SUPABASE_*` / `GRANT_OS_APP_URL` as needed.
- `grant-llamaparse` — PDF → `grant_checklist.json` + `strategic_gap_analysis.json`
- `grant-compliance` — requirements JSON + `Company_DNA.md` → `compliance_matrix.json`
- `grant-draft` — matrix + optional page map → `response_letter.md`
- `grant-remediate` — interactive gap loop → `remediated_sections.json`
- `grant-pdf` — remediated JSON + brand config → PDF (try `data/examples/proposal_content.json`)
- `grant-pdf-worker` — process each `*.json` job file in a queue directory into PDFs (`processed/` and `failed/` subfolders; PDFs to `--output-dir` or `<queue>/out`)
- `grant-graph` — LangGraph demo (USASpending → writer → auditor → **ReportLab PDF** via `node_grant_pdf`)

## Environment variables

See `.env.example` at the repo root and `web/.env.example`. The web app reads secrets from `web/.env.local` in development.

**Ingestion / CI (Python + hosted Next app):**

| Variable | Role |
| --- | --- |
| `GRANT_OS_APP_URL` | Base URL of the deployed Next app (for `--embeddings-backfill`) |
| `GRANT_OS_INTERNAL_KEY` | Shared secret; `x-grant-os-key` on backfill (web + Python) |

## Scheduling

- **GitHub Actions:** `.github/workflows/daily-grant-scrape.yml` — set `FIRECRAWL_API_KEY`. If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, the workflow also runs **`--push-supabase --embeddings-backfill`** in the same scrape step (set `GRANT_OS_APP_URL` + `GRANT_OS_INTERNAL_KEY` so the app can index new rows).
- **Cron:** you can run `grant-scrape` locally or on a host with the same flags.

## Security

- Never commit `.env`, `web/.env.local`, or keys. `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security—use only on the server (Next.js API routes, CI secrets, local tooling).
- Treat `SEARCH_API_KEY` and `GRANT_OS_INTERNAL_KEY` like production secrets when enabled.

## Roadmap / extensions

- **Finer chunking:** token-based splits (tiktoken) and metadata filters in RPC.
- **Auth:** Supabase Auth + RLS policies tailored to tenants instead of public read on opportunities.
