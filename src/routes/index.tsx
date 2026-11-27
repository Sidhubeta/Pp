import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HomeScreen } from "@/components/HomeScreen";
import { HistoryScreen } from "@/components/HistoryScreen";
import { AppIntroSplash } from "@/components/AppIntroSplash";
import qrScannerIcon from "@/assets/originals/qr_scanner_icon.png";

export const Route = createFileRoute("/")({
  // The active bottom-bar tab is part of the URL so that going back from
  // success-details restores whichever tab (home/history) the user left.
  validateSearch: (search) =>
    z.object({ tab: z.enum(["home", "history"]).optional() }).parse(search),
  head: () => ({
    meta: [
      { title: "Home — Money Transfers & More" },
      {
        name: "description",
        content: "Transfer money, recharge and pay bills in one place.",
      },
      { property: "og:title", content: "Home — Money Transfers & More" },
      {
        property: "og:description",
        content: "Transfer money, recharge and pay bills in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomeScreenPage,
});

function HomeScreenPage() {
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const activeTab: "home" | "history" = tab ?? "home";
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const updateHeader = () => setHasScrolled(window.scrollY > 40);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);

  const switchTab = (next: "home" | "history") => {
    if (next === activeTab) return;
    navigate({
      to: "/",
      search: next === "history" ? { tab: "history" } : {},
      replace: true,
    });
    window.scrollTo(0, 0);
    setHasScrolled(false);
  };

  return (
    <main className="min-h-dvh bg-[#060606]">
      <AppIntroSplash />
      <div className="relative mx-auto min-h-dvh w-full max-w-[430px] overflow-x-clip bg-[#060606] pb-[calc(76px+env(safe-area-inset-bottom))]">
        {activeTab === "home" ? (
          <HomeScreen hasScrolled={hasScrolled} />
        ) : (
          <HistoryScreen />
        )}

        {/* Coded Dark PhonePe Bottom Navigation Bar — flush center purple QR circle + authentic History icon */}
        <nav
          aria-label="Primary navigation"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[430px] border-t border-white/[0.06] bg-[#1a171b] pb-[env(safe-area-inset-bottom)]"
        >
          <div className="grid h-[74px] grid-cols-5 items-center">
            {/* Home */}
            <button
              type="button"
              aria-label="Home"
              onClick={() => switchTab("home")}
              className={`flex h-full flex-col items-center justify-center gap-1.5 transition-colors ${
                activeTab === "home"
                  ? "cursor-default text-white"
                  : "cursor-pointer text-[#a6a1ab] active:text-white"
              }`}
            >
              {activeTab === "home" ? (
                <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] fill-current">
                  <path d="M12 3.17L3.5 10.25A1 1 0 0 0 4.14 12H5v8a1 1 0 0 0 1 1h4.5v-6h3v6H18a1 1 0 0 0 1-1v-8h.86a1 1 0 0 0 .64-1.75L12 3.17z" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="h-[22px] w-[22px]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.85}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 10.5 12 3l9 7.5" />
                  <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
                </svg>
              )}
              <span className="text-[11px] font-medium leading-none">Home</span>
            </button>

            {/* Search */}
            <button
              type="button"
              aria-label="Search"
              className="flex h-full cursor-pointer flex-col items-center justify-center gap-1.5 text-[#a6a1ab] transition-colors active:text-white"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[22px] w-[22px]"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <span className="text-[11px] font-medium leading-none">Search</span>
            </button>

            {/* Center Flush Purple QR Scanner Circle (sits cleanly inside bar, matching 61041.mp4) */}
            <div className="flex h-full items-center justify-center">
              <button
                type="button"
                aria-label="Scan and pay"
                onClick={() => {
                  toast("MADE BY ZIMBOLA");
                  navigate({ to: "/scan" });
                }}
                className="flex h-[56px] w-[56px] cursor-pointer items-center justify-center rounded-full bg-gradient-to-b from-[#8418ef] to-[#6a09cf] text-white shadow-[0_4px_14px_rgba(123,6,235,0.4)] transition-transform active:scale-95"
              >
                <img
                  src={qrScannerIcon}
                  alt=""
                  className="h-[27px] w-[27px] select-none object-contain"
                  draggable={false}
                />
              </button>
            </div>

            {/* Alerts */}
            <button
              type="button"
              aria-label="Alerts"
              className="flex h-full cursor-pointer flex-col items-center justify-center gap-1.5 text-[#a6a1ab] transition-colors active:text-white"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[22px] w-[22px]"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.85}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4s2-1.5 2-6.5" />
                <path d="M10 19a2 2 0 0 0 4 0" />
              </svg>
              <span className="text-[11px] font-medium leading-none">Alerts</span>
            </button>

            {/* History — authentic PhonePe counter-clockwise circular arrow around clock hands */}
            <button
              type="button"
              aria-label="History"
              onClick={() => switchTab("history")}
              className={`flex h-full flex-col items-center justify-center gap-1.5 transition-colors ${
                activeTab === "history"
                  ? "cursor-default text-white"
                  : "cursor-pointer text-[#a6a1ab] active:text-white"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[22px] w-[22px]"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
                <path d="M12 7.5V12l3 2" />
              </svg>
              <span className="text-[11px] font-medium leading-none">History</span>
            </button>
          </div>
        </nav>
      </div>
    </main>
  );
}
