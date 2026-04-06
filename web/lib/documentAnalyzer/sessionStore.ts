import "server-only";

import type { VectorStoreIndex } from "llamaindex";

type Entry = {
  index: VectorStoreIndex;
  createdAt: number;
  filename: string;
};

const TTL_MS = 60 * 60 * 1000;
const MAX_SESSIONS = 40;
const store = new Map<string, Entry>();

function prune(): void {
  const now = Date.now();
  for (const [id, e] of store) {
    if (now - e.createdAt > TTL_MS) store.delete(id);
  }
  while (store.size > MAX_SESSIONS) {
    let oldest: string | null = null;
    let t = Infinity;
    for (const [id, e] of store) {
      if (e.createdAt < t) {
        t = e.createdAt;
        oldest = id;
      }
    }
    if (oldest) store.delete(oldest);
    else break;
  }
}

export function saveAnalyzerIndex(
  sessionId: string,
  index: VectorStoreIndex,
  filename: string
): void {
  prune();
  store.set(sessionId, { index, createdAt: Date.now(), filename });
}

export function getAnalyzerIndex(sessionId: string): VectorStoreIndex | null {
  prune();
  return store.get(sessionId)?.index ?? null;
}

export function touchSession(sessionId: string): void {
  const e = store.get(sessionId);
  if (e) e.createdAt = Date.now();
}
