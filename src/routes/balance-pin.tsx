import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { resetBalanceIntro } from "@/lib/balanceIntro";

export const Route = createFileRoute("/balance-pin")({
  head: () => ({
    meta: [
      { title: "Check Balance — Enter UPI PIN" },
      {
        name: "description",
        content: "Enter your UPI PIN to check your account balance.",
      },
      { property: "og:title", content: "Check Balance — Enter UPI PIN" },
      {
        property: "og:description",
        content: "Enter your UPI PIN to check your account balance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BalancePinPage,
});

const PIN_LENGTH = 6;

function BalancePinPage() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");

  const pressKey = (key: string) => {
    if (key === "back") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (pin.length >= PIN_LENGTH) return;
    setPin((p) => p + key);
  };

  const handleCheck = () => {
    if (pin.length !== PIN_LENGTH) return;
    resetBalanceIntro();
    navigate({ to: "/balance-success" });
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "check"];

  return (
    <div className="flex h-dvh w-full justify-center overflow-hidden bg-[#f0f0f0]">
      <div className="flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-white">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between px-5 pt-4 sm:pt-6">
          <div>
            {/* UPI logo */}
            <div className="flex items-center gap-1">
              <span className="text-3xl font-black italic tracking-tight text-[#3d3d3d]">
                UPI
              </span>
              <svg className="h-7 w-5" viewBox="0 0 20 28" fill="none">
                <path d="M0 0l8 14-8 14h6l8-14-8-14H0z" fill="#f7941d" />
                <path d="M8 0l8 14-8 14h4l8-14-8-14H8z" fill="#00843d" />
              </svg>
            </div>
            <p className="mt-0.5 text-[8px] font-semibold tracking-wide text-[#3d3d3d]">
              UNIFIED PAYMENTS INTERFACE
            </p>
            <p className="mt-3 text-lg text-black sm:mt-4 sm:text-xl">
              Kotak Mahindra Bank
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => navigate({ to: "/check-balance" })}
            className="p-1 text-zinc-400 transition-colors hover:text-zinc-600"
          >
            <svg
              className="h-8 w-8 sm:h-9 sm:w-9"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Info banner */}
        <div className="mx-5 mt-3 flex shrink-0 items-center justify-between rounded-xl bg-[#e7eaf7] px-5 py-3.5 sm:mt-4 sm:py-5">
          <p className="max-w-[75%] text-lg font-bold leading-snug text-black sm:text-xl">
            You are checking your account balance
          </p>
          <div className="relative shrink-0">
            <svg
              className="h-10 w-10 text-black"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
            >
              <rect x="3" y="4" width="13" height="16" rx="2.5" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.5 8h6M6.5 11h6M6.5 8c3 0 4.5 1.5 4.5 3s-1.5 3-4.5 3l5 4.5"
              />
            </svg>
            <span className="absolute right-0 top-0 text-sm font-bold text-black">?</span>
          </div>
        </div>

        {/* PIN entry */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-2">
          <p className="text-lg font-semibold text-black sm:text-xl">
            Enter your PIN
          </p>
          <div className="mt-5 flex items-center gap-4 sm:mt-7">
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <span
                key={i}
                className={`h-5 w-5 rounded-full border-2 transition-colors ${
                  i < pin.length
                    ? "border-[#1a3c8f] bg-[#1a3c8f]"
                    : "border-zinc-800 bg-transparent"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Warning */}
        <div className="flex shrink-0 items-center justify-center gap-2 pb-2.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f5a623]">
            <span className="text-xs font-bold text-white">!</span>
          </span>
          <p className="text-xs text-zinc-500 sm:text-sm">
            Never enter your UPI PIN to receive money
          </p>
        </div>

        {/* Keypad */}
        <div className="shrink-0 bg-[#ececec] px-3 pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-3 gap-2">
            {keys.map((key) => {
              if (key === "back") {
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label="Delete"
                    onClick={() => pressKey("back")}
                    className="flex h-[clamp(48px,7.2dvh,64px)] items-center justify-center rounded-full bg-[#c9cbe8] active:bg-[#b5b8dd]"
                  >
                    <svg
                      className="h-7 w-7 text-black"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 5h11a1 1 0 011 1v12a1 1 0 01-1 1H9l-6-7 6-7z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 10l4 4m0-4l-4 4"
                      />
                    </svg>
                  </button>
                );
              }
              if (key === "check") {
                const ready = pin.length === PIN_LENGTH;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={handleCheck}
                    disabled={!ready}
                    className={`flex h-[clamp(48px,7.2dvh,64px)] items-center justify-center rounded-full text-xl font-semibold text-white transition-colors ${
                      ready ? "bg-[#1a3c8f] active:bg-[#16326f]" : "bg-[#1a3c8f]/50"
                    }`}
                  >
                    Check
                  </button>
                );
              }
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => pressKey(key)}
                  className="flex h-[clamp(48px,7.2dvh,64px)] items-center justify-center rounded-full bg-white text-2xl text-black active:bg-zinc-200 sm:text-3xl"
                >
                  {key}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
