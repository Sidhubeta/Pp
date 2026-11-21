import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
  redirect,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { getAccessStatus, type AccessDeniedReason } from "@/lib/access.functions";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-black px-4 text-white">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-bold tracking-tight">404</h1>
        <h2 className="mt-3 text-lg font-semibold">Page not found</h2>
        <p className="mt-1.5 text-sm text-white/55">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-[#0A84FF] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-black px-4 text-white">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">This page didn&apos;t load</h1>
        <p className="mt-2 text-sm text-white/55">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-xl bg-[#0A84FF] px-4 py-2 text-sm font-semibold text-white"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-[#1C1C1E] px-4 py-2 text-sm font-semibold text-white"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

const PUBLIC_PATHS = new Set(["/login", "/unlock", "/zimadmin"]);

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ location }) => {
    if (PUBLIC_PATHS.has(location.pathname)) {
      return;
    }

    let deniedReason: AccessDeniedReason = "none";

    try {
      const access = await getAccessStatus();
      if (access.granted) return;
      deniedReason = access.reason;
    } catch {
      // Fail closed: protected pages never render when access check is unavailable.
    }

    throw redirect({
      to: "/login",
      search: deniedReason !== "none" ? { reason: deniedReason } : {},
      replace: true,
    });
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "Zimbola Clux" },
      { name: "description", content: "A simple payment experience." },
      { property: "og:title", content: "Zimbola Clux" },
      { property: "og:description", content: "A simple payment experience." },
      { property: "og:type", content: "website" },
      { name: "theme-color", content: "#000000" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function LiveSessionGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (PUBLIC_PATHS.has(pathname)) return;
    let active = true;

    const verify = async () => {
      try {
        const res = await getAccessStatus();
        if (!active) return;
        if (!res.granted) {
          const qs = res.reason !== "none" ? `?reason=${encodeURIComponent(res.reason)}` : "";
          window.location.replace(`/login${qs}`);
        }
      } catch {
        // Ignore transient offline hiccups while user is mid-screen
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void verify();
    };

    const interval = window.setInterval(() => void verify(), 45_000);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname]);

  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <LiveSessionGuard />
      <Outlet />
      <Toaster
        position="bottom-center"
        offset={{ bottom: "92px" }}
        mobileOffset={{ bottom: "92px", left: "0px", right: "0px" }}
        toastOptions={{
          style: {
            background: "rgba(255,255,255,0.78)",
            color: "#141414",
            border: "1px solid rgba(255,255,255,0.45)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            fontWeight: 600,
            letterSpacing: "0.06em",
          },
        }}
      />
    </QueryClientProvider>
  );
}
