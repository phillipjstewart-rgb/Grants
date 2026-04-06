"use client";

import { useCallback, useEffect, useState } from "react";

import { semanticSearchAction } from "@/app/actions/semanticSearch";
import type { SemanticSearchHit } from "@/types/semanticSearch";

type ApiOk = {
  filename: string;
  extractedChars: number;
  summary: string;
};

type ApiErr = { error: string };

type GrantRow = {
  id: string;
  created_at: string;
  source_url: string;
  title: string;
  agency: string;
  eligibility: string[];
  closing_date: string | null;
  funding_amount: string | null;
  high_priority: boolean;
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ filename: string; extractedChars: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(true);
  const [grantsError, setGrantsError] = useState<string | null>(null);

  const [searchQ, setSearchQ] = useState("");
  const [searchType, setSearchType] = useState<"all" | "grant_opportunity" | "pdf_analysis">("all");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SemanticSearchHit[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/grants?limit=50");
        const data = (await res.json()) as { grants?: GrantRow[]; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setGrantsError(data.error ?? "Could not load opportunities.");
          setGrants([]);
          return;
        }
        setGrantsError(null);
        setGrants(data.grants ?? []);
      } catch {
        if (!cancelled) {
          setGrantsError("Network error loading opportunities.");
          setGrants([]);
        }
      } finally {
        if (!cancelled) setGrantsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSummary(null);
      setMeta(null);
      if (!file) {
        setError("Choose a PDF first.");
        return;
      }
      setLoading(true);
      try {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/summarize", { method: "POST", body });
        const data = (await res.json()) as ApiOk & ApiErr;
        if (!res.ok) {
          setError(data.error || "Request failed.");
          return;
        }
        setSummary(data.summary);
        setMeta({ filename: data.filename, extractedChars: data.extractedChars });
      } catch {
        setError("Network error — try again.");
      } finally {
        setLoading(false);
      }
    },
    [file]
  );

  const onSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSearchError(null);
      setSearchResults(null);
      const q = searchQ.trim();
      if (!q) {
        setSearchError("Enter a search phrase.");
        return;
      }
      setSearchLoading(true);
      try {
        const data = await semanticSearchAction({ q, limit: 12, type: searchType });
        if (!data.ok) {
          setSearchError(data.error);
          return;
        }
        setSearchResults(data.results);
      } catch {
        setSearchError("Network error — try again.");
      } finally {
        setSearchLoading(false);
      }
    },
    [searchQ, searchType]
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-14 sm:px-10">
        <header className="flex flex-col gap-4 border-b border-slate-200/80 pb-10 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-400">
            Grant OS
          </p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Proposal requirement intelligence
          </h1>
          <p className="max-w-2xl text-pretty text-slate-600 dark:text-slate-400">
            Upload a solicitation or NOFO PDF. We extract the text with a server-side parser,
            then use LangChain and OpenAI to surface the requirements that matter for your
            proposal desk.
          </p>
        </header>

        <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Semantic search
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Query across embedded grant opportunities and PDF requirement summaries (pgvector + OpenAI embeddings).
            </p>
          </div>
          <form onSubmit={onSearch} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="sem-q" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Search
              </label>
              <input
                id="sem-q"
                type="search"
                value={searchQ}
                onChange={(ev) => setSearchQ(ev.target.value)}
                placeholder="e.g. cost share, SBIR Phase I, cybersecurity compliance"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor="sem-type" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Scope
              </label>
              <select
                id="sem-type"
                value={searchType}
                onChange={(ev) =>
                  setSearchType(ev.target.value as "all" | "grant_opportunity" | "pdf_analysis")
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 sm:w-48"
              >
                <option value="all">All indexed</option>
                <option value="grant_opportunity">Opportunities only</option>
                <option value="pdf_analysis">PDF summaries only</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={searchLoading}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
            >
              {searchLoading ? "Searching…" : "Search"}
            </button>
          </form>
          {searchError ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              {searchError}
            </p>
          ) : null}
          {searchResults ? (
            searchResults.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                No matches. Index content with a PDF upload or run{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">POST /api/embeddings/backfill</code>{" "}
                for existing rows (see README).
              </p>
            ) : (
              <ul className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto pr-1">
                {searchResults.map((hit) => (
                  <li
                    key={`${hit.source_type}-${hit.source_id}`}
                    className="rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/40"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {hit.source_type === "grant_opportunity" ? "Opportunity" : "PDF summary"}
                      </span>
                      <span>{(hit.similarity * 100).toFixed(1)}% match</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                      {hit.content.length > 900 ? `${hit.content.slice(0, 900)}…` : hit.content}
                    </p>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </section>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/60"
          >
            <div>
              <label
                htmlFor="pdf"
                className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Grant PDF
              </label>
              <input
                id="pdf"
                name="file"
                type="file"
                accept="application/pdf,.pdf"
                className="block w-full cursor-pointer rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-3 py-8 text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-sky-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:border-sky-400 dark:border-slate-600 dark:bg-slate-950/40 dark:text-slate-300 file:dark:bg-sky-500"
                onChange={(ev) => {
                  const f = ev.target.files?.[0];
                  setFile(f ?? null);
                }}
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
                Text-based PDFs work best. Max ~12&nbsp;MB.
              </p>
            </div>
            <button
              type="submit"
              disabled={loading || !file}
              className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-500 dark:hover:bg-sky-400"
            >
              {loading ? "Analyzing…" : "Summarize requirements"}
            </button>
            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </p>
            ) : null}
          </form>

          <article className="flex min-h-[280px] flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Key requirements summary
            </h2>
            {meta ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {meta.filename} · {meta.extractedChars.toLocaleString()} characters extracted
              </p>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Results appear here after you run an upload.
              </p>
            )}
            {summary ? (
              <div className="prose prose-slate max-w-none text-sm leading-relaxed dark:prose-invert">
                <pre className="whitespace-pre-wrap font-sans text-slate-800 dark:text-slate-100">
                  {summary}
                </pre>
              </div>
            ) : null}
          </article>
        </section>

        <section className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200/80 pb-4 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Opportunity feed
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                Rows from Supabase <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">grant_opportunities</code>
                — populated by scrapers or manual inserts.
              </p>
            </div>
          </div>

          {grantsLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading opportunities…</p>
          ) : grantsError ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              {grantsError}
            </p>
          ) : grants.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              No opportunities yet. Run <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">grant-scrape</code>{" "}
              from the Python toolkit or add rows in the Supabase SQL editor.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {grants.map((g) => (
                <li
                  key={g.id}
                  className="rounded-xl border border-slate-200/90 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {g.high_priority ? (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800 dark:bg-rose-950/80 dark:text-rose-200">
                            High priority
                          </span>
                        ) : null}
                        <span className="text-xs text-slate-500 dark:text-slate-500">
                          {new Date(g.created_at).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      <h3 className="mt-1 font-medium text-slate-900 dark:text-slate-100">{g.title}</h3>
                      {g.agency ? (
                        <p className="text-sm text-slate-600 dark:text-slate-400">{g.agency}</p>
                      ) : null}
                    </div>
                    <a
                      href={g.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50 dark:border-slate-600 dark:text-sky-400 dark:hover:bg-sky-950/40"
                    >
                      Source ↗
                    </a>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    {g.closing_date ? (
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Closes</dt>
                        <dd className="text-slate-800 dark:text-slate-200">{g.closing_date}</dd>
                      </div>
                    ) : null}
                    {g.funding_amount ? (
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Funding</dt>
                        <dd className="text-slate-800 dark:text-slate-200">{g.funding_amount}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {g.eligibility?.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {g.eligibility.slice(0, 6).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {tag}
                        </span>
                      ))}
                      {g.eligibility.length > 6 ? (
                        <span className="text-xs text-slate-500">+{g.eligibility.length - 6} more</span>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
