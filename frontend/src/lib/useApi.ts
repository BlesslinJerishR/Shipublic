'use client';

/**
 * Tiny SWR-style hook with a process-wide cache. Components fetching the same
 * key share data, avoid duplicate network requests, and can revalidate on
 * demand. Designed to be dependency-free.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface CacheEntry<T> {
  data?: T;
  error?: any;
  timestamp: number;
  inflight?: Promise<T>;
}

const cache = new Map<string, CacheEntry<any>>();
const subscribers = new Map<string, Set<() => void>>();

function notify(key: string) {
  const subs = subscribers.get(key);
  if (!subs) return;
  for (const fn of subs) fn();
}

function subscribe(key: string, fn: () => void) {
  let set = subscribers.get(key);
  if (!set) { set = new Set(); subscribers.set(key, set); }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (!set!.size) subscribers.delete(key);
  };
}

async function runFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry?.inflight) return entry.inflight;
  const promise = (async () => {
    try {
      const data = await fetcher();
      cache.set(key, { data, timestamp: Date.now() });
      notify(key);
      return data;
    } catch (error) {
      const prev = cache.get(key);
      cache.set(key, { ...(prev || {}), error, timestamp: Date.now() });
      notify(key);
      throw error;
    } finally {
      const cur = cache.get(key);
      if (cur) cur.inflight = undefined;
    }
  })();
  cache.set(key, { ...(cache.get(key) || { timestamp: 0 }), inflight: promise });
  return promise;
}

export interface UseApiOptions {
  /** If true, hook will not fetch (useful while waiting on params). */
  skip?: boolean;
  /** Treat cached data older than this many ms as stale and revalidate. */
  staleMs?: number;
}

export function useApi<T = unknown>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts: UseApiOptions = {},
) {
  const { skip = false, staleMs = 30_000 } = opts;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  // Subscribe to cache updates for this key.
  useEffect(() => {
    if (!key) return;
    return subscribe(key, rerender);
  }, [key, rerender]);

  // Initial fetch / revalidation when stale.
  useEffect(() => {
    if (!key || skip) return;
    const entry = cache.get(key);
    const isStale = !entry || Date.now() - entry.timestamp > staleMs;
    if (isStale && !entry?.inflight) {
      runFetch(key, () => fetcherRef.current()).catch(() => {});
    }
  }, [key, skip, staleMs]);

  const entry = key ? cache.get(key) : undefined;
  const data = entry?.data as T | undefined;
  const error = entry?.error;
  const isLoading = !!key && !skip && !entry?.data && !entry?.error;

  const mutate = useCallback(
    async (next?: T | ((prev: T | undefined) => T)) => {
      if (!key) return;
      if (next !== undefined) {
        const prev = cache.get(key)?.data as T | undefined;
        const value = typeof next === 'function' ? (next as any)(prev) : next;
        cache.set(key, { data: value, timestamp: Date.now() });
        notify(key);
        return;
      }
      await runFetch(key, () => fetcherRef.current()).catch(() => {});
    },
    [key],
  );

  return { data, error, isLoading, mutate };
}

/** Imperatively drop one cache entry (e.g., after deletes). */
export function invalidate(keyPrefix: string) {
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(keyPrefix)) {
      cache.delete(k);
      notify(k);
    }
  }
}
