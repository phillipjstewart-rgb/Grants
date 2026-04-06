"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Document, Page, pdfjs } from "react-pdf";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import type { AnalyzerChatSource } from "@/types/documentAnalyzer";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
  sources?: AnalyzerChatSource[];
};

export default function DocumentAnalyzerClient() {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    if (!file) {
      setFileUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onFile = useCallback((f: File | null) => {
    setFile(f);
    setSessionId(null);
    setMessages([]);
    setIndexError(null);
    setNumPages(0);
  }, []);

  const indexPdf = useCallback(async () => {
    if (!file) return;
    setIndexing(true);
    setIndexError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/document-analyzer/index", { method: "POST", body });
      const data = (await res.json()) as {
        sessionId?: string;
        filename?: string;
        chunkCount?: number;
        persisted?: boolean;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        setIndexError(data.detail || data.error || "Indexing failed.");
        return;
      }
      if (!data.sessionId) {
        setIndexError("No session returned.");
        return;
      }
      setSessionId(data.sessionId);
      const chunksNote =
        typeof data.chunkCount === "number" ? ` (${data.chunkCount} text chunks)` : "";
      const persistNote = data.persisted
        ? " Chunks are also stored in Supabase so chat can resume after a server restart."
        : "";
      setMessages([
        {
          role: "assistant",
          content: `Indexed **${data.filename ?? file.name}** with LlamaIndex (vector store)${chunksNote}.${persistNote} Ask a question or use a quick action.`,
        },
      ]);
    } catch {
      setIndexError("Network error while indexing.");
    } finally {
      setIndexing(false);
    }
  }, [file]);

  const sendChat = useCallback(
    async (opts: { message: string; quickAction?: "about" | "requirements" | "draft_letter" }) => {
      if (!sessionId) {
        setIndexError("Index the PDF first.");
        return;
      }
      const userVisible =
        opts.quickAction === "about"
          ? "Quick action: What is this about?"
          : opts.quickAction === "requirements"
            ? "Quick action: What are the key requirements?"
            : opts.quickAction === "draft_letter"
              ? "Quick action: Draft a response letter (company letterhead template)"
              : opts.message;

      if (!opts.quickAction && !opts.message.trim()) return;

      const nextMessages: ChatMessage[] =
        opts.quickAction && !opts.message.trim()
          ? [...messages, { role: "user", content: userVisible }]
          : [...messages, { role: "user", content: opts.message.trim() || userVisible }];

      setMessages(nextMessages);
      setInput("");
      setChatLoading(true);
      setIndexError(null);

      const historyPayload = messages.map((m) => ({
        role: m.role,
        content: m.content.slice(0, 8000),
      }));

      try {
        const res = await fetch("/api/document-analyzer/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            message: opts.message.trim(),
            quickAction: opts.quickAction,
            history: historyPayload,
          }),
        });
        const data = (await res.json()) as {
          reply?: string;
          sources?: AnalyzerChatSource[];
          error?: string;
          detail?: string;
        };
        if (!res.ok) {
          setMessages((m) => [
            ...m,
            { role: "assistant", content: data.detail || data.error || "Request failed." },
          ]);
          return;
        }
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: data.reply ?? "(empty reply)",
            sources: data.sources,
          },
        ]);
      } catch {
        setMessages((m) => [...m, { role: "assistant", content: "Network error — try again." }]);
      } finally {
        setChatLoading(false);
      }
    },
    [sessionId, messages]
  );

  const onSubmitChat = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void sendChat({ message: input });
    },
    [input, sendChat]
  );

  const lastAssistantReply = [...messages].reverse().find((m) => m.role === "assistant");
  const canDownloadReply =
    lastAssistantReply &&
    messages.length > 1 &&
    !lastAssistantReply.content.startsWith("Indexed **");

  const downloadLastReply = useCallback(() => {
    if (!lastAssistantReply || !canDownloadReply) return;
    const blob = new Blob([lastAssistantReply.content], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document-analyzer-last-reply.md";
    a.click();
    URL.revokeObjectURL(url);
  }, [lastAssistantReply, canDownloadReply]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-400">
              Grant OS
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Document analyzer</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              Split view: PDF on the left, grounded chat on the right. With Supabase configured, indexed
              chunks are stored so chat can fall back after restarts; in-process LlamaIndex stays fastest when
              the same server still holds your session.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            ← Desk home
          </Link>
        </header>

        <div className="grid min-h-[calc(100vh-12rem)] grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">PDF</h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500">
                Choose PDF
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(ev) => onFile(ev.target.files?.[0] ?? null)}
                />
              </label>
              {file ? (
                <button
                  type="button"
                  onClick={() => void indexPdf()}
                  disabled={indexing}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  {indexing ? "Indexing with LlamaIndex…" : "Index with LlamaIndex"}
                </button>
              ) : null}
            </div>
            {indexError ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                {indexError}
              </p>
            ) : null}
            <div className="min-h-[420px] flex-1 overflow-auto rounded-xl border border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-950/40">
              {fileUrl ? (
                <Document
                  file={fileUrl}
                  onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                  loading={
                    <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Loading PDF…</p>
                  }
                  error={
                    <p className="p-4 text-sm text-red-700 dark:text-red-300">Could not load PDF.</p>
                  }
                  className="flex flex-col items-center gap-4 py-4"
                >
                  {Array.from({ length: numPages }, (_, i) => (
                    <Page
                      key={i + 1}
                      pageNumber={i + 1}
                      width={Math.min(560, typeof window !== "undefined" ? window.innerWidth - 48 : 520)}
                      className="shadow-md"
                    />
                  ))}
                </Document>
              ) : (
                <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
                  Select a PDF to preview pages here.
                </p>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Chat</h2>
              <button
                type="button"
                onClick={downloadLastReply}
                disabled={!canDownloadReply}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Download last reply (.md)
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!sessionId || chatLoading}
                onClick={() => void sendChat({ message: "", quickAction: "about" })}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
              >
                What is this about?
              </button>
              <button
                type="button"
                disabled={!sessionId || chatLoading}
                onClick={() => void sendChat({ message: "", quickAction: "requirements" })}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
              >
                Key requirements
              </button>
              <button
                type="button"
                disabled={!sessionId || chatLoading}
                onClick={() => void sendChat({ message: "", quickAction: "draft_letter" })}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-40 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
              >
                Draft response letter (letterhead)
              </button>
            </div>

            <div className="min-h-[320px] flex-1 space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-950/30">
              {messages.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Index a PDF, then ask questions grounded in the document.
                </p>
              ) : (
                messages.map((m, i) => (
                  <div
                    key={`${i}-${m.role}`}
                    className={
                      m.role === "user"
                        ? "ml-4 rounded-lg border border-sky-200 bg-sky-50/90 px-3 py-2 text-sm dark:border-sky-900 dark:bg-sky-950/40"
                        : "mr-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900/60"
                    }
                  >
                    <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
                      {m.role}
                    </p>
                    <pre className="mt-1 whitespace-pre-wrap font-sans text-slate-800 dark:text-slate-100">
                      {m.content}
                    </pre>
                    {m.role === "assistant" && m.sources && m.sources.length > 0 ? (
                      <details className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-600">
                        <summary className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-400">
                          Sources ({m.sources.length})
                        </summary>
                        <ol className="mt-2 list-decimal space-y-2 pl-4 text-xs text-slate-600 dark:text-slate-400">
                          {m.sources.map((s, j) => (
                            <li key={j}>
                              <span className="text-slate-500">
                                {s.kind === "pgvector" ? "Database" : "In-memory index"}
                                {typeof s.score === "number"
                                  ? ` · score ${s.score.toFixed(3)}`
                                  : ""}
                                {typeof s.chunkIndex === "number" ? ` · chunk ${s.chunkIndex}` : ""}
                              </span>
                              <pre className="mt-1 whitespace-pre-wrap font-sans text-slate-700 dark:text-slate-300">
                                {s.excerpt}
                              </pre>
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            <form onSubmit={onSubmitChat} className="flex flex-col gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about the indexed PDF…"
                rows={3}
                disabled={!sessionId || chatLoading}
                className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={!sessionId || chatLoading || !input.trim()}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
              >
                {chatLoading ? "Thinking…" : "Send"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
