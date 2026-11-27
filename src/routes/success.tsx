import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import myBillsArt from "@/assets/originals/my_bills_home_bg.webp";
import rewardsArt from "@/assets/originals/ftue_rewards_v3.webp";
import singleCoinArt from "@/assets/originals/singlecoin.webp";
import bharatConnectArt from "@/assets/originals/bharat_connect.webp";
import npciUpiLogoDark from "@/assets/originals/ic_upi_npci_logo_dark.png";
import { addStoredPayment } from "@/lib/paymentHistory";
import { LottiePlayer, type LottieSegment } from "@/components/LottiePlayer";
import {
  SuccessAnimation,
  preloadSuccessAnimation,
} from "@/components/SuccessAnimation";
import { playPaymentSuccessSound } from "@/lib/paymentSound";
import {
  markSuccessIntroPlayed,
  shouldPlaySuccessIntro,
} from "@/lib/successIntro";

const PROCESSING_SEGMENTS: LottieSegment[] = [
  [0, 49],
  [50, 146],
];

const successSearchSchema = z.object({
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

const SLIDE_COUNT = 5;

function DarkWaveTexture() {
  return (
    <svg
      viewBox="0 0 421 124"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[36%] w-full"
      aria-hidden="true"
    >
      {/* Subtle upper dark-grey contour hill matching 60196.jpg */}
      <path
        d="M0 10 C 48 22, 74 52, 114 78 C 148 100, 198 106, 266 96 C 332 86, 378 72, 421 76 L 421 124 L 0 124 Z"
        fill="#2c2e2b"
      />
      {/* Mid organic wave line */}
      <path
        d="M0 32 C 56 44, 88 86, 146 98 C 218 112, 312 88, 421 88 L 421 124 L 0 124 Z"
        fill="#393b38"
      />
      {/* Soft inner ribbon highlight */}
      <path
        d="M84 44 C 102 62, 118 82, 152 94"
        fill="none"
        stroke="#454744"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M28 84 C 54 98, 72 110, 92 114"
        fill="none"
        stroke="#272926"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* Lower wave floor */}
      <path
        d="M0 98 C 92 92, 188 110, 294 98 C 348 92, 392 94, 421 98 L 421 124 L 0 124 Z"
        fill="#434542"
      />
    </svg>
  );
}

function RuPayCardVector() {
  return (
    <svg
      viewBox="0 0 218 164"
      className="pointer-events-none absolute bottom-[clamp(14px,2.8dvh,28px)] right-[clamp(14px,5.6cqw,28px)] h-[clamp(112px,15.6dvh,152px)] w-auto select-none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="rpFront" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3c91fa" />
          <stop offset="55%" stopColor="#3283f0" />
          <stop offset="100%" stopColor="#2673dc" />
        </linearGradient>
        <linearGradient id="rpBevel" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1656aa" />
          <stop offset="100%" stopColor="#0f3e82" />
        </linearGradient>
        <linearGradient id="rpBadge" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#aa75e8" />
          <stop offset="100%" stopColor="#894fd4" />
        </linearGradient>
        <filter id="rpShadow" x="-15%" y="-15%" width="135%" height="140%">
          <feDropShadow
            dx="0"
            dy="8"
            stdDeviation="6"
            floodColor="#000000"
            floodOpacity="0.45"
          />
        </filter>
      </defs>

      <g filter="url(#rpShadow)">
        {/* 3D extruded left + top-left bevel matching 60196.jpg */}
        <path
          d="M28 19 L190 7 Q202 6 203 18 L203 121 Q203 132 191 134 L29 148 Q18 149 18 137 L18 32 Q18 20 28 19 Z"
          fill="url(#rpBevel)"
        />
        {/* Blue front card face slightly offset right & down-right */}
        <path
          d="M38 20 L198 9 Q209 8 209 20 L209 122 Q209 133 198 134 L38 148 Q28 149 28 138 L28 32 Q28 21 38 20 Z"
          fill="url(#rpFront)"
        />
        {/* Subtle top gloss */}
        <path
          d="M38 20 L198 9 Q209 8 209 20 L209 52 C 154 60, 88 68, 28 84 L28 32 Q28 21 38 20 Z"
          fill="#ffffff"
          opacity="0.06"
        />

        {/* Gold EMV chip with red-orange segments matching 60196.jpg */}
        <g transform="translate(56, 48) skewY(-3.5)">
          <rect x="0" y="0" width="38" height="29" rx="5" fill="#f7b93c" />
          <path
            d="M12.5 0v29M25.5 0v29M0 10h12.5M25.5 10h12.5M0 19h12.5M25.5 19h12.5"
            stroke="#c94b1e"
            strokeWidth="2.1"
          />
        </g>

        {/* Two dark-blue masked digit dashes */}
        <g transform="translate(61, 113) skewY(-3.8)">
          <rect x="0" y="0" width="22" height="5.5" rx="2.75" fill="#14448e" />
          <rect x="30" y="0" width="22" height="5.5" rx="2.75" fill="#14448e" />
        </g>

        {/* RuPay italic logo + orange/green double arrow */}
        <g transform="translate(131, 118) rotate(-3.8)">
          <text
            x="0"
            y="0"
            fill="#ffffff"
            fontSize="16.5"
            fontWeight="800"
            fontStyle="italic"
            fontFamily="PhonePeInter, Inter, sans-serif"
          >
            RuPay
          </text>
          <polygon points="52,-11 60,-5.5 52,0" fill="#f58220" />
          <polygon points="56,-11 64,-5.5 56,0" fill="#009345" />
        </g>
      </g>

      {/* Overlapping purple circular link-chain badge (bottom-left of card) */}
      <g filter="url(#rpShadow)">
        <circle cx="34" cy="130" r="24.5" fill="url(#rpBadge)" />
        <circle
          cx="34"
          cy="130"
          r="23"
          fill="none"
          stroke="#c89ef5"
          strokeOpacity="0.32"
          strokeWidth="1.5"
        />
        <g
          transform="translate(34, 130) rotate(-38)"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3.1"
          strokeLinecap="round"
        >
          <rect x="-12" y="-4.8" width="10" height="9.6" rx="4.8" />
          <rect x="2" y="-4.8" width="10" height="9.6" rx="4.8" />
          <line x1="-4.5" y1="0" x2="4.5" y2="0" />
        </g>
      </g>
    </svg>
  );
}

function AutoPayCalendarVector() {
  return (
    <svg
      viewBox="0 0 180 150"
      className="pointer-events-none absolute bottom-4 left-4 h-[clamp(108px,14.5dvh,138px)] w-auto select-none"
      aria-hidden="true"
    >
      <rect x="12" y="26" width="104" height="96" rx="14" fill="#ffffff" />
      <path d="M12 40 Q12 26 26 26 H102 Q116 26 116 40 V50 H12 Z" fill="#ef5350" />
      <rect x="34" y="16" width="8" height="20" rx="4" fill="#311b92" />
      <rect x="86" y="16" width="8" height="20" rx="4" fill="#311b92" />
      <rect x="24" y="62" width="18" height="14" rx="3" fill="#e9d5ff" />
      <rect x="52" y="62" width="18" height="14" rx="3" fill="#43a047" />
      <path
        d="M57 69 l3 3 l6 -6"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="80" y="62" width="18" height="14" rx="3" fill="#e9d5ff" />
      <rect x="24" y="86" width="18" height="14" rx="3" fill="#e9d5ff" />
      <rect x="52" y="86" width="18" height="14" rx="3" fill="#e9d5ff" />
      <rect x="80" y="86" width="18" height="14" rx="3" fill="#e9d5ff" />
      <g transform="translate(106, 20) rotate(-14)">
        <rect x="0" y="0" width="44" height="44" rx="10" fill="#6a22b5" />
        <circle cx="22" cy="22" r="11" fill="none" stroke="#ffffff" strokeWidth="2.4" />
        <path
          d="M22 15v7l4 3"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

function SuccessPage() {
  const navigate = useNavigate();
  const { name, upi, amount, message } = Route.useSearch();

  const [activeSlide, setActiveSlide] = useState(0);
  const [paymentDateText, setPaymentDateText] = useState("");
  const soundPlayedRef = useRef(false);

  useEffect(() => {
    setPaymentDateText(formatPaymentDate(new Date()));
  }, []);

  const [phase, setPhase] = useState<Phase>(
    shouldPlaySuccessIntro() ? "loading" : "revealed",
  );

  useEffect(() => {
    void preloadSuccessAnimation();
    if (phase === "revealed") return;
    markSuccessIntroPlayed();
    const t1 = setTimeout(() => {
      setPhase("success");
      if (!soundPlayedRef.current) {
        soundPlayedRef.current = true;
        playPaymentSuccessSound();
      }
    }, 3000);
    const t2 = setTimeout(() => setPhase("revealed"), 4800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    addStoredPayment({ name, upi, amount, message });
  }, [name, upi, amount, message]);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % SLIDE_COUNT);
    }, 3800);
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
            segments={PROCESSING_SEGMENTS}
            className="h-[108px] w-[108px]"
            ariaLabel="Connecting securely"
          />
          <p className="mt-2 text-[15.5px] font-semibold text-white">
            Connecting Securely
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full justify-center overflow-hidden bg-[#262626]">
      <div className="@container relative flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-[#262626]">
        {/*
          TOP SECTION:
          The green #398e3d hero wraps the checkmark, title, date, AND the top half
          of the payment card. Its bottom edge ends at the EXACT divider pixel of the
          payment card on every phone size and 1- or 2-line receiver name.
        */}
        <div className="shrink-0 bg-[#398e3d] px-[3.1%] pb-0 pt-[clamp(18px,3.2dvh,32px)]">
          <div className="text-center">
            <SuccessAnimation size="hero" />
            <h1 className="mt-[clamp(14px,2.4dvh,24px)] text-[clamp(16.5px,4.3cqw,19px)] font-bold leading-tight tracking-[-0.01em] text-white">
              Payment Successful
            </h1>
            <p className="mt-[clamp(4px,0.7dvh,7px)] text-[clamp(12.5px,3.3cqw,14.5px)] font-medium leading-tight text-[#cffdad]">
              {paymentDateText || "\u00A0"}
            </p>
          </div>

          {/* Payment Card — Top Half (flush on bottom of green hero) */}
          <div className="mt-[clamp(16px,2.7dvh,26px)] rounded-t-[16px] bg-[#191919] px-[clamp(16px,5.2cqw,24px)] py-[clamp(16px,2.3dvh,22px)] shadow-sm">
            <div className="flex items-start gap-[clamp(16px,5.4cqw,24px)]">
              {/* Exact #a55bf1 purple squircle avatar (15.4% width) */}
              <div className="flex h-[clamp(54px,15.2cqw,66px)] w-[clamp(54px,15.2cqw,66px)] shrink-0 items-center justify-center rounded-[16px] bg-[#a55bf1]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-[56%] w-[56%] text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.05}
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="8.5" r="3.6" />
                  <path d="M5.5 19.5c1.4-3.3 3.9-4.8 6.5-4.8s5.1 1.5 6.5 4.8" />
                </svg>
              </div>

              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 break-words text-[clamp(17px,4.6cqw,19.5px)] font-bold leading-[1.24] text-white">
                  {name || "Receiver"}
                </p>
                <p className="mt-1 truncate text-[clamp(12.5px,3.2cqw,14px)] font-normal leading-tight text-[#b1b1b1]">
                  {upi || "—"}
                </p>

                <div className="mt-[clamp(14px,2.2dvh,22px)] flex items-baseline justify-between gap-2">
                  <p className="text-[clamp(21px,5.7cqw,25px)] font-bold leading-none text-white">
                    ₹{formattedAmount}
                  </p>
                  <button
                    type="button"
                    className="shrink-0 text-[clamp(13px,3.3cqw,14.5px)] font-semibold leading-none text-[#9373c0]"
                  >
                    Split Expense
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Card — Bottom Half (immediately below green on #262626) */}
        <div className="shrink-0 px-[3.1%]">
          <div className="grid grid-cols-2 divide-x divide-white/[0.08] overflow-hidden rounded-b-[16px] border-t border-white/[0.08] bg-[#171717] py-[clamp(14px,2.2dvh,20px)] shadow-sm">
            <button
              type="button"
              onClick={() =>
                navigate({
                  to: "/success-details",
                  search: { name, upi, amount, message, from: "" },
                })
              }
              className="flex items-center justify-center gap-[clamp(8px,2.6cqw,12px)] px-2"
            >
              <span className="flex h-[clamp(40px,11.2cqw,48px)] w-[clamp(40px,11.2cqw,48px)] shrink-0 items-center justify-center rounded-full bg-[#3a2855]">
                <svg
                  className="h-[44%] w-[44%] text-[#a384df]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.85}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6M9 8h6M5 21h14a1 1 0 001-1V4a1 1 0 00-1-1H5a1 1 0 00-1 1v16a1 1 0 001 1z"
                  />
                </svg>
              </span>
              <span className="truncate text-[clamp(12.5px,3.2cqw,14px)] font-medium text-[#e8e8e8]">
                View Details
              </span>
            </button>

            <button
              type="button"
              className="flex items-center justify-center gap-[clamp(8px,2.6cqw,12px)] px-2"
            >
              <span className="flex h-[clamp(40px,11.2cqw,48px)] w-[clamp(40px,11.2cqw,48px)] shrink-0 items-center justify-center rounded-full bg-[#392854]">
                <svg
                  className="h-[44%] w-[44%] text-[#a384df]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.85}
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
              <span className="truncate text-[clamp(12.5px,3.2cqw,14px)] font-medium text-[#e8e8e8]">
                Share Receipt
              </span>
            </button>
          </div>
        </div>

        {/*
          MIDDLE AD CARD + DOTS + POWERED BY UPI:
          Uses flex-1 min-h-0 so on EVERY phone height (short, standard, or ultra-tall)
          the ad card expands smoothly to fill the exact space above Dots + UPI + Done
          with ZERO extra blank gap!
        */}
        <div className="mt-[clamp(8px,1.1dvh,12px)] flex min-h-0 flex-1 flex-col px-[3.1%]">
          <div className="relative min-h-0 flex-1 w-full overflow-hidden rounded-[16px] bg-[#1a1c19]">
            <div
              className="flex h-full transition-transform duration-500 ease-in-out"
              style={{ transform: `translateX(-${activeSlide * 100}%)` }}
            >
              {/* Slide 1: Exact "Link RuPay CC on UPI & get ₹250" matching 60196.jpg */}
              <div className="relative h-full w-full shrink-0 bg-[#1a1c19] pl-[clamp(20px,7.2cqw,32px)] pr-5 pt-[clamp(22px,4.4dvh,42px)]">
                <span className="absolute right-3.5 top-2.5 text-[clamp(8px,2.1cqw,9.5px)] font-medium text-[#7c7c7c]">
                  *T&amp;C Apply
                </span>
                <div className="relative z-10 max-w-[88%]">
                  <p className="text-[clamp(23px,6.8cqw,30px)] font-bold leading-[1.18] tracking-[-0.02em] text-white">
                    Link RuPay CC
                    <br />
                    on UPI &amp; get ₹250
                  </p>
                  <p className="mt-[clamp(6px,1.1dvh,10px)] text-[clamp(14px,4cqw,17.5px)] font-normal leading-snug text-[#f0f2ef]">
                    valid on first 2 payments*
                  </p>
                  <button
                    type="button"
                    className="mt-[clamp(12px,2dvh,20px)] inline-flex h-[clamp(28px,3.4dvh,32px)] items-center gap-1 rounded-full bg-white px-[clamp(14px,3.8cqw,18px)] text-[clamp(12px,3.1cqw,13.5px)] font-semibold text-[#141414] shadow-xs"
                  >
                    Start Now
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
                    </svg>
                  </button>
                </div>
                <DarkWaveTexture />
                <RuPayCardVector />
              </div>

              {/* Slide 2: Piped Gas AutoPay matching 59911.jpg */}
              <div className="relative h-full w-full shrink-0 overflow-hidden bg-[#e7c6ef]">
                <img
                  src={myBillsArt}
                  alt=""
                  loading="lazy"
                  className="pointer-events-none absolute bottom-0 right-0 h-[55%] w-auto select-none object-contain opacity-90"
                  draggable={false}
                />
                <AutoPayCalendarVector />
                <div className="absolute right-0 top-[10%] flex w-[63%] flex-col justify-center rounded-l-[999px] bg-[#6821b0] py-[clamp(14px,2.2dvh,20px)] pl-[clamp(24px,6.5cqw,32px)] pr-5 shadow-sm">
                  <p className="text-[clamp(15px,4.2cqw,18.5px)] leading-[1.28] text-white">
                    Enable <span className="font-bold">automatic</span> bill
                    payments for Piped Gas
                  </p>
                  <div className="mt-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-1 text-[clamp(11.5px,3cqw,13px)] font-semibold text-[#6821b0]">
                      Know More
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.6}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>

              {/* Slide 3: Assured UPI Rewards */}
              <div className="relative h-full w-full shrink-0 bg-[#1a1c19] pl-[clamp(20px,7.2cqw,32px)] pr-5 pt-[clamp(22px,4.4dvh,42px)]">
                <span className="absolute right-3.5 top-2.5 text-[clamp(8px,2.1cqw,9.5px)] font-medium text-[#7c7c7c]">
                  *T&amp;C Apply
                </span>
                <div className="relative z-10 max-w-[84%]">
                  <p className="text-[clamp(23px,6.8cqw,30px)] font-bold leading-[1.18] tracking-[-0.02em] text-white">
                    Win assured rewards
                    <br />
                    on UPI payments
                  </p>
                  <p className="mt-[clamp(6px,1.1dvh,10px)] text-[clamp(14px,4cqw,17.5px)] font-normal leading-snug text-[#f0f2ef]">
                    unlock scratch cards instantly*
                  </p>
                  <button
                    type="button"
                    className="mt-[clamp(12px,2dvh,20px)] inline-flex h-[clamp(28px,3.4dvh,32px)] items-center gap-1 rounded-full bg-white px-[clamp(14px,3.8cqw,18px)] text-[clamp(12px,3.1cqw,13.5px)] font-semibold text-[#141414]"
                  >
                    Claim Now
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
                    </svg>
                  </button>
                </div>
                <DarkWaveTexture />
                <img
                  src={rewardsArt}
                  alt="UPI Rewards"
                  loading="lazy"
                  className="pointer-events-none absolute bottom-[clamp(10px,2dvh,18px)] right-3 h-[clamp(104px,14.5dvh,138px)] w-auto select-none object-contain"
                  draggable={false}
                />
              </div>

              {/* Slide 4: 24K Gold SIP */}
              <div className="relative h-full w-full shrink-0 bg-[#1a1c19] pl-[clamp(20px,7.2cqw,32px)] pr-5 pt-[clamp(22px,4.4dvh,42px)]">
                <span className="absolute right-3.5 top-2.5 text-[clamp(8px,2.1cqw,9.5px)] font-medium text-[#7c7c7c]">
                  *T&amp;C Apply
                </span>
                <div className="relative z-10 max-w-[84%]">
                  <p className="text-[clamp(23px,6.8cqw,30px)] font-bold leading-[1.18] tracking-[-0.02em] text-white">
                    Start 24K Gold
                    <br />
                    SIP at ₹10 daily
                  </p>
                  <p className="mt-[clamp(6px,1.1dvh,10px)] text-[clamp(14px,4cqw,17.5px)] font-normal leading-snug text-[#f0f2ef]">
                    99.99% pure gold • pause anytime*
                  </p>
                  <button
                    type="button"
                    className="mt-[clamp(12px,2dvh,20px)] inline-flex h-[clamp(28px,3.4dvh,32px)] items-center gap-1 rounded-full bg-white px-[clamp(14px,3.8cqw,18px)] text-[clamp(12px,3.1cqw,13.5px)] font-semibold text-[#141414]"
                  >
                    Start SIP
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
                    </svg>
                  </button>
                </div>
                <DarkWaveTexture />
                <img
                  src={singleCoinArt}
                  alt="24K Gold Savings"
                  loading="lazy"
                  className="pointer-events-none absolute bottom-[clamp(14px,2.5dvh,24px)] right-5 h-[clamp(100px,13.5dvh,130px)] w-auto select-none object-contain"
                  draggable={false}
                />
              </div>

              {/* Slide 5: Bharat Connect Bill AutoPay */}
              <div className="relative h-full w-full shrink-0 bg-[#1a1c19] pl-[clamp(20px,7.2cqw,32px)] pr-5 pt-[clamp(22px,4.4dvh,42px)]">
                <span className="absolute right-3.5 top-2.5 text-[clamp(8px,2.1cqw,9.5px)] font-medium text-[#7c7c7c]">
                  *T&amp;C Apply
                </span>
                <div className="relative z-10 max-w-[84%]">
                  <p className="text-[clamp(23px,6.8cqw,30px)] font-bold leading-[1.18] tracking-[-0.02em] text-white">
                    AutoPay your
                    <br />
                    Electricity Bills
                  </p>
                  <p className="mt-[clamp(6px,1.1dvh,10px)] text-[clamp(14px,4cqw,17.5px)] font-normal leading-snug text-[#f0f2ef]">
                    zero late fees with Bharat Connect*
                  </p>
                  <button
                    type="button"
                    className="mt-[clamp(12px,2dvh,20px)] inline-flex h-[clamp(28px,3.4dvh,32px)] items-center gap-1 rounded-full bg-white px-[clamp(14px,3.8cqw,18px)] text-[clamp(12px,3.1cqw,13.5px)] font-semibold text-[#141414]"
                  >
                    Set AutoPay
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
                    </svg>
                  </button>
                </div>
                <DarkWaveTexture />
                <img
                  src={bharatConnectArt}
                  alt="Bharat Connect"
                  loading="lazy"
                  className="pointer-events-none absolute bottom-[clamp(18px,3dvh,28px)] right-4 h-[clamp(64px,9dvh,84px)] w-auto select-none object-contain"
                  draggable={false}
                />
              </div>
            </div>
          </div>

          {/* 5 Carousel Dots (. . . . ▬) */}
          <div className="mt-[clamp(8px,1.1dvh,11px)] flex shrink-0 items-center justify-center gap-1.5">
            {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => setActiveSlide(i)}
                className={`h-[5px] rounded-full transition-all duration-300 ${
                  i === activeSlide ? "w-4 bg-white" : "w-[5px] bg-[#575757]"
                }`}
              />
            ))}
          </div>

          {/* POWERED BY UPI anchored directly above Done — exact proportions from 60196.jpg */}
          <div className="mb-[clamp(4px,0.7dvh,7px)] mt-[clamp(8px,1.4dvh,15px)] flex shrink-0 flex-col items-center">
            <span className="text-[6px] font-semibold uppercase tracking-[0.14em] text-[#7a7a7a]">
              POWERED BY
            </span>
            <img
              src={npciUpiLogoDark}
              alt="Powered by NPCI UPI"
              className="-my-1.5 h-[26px] w-auto select-none object-contain opacity-95"
              draggable={false}
            />
          </div>
        </div>

        {/* Bottom Done bar — exact #191919 surface, #9a78d2 label, proportional height */}
        <div className="flex shrink-0 items-center justify-center bg-[#191919] px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-[clamp(13px,1.6dvh,16px)]">
          <button
            type="button"
            onClick={() => navigate({ to: "/" })}
            className="text-[clamp(14.5px,3.8cqw,16.5px)] font-semibold leading-none text-[#9a78d2]"
          >
            Done
          </button>
        </div>

        {/* Full-screen green success overlay; plays paym.mp3 at tick then slides up */}
        <div
          className={`absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#398e3d] transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            phase === "revealed" ? "-translate-y-full" : "translate-y-0"
          }`}
        >
          <SuccessAnimation size="intro" />
          <h1 className="mt-4 text-[clamp(18px,4.6cqw,20px)] font-bold text-white">
            Payment Successful
          </h1>
        </div>
      </div>
    </div>
  );
}
