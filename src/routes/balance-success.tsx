import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import glowtripAd from "../assets/glowtrip-ad.png";
import { LottiePlayer, type LottieSegment } from "@/components/LottiePlayer";
import {
  markBalanceIntroPlayed,
  shouldPlayBalanceIntro,
} from "@/lib/balanceIntro";
import {
  DEFAULT_BALANCE,
  formatBalance,
  getBalance,
  setBalance,
} from "../lib/balance";

const TRANSACTION_SEGMENTS: LottieSegment[] = [
  [0, 90],
  [120, 210],
];

export const Route = createFileRoute("/balance-success")({
  head: () => ({
    meta: [
      { title: "Balance Check Successful — Kotak Mahindra Bank" },
      {
        name: "description",
        content:
          "Your balance check was successful. See your available balance and latest offers.",
      },
      {
        property: "og:title",
        content: "Balance Check Successful — Kotak Mahindra Bank",
      },
      {
        property: "og:description",
        content:
          "Your balance check was successful. See your available balance and latest offers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BalanceSuccessPage,
});

function KotakMark() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white">
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
        <path d="M6 21c4-7 16-7 20 0-4-2-16-2-20 0Z" fill="#0072bc" />
        <path d="M6 11c4 7 16 7 20 0-4 2-16 2-20 0Z" fill="#ed1c24" />
      </svg>
    </span>
  );
}

function ShareMarketMark() {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black sm:h-14 sm:w-14">
      <svg viewBox="0 0 48 48" className="h-12 w-12 sm:h-14 sm:w-14" aria-hidden="true">
        <circle cx="24" cy="20" r="11" fill="none" stroke="#9a5bff" strokeWidth="1.4" />
        <ellipse cx="24" cy="20" rx="5" ry="11" fill="none" stroke="#9a5bff" strokeWidth="1.2" />
        <path d="M13 20h22" stroke="#9a5bff" strokeWidth="1.2" />
        <path d="M15.5 14.5h17M15.5 25.5h17" stroke="#9a5bff" strokeWidth="1" />
        <rect x="15" y="33" width="3" height="7" rx="1" fill="#22c55e" />
        <rect x="21" y="30" width="3" height="10" rx="1" fill="#ef4444" />
        <rect x="27" y="34" width="3" height="6" rx="1" fill="#22c55e" />
      </svg>
    </span>
  );
}

function BalanceSuccessPage() {
  const navigate = useNavigate();
  // Start from the default on both server and client to keep SSR markup
  // matching; localStorage is only read after hydration.
  const [balance, setBalanceState] = useState(DEFAULT_BALANCE);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(() => shouldPlayBalanceIntro());

  useEffect(() => {
    setBalanceState(getBalance());
  }, []);

  useEffect(() => {
    if (!loading) return;
    markBalanceIntroPlayed();
    const timer = window.setTimeout(() => setLoading(false), 1800);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const startEditing = () => {
    setDraft(balance.toFixed(2));
    setEditing(true);
  };

  const saveBalance = () => {
    const parsed = Number(draft.replace(/,/g, "").trim());
    if (Number.isFinite(parsed) && parsed >= 0) {
      setBalance(parsed);
      setBalanceState(parsed);
    }
    setEditing(false);
  };

  if (loading) {
    return (
      <main className="flex h-dvh w-full justify-center overflow-hidden bg-[#121212]">
        <div className="flex h-full w-full max-w-[430px] flex-col items-center justify-center bg-[#121212] px-6 text-white">
          <LottiePlayer
            path="/animations/loadingbal.json"
            renderer="svg"
            loop
            className="h-20 w-20"
            ariaLabel="Fetching bank balance"
          />
          <p className="mt-5 text-base font-semibold text-white">
            Fetching Bank Balance
          </p>
          <p className="mt-1 text-xs text-white/55">
            Kotak Mahindra Bank-4539
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="h-dvh w-full overflow-hidden bg-black">
      <div className="mx-auto flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-black px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 text-white sm:pt-6">
        {/* Success mark */}
        <div className="flex shrink-0 flex-col items-center">
          <LottiePlayer
            path="/animations/transaction.json"
            renderer="svg"
            loop
            segments={TRANSACTION_SEGMENTS}
            className="h-[88px] w-[88px]"
            ariaLabel="Balance check successful"
          />
          <p className="mt-2 text-[17px] font-semibold text-white">
            Balance check successful
          </p>

          {/* Bank */}
          <div className="mt-2.5 flex items-center gap-2.5">
            <KotakMark />
            <span className="text-[15px] text-white">
              Kotak Mahindra Bank-4539
            </span>
          </div>

          {/* Balance */}
          <p className="mt-4 text-[13px] text-white/55">Available Balance</p>
          {editing ? (
            <div className="mt-1.5 flex flex-col items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-white/20 bg-[#1c1c1c] px-3 py-1">
                <span className="text-[22px] font-bold text-white">₹</span>
                <input
                  autoFocus
                  inputMode="decimal"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveBalance();
                    if (e.key === "Escape") setEditing(false);
                  }}
                  className="w-36 bg-transparent text-[22px] font-bold tracking-tight text-white outline-none placeholder:text-white/30"
                  placeholder="0.00"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="cursor-pointer rounded-lg px-4 py-1 text-[14px] font-semibold text-white/60 transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveBalance}
                  className="cursor-pointer rounded-lg bg-[#5f259f] px-5 py-1 text-[14px] font-semibold text-white transition-colors hover:bg-[#6d2bb3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={startEditing}
              aria-label="Edit balance"
              className="group mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-0.5 transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="text-[28px] font-bold tracking-tight text-white sm:text-[30px]">
                ₹{formatBalance(balance)}
              </span>
            </button>
          )}
        </div>

        {/* Middle promos — sized responsively to fit screen */}
        <div className="flex min-h-0 flex-1 flex-col justify-center py-2">
          {/* Ad card */}
          <section className="relative overflow-hidden rounded-2xl bg-[#22d9e0]">
            <img
              src={glowtripAd}
              alt="The Glow Trip sale: flat ₹200 off on orders above ₹499"
              width={1200}
              height={912}
              loading="lazy"
              className="block h-[clamp(140px,23dvh,200px)] w-full select-none object-cover object-bottom"
              draggable={false}
            />
            <span className="absolute left-1.5 top-1.5 rounded bg-black/25 px-1.5 py-0.5 text-[9px] font-semibold text-black/70">
              Ad
            </span>

            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-4 pt-3">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-black/60 sm:h-20 sm:w-20">
                <span className="text-center text-[10px] font-bold leading-tight text-black sm:text-[11px]">
                  THE GLOW
                  <br />
                  TRIP
                  <br />
                  Sale
                </span>
              </span>
              <span className="min-w-0 flex-1 text-right">
                <span className="block text-[20px] font-extrabold leading-none text-black sm:text-[22px]">
                  Flat{" "}
                  <span className="align-baseline text-[24px] sm:text-[28px]">
                    ₹200
                  </span>{" "}
                  OFF
                </span>
                <span className="mt-1 block text-[11px] font-semibold text-black sm:text-[12px]">
                  On orders above ₹499
                </span>
                <span className="mt-1 block text-[8px] leading-snug text-black/75">
                  *Add products worth ₹499 to the cart to avail the offer. Apply
                  PhonePe code at checkout.
                </span>
              </span>
            </div>
          </section>

          {/* Mutual funds promo */}
          <section className="mt-3">
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-[#1c1c1c] px-3.5 py-2.5 text-left transition-colors hover:bg-[#232323] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ShareMarketMark />
              <span className="min-w-0 flex-1 text-[14px] font-bold leading-snug text-white sm:text-[15px]">
                Don&apos;t just save, grow your money with Mutual Funds. Invest
                now!
              </span>
              <ChevronRight
                className="h-6 w-6 shrink-0 text-[#9a5bff]"
                strokeWidth={2.2}
              />
            </button>
          </section>
        </div>

        {/* Done */}
        <div className="shrink-0 border-t border-white/10 pt-1">
          <button
            type="button"
            onClick={() => navigate({ to: "/check-balance" })}
            className="w-full cursor-pointer rounded-lg py-2.5 text-center text-[17px] font-semibold text-[#8666c3] transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Done
          </button>
        </div>
      </div>
    </main>
  );
}
