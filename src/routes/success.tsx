import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import promoBanner from "@/assets/success-promo.png";
import promoBanner2 from "@/assets/promo-banner-2.png";
import promoBanner3 from "@/assets/promo-banner-3.png";
import { addStoredPayment } from "@/lib/paymentHistory";
import { LottiePlayer } from "@/components/LottiePlayer";
import {
  SuccessAnimation,
  preloadSuccessAnimation,
} from "@/components/SuccessAnimation";
import {
  markSuccessIntroPlayed,
  shouldPlaySuccessIntro,
} from "@/lib/successIntro";

const successSearchSchema = z.object({
  name: z.string().max(100).catch(""),
  upi: z.string().max(100).catch(""),
  // Numeric amounts arrive JSON-parsed as numbers; normalize back to string.
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

export const Route = createFileRoute("/success")({
  validateSearch: (search) => successSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Payment Successful" },
      { name: "description", content: "Your payment was completed successfully." },
      { property: "og:title", content: "Payment Successful" },
      {
        property: "og:description",
        content: "Your payment was completed successfully.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SuccessPage,
});

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase();
}

function formatPaymentDate(d: Date) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-GB", { month: "long" });
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${day} ${month} ${year} at ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
}

type Phase = "loading" | "success" | "revealed";

function SuccessPage() {
  const navigate = useNavigate();
  const { name, upi, amount, message } = Route.useSearch();

  const [activeSlide, setActiveSlide] = useState(0);
  const [paymentDateText, setPaymentDateText] = useState("");
  const slideCount = 3;

  useEffect(() => {
    setPaymentDateText(formatPaymentDate(new Date()));
  }, []);

  // Intro sequence: dark "Connecting Securely" loader -> green success
  // overlay -> overlay slides up to reveal the details page.
  const [phase, setPhase] = useState<Phase>(
    shouldPlaySuccessIntro() ? "loading" : "revealed",
  );

  useEffect(() => {
    void preloadSuccessAnimation();
    if (phase === "revealed") return;
    markSuccessIntroPlayed();
    const t1 = setTimeout(() => setPhase("success"), 3000);
    const t2 = setTimeout(() => setPhase("revealed"), 4800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Record this payment so it shows up in the History tab.
  useEffect(() => {
    addStoredPayment({ name, upi, amount, message });
  }, [name, upi, amount, message]);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % slideCount);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const formattedAmount = (() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || amount === "") return amount;
    return n % 1 === 0
      ? n.toLocaleString("en-IN")
      : n.toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  })();

  if (phase === "loading") {
    return (
      <div className="flex h-dvh w-full justify-center overflow-hidden bg-[#161616]">
        <div className="flex h-full w-full max-w-[430px] flex-col items-center justify-center bg-[#161616] px-6">
          <LottiePlayer
            path="/animations/processing.json"
            renderer="svg"
            loop
            className="h-[116px] w-[116px]"
            ariaLabel="Connecting securely"
          />
          <p className="mt-2 text-lg font-bold text-white">
            Connecting Securely
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full justify-center overflow-hidden bg-[#262626]">
      <div className="relative flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-[#262626]">
        {/* Green success hero */}
        <div className="shrink-0 bg-payment-success px-4 pb-20 pt-8 text-center sm:pb-24 sm:pt-12">
          <SuccessAnimation />
          <h1 className="mt-4 text-[21px] font-bold text-white sm:mt-5 sm:text-[22px]">
            Payment Successful
          </h1>
          <p className="mt-0.5 text-sm font-medium text-[#D9E85A] sm:text-base">
            {paymentDateText || "\u00A0"}
          </p>
        </div>

        {/* Payment card overlapping the green hero */}
        <div className="relative z-10 mx-3 -mt-14 shrink-0 rounded-2xl bg-[#161616] p-4 shadow-lg sm:-mt-16 sm:p-5">
          <div className="flex items-start gap-3.5">
            <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-[#29A9E0]">
              <span className="text-base font-semibold text-white">
                {getInitials(name) || "PP"}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 break-words text-base font-bold uppercase leading-snug tracking-wide text-white sm:text-lg">
                {name || "Receiver"}
              </p>
              <p className="mt-0.5 truncate text-xs text-zinc-400 sm:text-sm">
                {upi || "—"}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <p className="text-2xl font-bold text-white sm:text-3xl">
              ₹{formattedAmount}
            </p>
            <button
              type="button"
              className="text-sm font-bold text-[#A78BFA] sm:text-base"
            >
              Split Expense
            </button>
          </div>

          <div className="mt-3.5 border-t border-zinc-700" />

          <div className="mt-1 grid grid-cols-2 divide-x divide-zinc-700">
            <button
              type="button"
              onClick={() =>
                navigate({
                  to: "/success-details",
                  search: { name, upi, amount, message, from: "" },
                })
              }
              className="flex items-center justify-center gap-2.5 py-3"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#3A2C6B]">
                <svg
                  className="h-5 w-5 text-[#A78BFA]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6M9 8h6M5 21h14a1 1 0 001-1V4a1 1 0 00-1-1H5a1 1 0 00-1 1v16a1 1 0 001 1z"
                  />
                </svg>
              </span>
              <span className="text-sm text-white sm:text-base">View Details</span>
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-2.5 py-3"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#3A2C6B]">
                <svg
                  className="h-5 w-5 text-[#A78BFA]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <path
                    strokeLinecap="round"
                    d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"
                  />
                </svg>
              </span>
              <span className="text-sm text-white sm:text-base">Share Receipt</span>
            </button>
          </div>
        </div>

        {/* Promo banner slider — sized responsively to fit screen */}
        <div className="flex min-h-0 flex-1 flex-col justify-center px-3 py-3">
          <div className="relative overflow-hidden rounded-2xl">
            <div
              className="flex transition-transform duration-500 ease-in-out"
              style={{ transform: `translateX(-${activeSlide * 100}%)` }}
            >
              {/* Slide 1: original promo with overlay text */}
              <div className="relative w-full shrink-0">
                <img
                  src={promoBanner}
                  alt="Automatic bill payments"
                  className="block h-[clamp(135px,21dvh,220px)] w-full object-cover"
                />
                <div className="absolute right-3 top-3 w-[58%] rounded-[1.5rem] rounded-bl-lg bg-[#6D28D9] p-3 shadow-md sm:p-4">
                  <p className="text-[13px] font-medium leading-snug text-white sm:text-[15px]">
                    Enable <span className="font-bold">automatic</span> bill
                    payments for Piped Gas
                  </p>
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-[#6D28D9] sm:text-sm"
                  >
                    Know More
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Slide 2 */}
              <div className="w-full shrink-0">
                <img
                  src={promoBanner2}
                  alt="Instant money transfers"
                  loading="lazy"
                  className="block h-[clamp(135px,21dvh,220px)] w-full object-cover"
                />
              </div>

              {/* Slide 3 */}
              <div className="w-full shrink-0">
                <img
                  src={promoBanner3}
                  alt="Rewards and offers"
                  loading="lazy"
                  className="block h-[clamp(135px,21dvh,220px)] w-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* Carousel dots */}
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {Array.from({ length: slideCount }).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => setActiveSlide(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === activeSlide ? "w-6 bg-white" : "w-1.5 bg-zinc-600"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="shrink-0 bg-black px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center">
          <button
            type="button"
            onClick={() => navigate({ to: "/" })}
            className="text-lg font-bold text-[#7C5CFC]"
          >
            Done
          </button>
        </div>

        {/* Full-screen green success overlay; slides up to reveal details */}
        <div
          className={`absolute inset-0 z-20 flex flex-col items-center justify-center bg-payment-success transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            phase === "revealed" ? "-translate-y-full" : "translate-y-0"
          }`}
        >
          <SuccessAnimation />
          <h1 className="mt-6 text-[22px] font-bold text-white">
            Payment Successful
          </h1>
        </div>
      </div>
    </div>
  );
}
