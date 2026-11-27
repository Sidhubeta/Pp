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
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";
import {
  getAccessStatus,
  resumeDeviceSession,
  type AccessDeniedReason,
} from "@/lib/access.functions";
import {
  getExistingClientDeviceIdAsync,
  getRememberedKey,
  isAutoLoginEnabled,
  saveClientDeviceId,
  setAutoLoginEnabled,
} from "@/lib/rememberedKey";
import { collectDeviceInfo, computeHardwareFingerprint } from "@/lib/deviceInfo";

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
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      { title: "PhonePe" },
      { name: "description", content: "UPI Payments, Money Transfers & More." },
      { property: "og:title", content: "PhonePe" },
      { property: "og:description", content: "UPI Payments, Money Transfers & More." },
      { property: "og:type", content: "website" },
      { name: "theme-color", content: "#060606" },
      { name: "application-name", content: "PhonePe" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black" },
      { name: "apple-mobile-web-app-title", content: "PhonePe" },
      { name: "msapplication-TileColor", content: "#5F259F" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest?v=2" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png?v=2" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png?v=2" },
      { rel: "icon", href: "/favicon.ico?v=2", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const ZIMBOLA_JSON_LD = "{\"@context\":\"https://schema.org\",\"@graph\":[{\"@type\":\"WebSite\",\"@id\":\"https://zimbolaclux.shop/#website\",\"name\":\"ZimbolaClux\",\"alternateName\":[\"Zimbola\",\"Zimbola Clux\",\"ZimbolaClux Shop\",\"ZimbolaClux.shop\",\"Zimbola Online Store\",\"ZimbolaClux India\",\"Zimbola Official\"],\"url\":\"https://zimbolaclux.shop/\",\"inLanguage\":\"en-IN\",\"description\":\"Official ZimbolaClux.shop website in India for Zimbola digital services, online store, account login, and 24/7 customer support.\"},{\"@type\":\"Organization\",\"@id\":\"https://zimbolaclux.shop/#organization\",\"name\":\"ZimbolaClux\",\"alternateName\":[\"Zimbola\",\"Zimbola Clux\",\"ZimbolaClux Official\",\"ZimbolaClux India\"],\"url\":\"https://zimbolaclux.shop/\",\"areaServed\":\"IN\",\"sameAs\":[\"https://t.me/ZimbolaClux\"]},{\"@type\":\"FAQPage\",\"mainEntity\":[{\"@type\":\"Question\",\"name\":\"What is ZimbolaClux?\",\"acceptedAnswer\":{\"@type\":\"Answer\",\"text\":\"ZimbolaClux (ZimbolaClux.shop) is the official Zimbola digital platform and online store in India offering instant access keys, services, and customer support.\"}},{\"@type\":\"Question\",\"name\":\"What is the official ZimbolaClux website link?\",\"acceptedAnswer\":{\"@type\":\"Answer\",\"text\":\"The official ZimbolaClux website address is https://zimbolaclux.shop.\"}},{\"@type\":\"Question\",\"name\":\"How to use ZimbolaClux login and contact support?\",\"acceptedAnswer\":{\"@type\":\"Answer\",\"text\":\"Visit https://zimbolaclux.shop/login to sign in with your Zimbola access key or contact ZimbolaClux India customer support.\"}}]}]}";

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: ZIMBOLA_JSON_LD }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function getKickOverlayCopy(reason: AccessDeniedReason): { title: string; subtitle: string } {
  switch (reason) {
    case "paused":
      return {
        title: "Access Paused",
        subtitle: "Your access was paused by the admin.",
      };
    case "expired":
      return {
        title: "Key Expired",
        subtitle: "Your access key has expired.",
      };
    default:
      return {
        title: "Logged Out",
        subtitle: "Your session was removed by the admin.",
      };
  }
}

function LiveSessionGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [kickReason, setKickReason] = useState<AccessDeniedReason | null>(null);
  const inFlightRef = useRef(false);
  const kickingRef = useRef(false);

  useEffect(() => {
    if (PUBLIC_PATHS.has(pathname)) return;
    let active = true;

    const triggerInstantLogout = (reason: AccessDeniedReason) => {
      if (kickingRef.current) return;
      kickingRef.current = true;
      setAutoLoginEnabled(false);
      setKickReason(reason);
      const qs = reason !== "none" ? `?reason=${encodeURIComponent(reason)}` : "";
      window.setTimeout(() => {
        window.location.replace(`/login${qs}`);
      }, 650);
    };

    const verify = async () => {
      if (!active || inFlightRef.current || kickingRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      inFlightRef.current = true;
      try {
        const res = await getAccessStatus();
        if (!active || kickingRef.current) return;
        if (res.granted) return;

        // If cookie was dropped or rotated after redeploy (reason === "none" or "revoked"),
        // verify against persistent 3-layer deviceId + hardware fingerprint before kicking out.
        if ((res.reason === "none" || res.reason === "revoked") && isAutoLoginEnabled()) {
          const saved = getRememberedKey();
          if (saved?.key) {
            const [savedDeviceId, deviceInfo] = await Promise.all([
              getExistingClientDeviceIdAsync().catch(() => undefined),
              collectDeviceInfo().catch(() => undefined),
            ]);
            const deviceFp = await computeHardwareFingerprint(deviceInfo).catch(() => undefined);
            const restored = await resumeDeviceSession({
              data: {
                key: saved.key,
                ...(savedDeviceId ? { clientDeviceId: savedDeviceId } : {}),
                ...(deviceFp ? { deviceFp } : {}),
                ...(deviceInfo ? { deviceInfo } : {}),
              },
            });
            if (!active || kickingRef.current) return;
            if (restored?.ok) {
              if ("deviceId" in restored && typeof restored.deviceId === "string" && restored.deviceId) {
                saveClientDeviceId(restored.deviceId);
              }
              return;
            }
            triggerInstantLogout(restored?.reason ?? "revoked");
            return;
          }
        }

        // Admin paused / deleted key / removed device / key expired -> instant logout!
        triggerInstantLogout(res.reason);
      } catch {
        // Ignore transient offline hiccups while user is mid-screen
      } finally {
        inFlightRef.current = false;
      }
    };

    const onWake = () => {
      if (document.visibilityState === "visible") void verify();
    };

    // Fast 2.5s live check while app is open -> instant admin kick with zero refresh/restart
    void verify();
    const interval = window.setInterval(() => void verify(), 2_500);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [pathname]);

  if (!kickReason) return null;
  const copy = getKickOverlayCopy(kickReason);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 px-6 backdrop-blur-sm"
    >
      <div className="ios-hud-pop w-full max-w-[300px] rounded-[22px] border border-white/10 bg-[#1a171e] px-6 py-6 text-center text-white shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FF453A]/15 text-[#FF453A]">
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </div>
        <p className="mt-3.5 text-[17px] font-bold tracking-tight text-white">{copy.title}</p>
        <p className="mt-1 text-[13px] leading-snug text-white/60">{copy.subtitle}</p>
      </div>
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Non-fatal if browser restricts service workers (e.g. private mode)
      });
  }, []);

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
