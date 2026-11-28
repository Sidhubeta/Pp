import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

function isHttpsRequest(request: Request): boolean {
  try {
    const parsed = new URL(request.url);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return parsed.protocol === "https:";
    }
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    if (forwardedProto === "https") return true;
    if (forwardedProto === "http") return false;
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function shouldSkipHeaderWrap(pathname: string): boolean {
  // Never re-wrap TanStack Start RPC responses (Set-Cookie streams) or static assets (CSS/JS/media/fonts)
  if (
    pathname.startsWith("/_serverFn") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/animations/") ||
    pathname.startsWith("/fonts/") ||
    pathname.startsWith("/sounds/")
  ) {
    return true;
  }
  return /\.(?:css|js|mjs|map|json|webmanifest|txt|xml|png|jpe?g|webp|svg|ico|mp4|mp3|ttf|woff2?)$/i.test(pathname);
}

function cloneHeadersPreservingCookies(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") {
      headers.append(key, value);
    }
  });
  const getSetCookie = (source as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === "function") {
    for (const cookie of getSetCookie.call(source)) {
      headers.append("set-cookie", cookie);
    }
  } else {
    const single = source.get("set-cookie");
    if (single) headers.append("set-cookie", single);
  }
  return headers;
}

function applySecurityHeaders(headers: Headers, request: Request, pathname: string): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Accept-CH", "Sec-CH-UA-Model, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version");
  // Allow camera on same-origin across all routes so PWA (Add to Home Screen)
  // and SPA navigations starting on "/" or "/login" can request camera on "/scan".
  headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=()",
  );

  if (isHttpsRequest(request)) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  if (
    pathname.startsWith("/zimadmin") ||
    pathname.startsWith("/api/")
  ) {
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
}

function withSecurityHeaders(request: Request, response: Response): Response {
  let pathname = "";
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    pathname = "";
  }

  if (shouldSkipHeaderWrap(pathname)) {
    return response;
  }

  // Mutate in-place when possible to avoid disturbing streams or Set-Cookie headers
  try {
    applySecurityHeaders(response.headers, request, pathname);
    return response;
  } catch {
    const headers = cloneHeadersPreservingCookies(response.headers);
    applySecurityHeaders(headers, request, pathname);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // Consolidate www.zimbolaclux.shop -> https://zimbolaclux.shop (301) for clean SEO indexing
      try {
        const parsedUrl = new URL(request.url);
        if (parsedUrl.hostname.toLowerCase() === "www.zimbolaclux.shop") {
          parsedUrl.protocol = "https:";
          parsedUrl.hostname = "zimbolaclux.shop";
          return Response.redirect(parsedUrl.toString(), 301);
        }
      } catch {
        // ignore malformed URL
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      return withSecurityHeaders(request, normalized);
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        request,
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
