import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { resetSuccessIntro } from "@/lib/successIntro";
import { unlockPaymentSound } from "@/lib/paymentSound";
import npciUpiLogo from "@/assets/originals/ic_upi_npci_logo.png";

const pinSearchSchema = z.object({
  name: z.string().max(100).catch(""),
  upi: z.string().max(100).catch(""),
  amount: z.preprocess(
    (v) =>
      typeof v === "number"
        ? String(v)
        : typeof v === "string"
          ? v.replace(/"/g, "")
          : v,
    z.string().max(12).catch(""),
  ),
  message: z.string().max(100).catch(""),
});

export const Route = createFileRoute("/pin")({
  validateSearch: (search) => pinSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Enter UPI PIN" },
      { name: "description", content: "Enter your UPI PIN to authorize the payment." },
      { property: "og:title", content: "Enter UPI PIN" },
      { property: "og:description", content: "Enter your UPI PIN to authorize the payment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PinPage,
});

const PIN_LENGTH = 6;

function PinPage() {
  const navigate = useNavigate();
  const { name, upi, amount, message } = Route.useSearch();
  const [pin, setPin] = useState("");

  const formattedAmount = (() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || amount === "") return amount;
    return n % 1 === 0
      ? n.toLocaleString("en-IN")
      : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  })();

  const pressKey = (key: string) => {
    if (key === "back") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (pin.length >= PIN_LENGTH) return;
    setPin((p) => p + key);
  };

  const handlePay = () => {
    if (pin.length !== PIN_LENGTH) return;
    // Unlock audio on user gesture so paym.mp3 plays cleanly at the payment tick.
    unlockPaymentSound();
    // A new payment is starting: the success intro should play again.
    resetSuccessIntro();
    navigate({ to: "/success", search: { name, upi, amount, message } });
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "pay"];

  return (
    <div className="flex h-dvh w-full justify-center overflow-hidden bg-[#f0f0f0]">
      <div className="flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-white">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between px-5 pt-4 sm:pt-6">
          <div>
            {/* NPCI UPI logo */}
            <img
              src={npciUpiLogo}
              alt="NPCI UPI"
              className="-my-3 h-16 w-auto select-none object-contain"
              draggable={false}
            />
            <p className="mt-2.5 text-[15px] font-medium text-black">
              Kotak Mahindra Bank
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => navigate({ to: "/pay" })}
            className="p-1 text-zinc-500"
          >
            <svg className="h-8 w-8 sm:h-9 sm:w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Pay summary card */}
        <div className="mx-5 mt-3 flex shrink-0 items-center justify-between rounded-xl bg-[#fdf6e3] px-4 py-3.5 sm:mt-4 sm:py-4">
          <div className="min-w-0 pr-2">
            <p className="text-[18px] font-bold text-black sm:text-[20px]">
              Pay ₹{formattedAmount}
            </p>
            <p className="mt-0.5 truncate text-[14px] text-black">
              To {name || "Receiver"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <svg className="h-8 w-8 text-black sm:h-9 sm:w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 5h9M6 9h9M6 5c4 0 6 2 6 4s-2 4-6 4l7 6" />
            </svg>
            <svg className="h-5 w-5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m0 0l-5-5m5 5l-5 5" />
            </svg>
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#5b5ea6] sm:h-11 sm:w-11">
              <svg className="h-6 w-6 text-white sm:h-7 sm:w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="12" cy="8" r="3.5" />
                <path strokeLinecap="round" d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
              </svg>
            </span>
          </div>
        </div>

        {/* PIN entry */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-2">
          <p className="text-[15.5px] font-semibold text-black">
            Enter your PIN
          </p>
          <div className="mt-5 flex items-center gap-4 sm:mt-6">
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <span
                key={i}
                className={`h-4 w-4 rounded-full border-2 transition-colors ${
                  i < pin.length
                    ? "border-[#1a2f8a] bg-[#1a2f8a]"
                    : "border-zinc-500 bg-transparent"
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
                    <svg className="h-7 w-7 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5h11a1 1 0 011 1v12a1 1 0 01-1 1H9l-6-7 6-7z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10l4 4m0-4l-4 4" />
                    </svg>
                  </button>
                );
              }
              if (key === "pay") {
                const ready = pin.length === PIN_LENGTH;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={handlePay}
                    disabled={!ready}
                    className={`flex h-[clamp(48px,7.2dvh,64px)] items-center justify-center rounded-full text-[16px] font-semibold text-white transition-colors ${
                      ready ? "bg-[#0b3d91] active:bg-[#0a357c]" : "bg-[#0b3d91]/50"
                    }`}
                  >
                    Pay
                  </button>
                );
              }
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => pressKey(key)}
                  className="flex h-[clamp(48px,7.2dvh,64px)] items-center justify-center rounded-full bg-white text-[22px] text-black active:bg-zinc-200 sm:text-[24px]"
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
