/**
 * Client for the server-side OG-unfurl endpoint (`GET /unfurl?url=…`).
 *
 * The server fetches the URL, parses its OpenGraph/title/favicon metadata, and
 * returns JSON. Calling it from the client avoids browser CORS restrictions
 * and keeps raw URL traffic off the device (it hits our own server, not the
 * target site directly). The result is cached in-memory for the session so
 * typing the same URL twice in different blocks doesn't refetch.
 */
import { useCallback, useRef } from 'react';
import { getSyncBase, getSyncPrefix } from '@drakkar.software/octovault-sdk';
import type { BookmarkMeta } from '@drakkar.software/octovault-sdk';

/** Cache: url → resolved metadata */
const sessionCache = new Map<string, BookmarkMeta>();

export interface UseUnfurlResult {
  unfurl: (url: string) => Promise<BookmarkMeta | null>;
}

export function useUnfurl(): UseUnfurlResult {
  // Use a ref to hold the cache ref so we don't re-create on every render.
  const cacheRef = useRef(sessionCache);

  const unfurl = useCallback(async (url: string): Promise<BookmarkMeta | null> => {
    const cached = cacheRef.current.get(url);
    if (cached) return cached;

    const base = getSyncBase();
    const prefix = getSyncPrefix();
    const endpoint = `${base}${prefix}/unfurl?url=${encodeURIComponent(url)}`;

    try {
      const resp = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return null;
      const json = await resp.json() as {
        title?: string;
        description?: string;
        image?: string;
        favicon?: string;
      };
      if (!json.title) return null;
      const meta: BookmarkMeta = {
        title: json.title,
        description: json.description,
        image: json.image,
        favicon: json.favicon,
        fetchedFor: url,
      };
      cacheRef.current.set(url, meta);
      return meta;
    } catch {
      return null;
    }
  }, []);

  return { unfurl };
}
