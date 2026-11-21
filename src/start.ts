import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

function shouldRethrow(error: unknown): boolean {
  if (error instanceof Response) return true;
  if (error != null && typeof error === "object") {
    if (
      "statusCode" in error ||
      "status" in error ||
      "isRedirect" in error ||
      "options" in error ||
      "to" in error
    ) {
      return true;
    }
  }
  return false;
}

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    return await next();
  } catch (error) {
    if (shouldRethrow(error)) {
      throw error;
    }
    console.error(error);

    const url = request?.url ?? "";
    const accept = request?.headers.get("accept") ?? "";
    const isJsonRpc =
      url.includes("/_serverFn") ||
      url.includes("/api/") ||
      accept.includes("application/json");

    if (isJsonRpc) {
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        {
          status: 500,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        },
      );
    }

    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Re-add CSRF protection explicitly when defining src/start.ts.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
