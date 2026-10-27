// Exact counters (Firestore count() aggregations) for admin lists, without
// downloading the counted documents. Kept free of Firebase imports so the
// concurrency, cache and failure rules can be tested directly.

/** A count that could not be computed is `null`, never a misleading 0. */
export type ExactCount = number | null;

export type ExactCountCache = {
  get(key: string): number | undefined;
  set(key: string, value: number): void;
};

/** Results stay valid for `ttlMs`; failures are never stored. */
export function createExactCountCache(
  ttlMs: number,
  now: () => number = () => Date.now(),
): ExactCountCache {
  const entries = new Map<string, { value: number; expiresAt: number }>();

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      entries.set(key, { value, expiresAt: now() + ttlMs });
    },
  };
}

/** Runs `fn` over `items` with at most `limit` calls in flight. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker),
  );
  return results;
}

/**
 * Counts each key once: cached keys are not recounted, duplicate keys share
 * one request, and a failed count yields `null` for that key only.
 */
export async function loadExactCounts(
  keys: readonly string[],
  count: (key: string) => Promise<number>,
  options: { cache?: ExactCountCache; concurrency?: number } = {},
): Promise<Map<string, ExactCount>> {
  const { cache, concurrency = 6 } = options;
  const results = new Map<string, ExactCount>();
  const missing: string[] = [];

  for (const key of new Set(keys)) {
    const cached = cache?.get(key);
    if (cached === undefined) {
      missing.push(key);
    } else {
      results.set(key, cached);
    }
  }

  await mapWithConcurrency(missing, concurrency, async (key) => {
    try {
      const value = await count(key);
      cache?.set(key, value);
      results.set(key, value);
    } catch (error) {
      console.warn("Exact count unavailable", { key, error });
      results.set(key, null);
    }
  });

  return results;
}
