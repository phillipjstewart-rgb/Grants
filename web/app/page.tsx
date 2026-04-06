"use client";

import { useCallback, useState } from "react";

type ApiOk = {
  filename: string;
  extractedChars: number;
  summary: string;
};

type ApiErr = { error: string };

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ filename: string; extractedChars: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

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
      </div>
    </div>
  );
}
