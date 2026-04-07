import "server-only";

import type { EngineResponse } from "@llamaindex/core/schema";

import type { AnalyzerChatSource } from "@/types/documentAnalyzer";

const MAX = 8;
const EXCERPT = 280;

export function engineResponseToSources(res: EngineResponse): AnalyzerChatSource[] {
  const nodes = res.sourceNodes ?? [];
  return nodes.slice(0, MAX).map((ns) => {
    const node = ns.node as { getText?: () => string; text?: string };
    const raw = (typeof node.getText === "function" ? node.getText() : node.text) ?? "";
    const excerpt = raw.slice(0, EXCERPT).trim() || "(empty excerpt)";
    return {
      kind: "llamaindex" as const,
      excerpt,
      score: typeof ns.score === "number" ? ns.score : undefined,
    };
  });
}
