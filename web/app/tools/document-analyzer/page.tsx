"use client";

import dynamic from "next/dynamic";

const DocumentAnalyzerClient = dynamic(() => import("./DocumentAnalyzerClient"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[50vh] items-center justify-center bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-400">
      Loading document analyzer…
    </div>
  ),
});

export default function DocumentAnalyzerPage() {
  return <DocumentAnalyzerClient />;
}
