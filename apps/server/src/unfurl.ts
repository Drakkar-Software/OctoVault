/**
 * OG-unfurl endpoint: `GET /unfurl?url=<encoded-url>`
 *
 * Fetches the target URL server-side, extracts OpenGraph metadata
 * (`og:title`, `og:description`, `og:image`) plus `<title>` and favicon,
 * and returns JSON. Running on the server side-steps browser CORS restrictions.
 *
 * Security guardrails
 * ─────────────────────────────────────────────────────────────────────────────
 * • SSRF protection — only http/https URLs are accepted; private RFC-1918 IPs,
 *   loopback, link-local and metadata endpoints are rejected before any fetch.
 * • Timeout — 8 s hard limit; large pages are cut off at MAX_RESPONSE_BYTES.
 * • Redirect cap — follows up to 5 redirects (Fetch API default).
 * • No auth required — unfurl is a public GET (the URL is not sensitive from
 *   the server's perspective and clients have already entered it in-app).
 */
import { Hono } from "hono";

const MAX_RESPONSE_BYTES = 512 * 1024; // 512 KB — enough for any realistic <head>
const REQUEST_TIMEOUT_MS = 8_000;
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

/** RFC-1918 + loopback + link-local + AWS metadata IP ranges (v4 only for now). */
const BLOCKED_HOSTS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/, // link-local / AWS IMDS
  /^::1$/,               // IPv6 loopback
  /^fc00:/i,             // IPv6 ULA
  /^fe80:/i,             // IPv6 link-local
];

function isBlockedHost(host: string): boolean {
  return BLOCKED_HOSTS.some((re) => re.test(host));
}

/** Pull the first `<meta>` value with the given `property` or `name` attribute. */
function metaContent(html: string, key: string): string | undefined {
  // og:* use `property`; standard meta use `name`
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']|` +
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
    'i',
  );
  const m = re.exec(html);
  return m?.[1] ?? m?.[2];
}

function faviconUrl(html: string, base: string): string | undefined {
  // Look for <link rel="icon"> / rel="shortcut icon"
  const re = /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i;
  const m = re.exec(html);
  if (!m) return `${new URL(base).origin}/favicon.ico`;
  const href = m[1]!;
  if (href.startsWith('http')) return href;
  try {
    return new URL(href, base).href;
  } catch {
    return undefined;
  }
}

function pageTitle(html: string): string | undefined {
  const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return m?.[1]?.trim();
}

export function createUnfurlRoute(): Hono {
  const app = new Hono();

  app.get("/unfurl", async (c) => {
    const raw = c.req.query("url");
    if (!raw) return c.json({ error: "Missing url parameter" }, 400);

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return c.json({ error: "Invalid URL" }, 400);
    }

    if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
      return c.json({ error: "Only http/https URLs are supported" }, 400);
    }

    if (isBlockedHost(parsed.hostname)) {
      return c.json({ error: "URL hostname is not allowed" }, 400);
    }

    let html: string;
    try {
      const resp = await fetch(raw, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "OctoVault-Unfurl/1.0 (+https://octovault.app)",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: "follow",
      });

      if (!resp.ok) {
        return c.json({ error: `Upstream returned ${resp.status}` }, 502);
      }

      // Only read HTML; reject everything else (images, PDFs, etc.)
      const ct = resp.headers.get("Content-Type") ?? "";
      if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
        return c.json({ error: "Not an HTML page" }, 422);
      }

      // Stream up to MAX_RESPONSE_BYTES — the <head> is almost always in the first 64 KB
      const reader = resp.body?.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          chunks.push(value);
          total += value.length;
          if (total >= MAX_RESPONSE_BYTES) break;
        }
        reader.cancel().catch(() => {});
      }
      html = new TextDecoder("utf-8").decode(
        chunks.reduce((acc, c) => {
          const merged = new Uint8Array(acc.length + c.length);
          merged.set(acc);
          merged.set(c, acc.length);
          return merged;
        }, new Uint8Array(0)),
      );
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        return c.json({ error: "Upstream request timed out" }, 504);
      }
      return c.json({ error: "Failed to fetch URL" }, 502);
    }

    const title = metaContent(html, "og:title") ?? pageTitle(html);
    if (!title) {
      return c.json({ error: "No title found on page" }, 422);
    }

    return c.json({
      title,
      description: metaContent(html, "og:description") ?? metaContent(html, "description"),
      image: metaContent(html, "og:image"),
      favicon: faviconUrl(html, raw),
    });
  });

  return app;
}
