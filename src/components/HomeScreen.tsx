import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, KeyRound, Loader2, LogOut, X } from "lucide-react";
import { toast } from "sonner";
import { clearAccessSession, getCurrentSessionKey } from "@/lib/access.functions";
import {
  copyTextToClipboard,
  getRememberedKey,
  saveRememberedKey,
  setAutoLoginEnabled,
} from "@/lib/rememberedKey";

import heroGoldBar from "@/assets/home/hero_gold_bar.webp";
import mtMobile from "@/assets/home/mt_mobile.webp";
import mtBank from "@/assets/home/mt_bank.webp";
import mtWallet from "@/assets/home/mt_wallet.webp";
import mtBalance from "@/assets/home/mt_balance.webp";

import pillHdfc from "@/assets/home/pill_hdfc.webp";
import pillMfSip from "@/assets/home/pill_mf_sip.webp";
import pillGold10 from "@/assets/home/pill_gold10.webp";
import pillSilver from "@/assets/home/pill_silver.webp";
import pillFlights from "@/assets/home/pill_flights.webp";

import rbMobile from "@/assets/home/rb_mobile.webp";
import rbRent from "@/assets/home/rb_rent.webp";
import rbElectricity from "@/assets/home/rb_electricity.webp";
import rbLoanRepay from "@/assets/home/rb_loan_repay.webp";
import promoJioSim from "@/assets/home/promo_jio_sim.webp";

import loanPersonal from "@/assets/home/loan_personal.webp";
import loanMf from "@/assets/home/loan_mf.webp";
import loanGold from "@/assets/home/loan_gold.webp";
import loanCreditScore from "@/assets/home/loan_credit_score.webp";
import promoLoan10l from "@/assets/home/promo_loan_10l.webp";

import goldDaily10 from "@/assets/home/gold_daily10.webp";
import goldBuy from "@/assets/home/gold_buy.webp";
import silverDaily10 from "@/assets/home/silver_daily10.webp";
import silverBuy from "@/assets/home/silver_buy.webp";
import promoPlatinum from "@/assets/home/promo_platinum.webp";

import dykTrain from "@/assets/home/dyk_train.webp";
import dykFlights from "@/assets/home/dyk_flights.webp";
import dykGoldloan from "@/assets/home/dyk_goldloan.webp";
import dykWishcard from "@/assets/home/dyk_wishcard.webp";
import dykDonations from "@/assets/home/dyk_donations.webp";

import insBike from "@/assets/home/ins_bike.webp";
import insCar from "@/assets/home/ins_car.webp";
import insHealth from "@/assets/home/ins_health.webp";
import insLife from "@/assets/home/ins_life.webp";
import promoDengue from "@/assets/home/promo_dengue.webp";

import mfBestSip from "@/assets/home/mf_best_sip.webp";
import mfHighGrowth from "@/assets/home/mf_high_growth.webp";
import mfChotiSip from "@/assets/home/mf_choti_sip.webp";
import mfDailySip from "@/assets/home/mf_daily_sip.webp";
import promoSip5sec from "@/assets/home/promo_sip_5sec.webp";

import depFd from "@/assets/home/dep_fd.webp";
import depDaily from "@/assets/home/dep_daily.webp";
import depTopupNps from "@/assets/home/dep_topup_nps.webp";
import depNewNps from "@/assets/home/dep_new_nps.webp";
import promoFdGoals from "@/assets/home/promo_fd_goals.webp";

import trvFlight from "@/assets/home/trv_flight.webp";
import trvBus from "@/assets/home/trv_bus.webp";
import trvTrain from "@/assets/home/trv_train.webp";
import trvHotel from "@/assets/home/trv_hotel.webp";
import promoHotels30 from "@/assets/home/promo_hotels_30.webp";

import ccHdfc from "@/assets/home/cc_hdfc.webp";
import ccSbi from "@/assets/home/cc_sbi.webp";
import ccWish from "@/assets/home/cc_wish.webp";
import ccAxis from "@/assets/home/cc_axis.webp";

import offZone from "@/assets/home/off_zone.webp";
import offVouchers from "@/assets/home/off_vouchers.webp";
import offSubscriptions from "@/assets/home/off_subscriptions.webp";
import offGooglePlay from "@/assets/home/off_google_play.webp";
import promoBestOffers from "@/assets/home/promo_best_offers.webp";

import investPhone from "@/assets/home/invest_phone.webp";

import brandStorytv from "@/assets/home/brand_storytv.webp";
import brandDramas from "@/assets/home/brand_dramas.webp";
import brandShows from "@/assets/home/brand_shows.webp";
import brandSeries from "@/assets/home/brand_series.webp";

type CategoryItem = {
  label: string;
  icon: string;
  badge?: string;
  badgeMode?: "top-ribbon" | "corner-tag";
};

type CategorySectionConfig = {
  title: string;
  items: [CategoryItem, CategoryItem, CategoryItem, CategoryItem];
  promoText: string;
  promoArt: string;
};

const PROMO_PILLS = [
  { label: "Lifetime-Free HDFC Credit Card", icon: pillHdfc },
  { label: "Daily Mutual Fund SIP @ ₹10", icon: pillMfSip },
  { label: "Buy 24K Gold daily at just ₹10", icon: pillGold10 },
  { label: "Start saving in pure Silver", icon: pillSilver },
  { label: "Up to ₹1500 off on Flights", icon: pillFlights },
];

const RECHARGE_SECTION: CategorySectionConfig = {
  title: "Recharge & Bills",
  items: [
    { label: "Mobile\nRecharge", icon: rbMobile },
    { label: "Rent via\nCredit Card", icon: rbRent },
    { label: "Electricity\nBill", icon: rbElectricity },
    { label: "Loan\nRepayment", icon: rbLoanRepay },
  ],
  promoText: "Get Jio SIM delivered – FREE",
  promoArt: promoJioSim,
};

const LOANS_SECTION: CategorySectionConfig = {
  title: "Loans",
  items: [
    { label: "Personal\nLoan", icon: loanPersonal },
    { label: "Mutual\nFunds Loan", icon: loanMf },
    { label: "Gold\nLoan", icon: loanGold },
    { label: "Credit\nScore", icon: loanCreditScore },
  ],
  promoText: "Get up to ₹10L loan",
  promoArt: promoLoan10l,
};

const GOLD_SECTION: CategorySectionConfig = {
  title: "Gold, Silver & Platinum",
  items: [
    { label: "Daily Gold\nwith ₹10", icon: goldDaily10 },
    { label: "Buy\nGold", icon: goldBuy },
    { label: "Daily Silver\nwith ₹10", icon: silverDaily10 },
    { label: "Buy Silver", icon: silverBuy },
  ],
  promoText: "Save in pure Platinum daily",
  promoArt: promoPlatinum,
};

const DID_YOU_KNOW_CARDS = [
  {
    text: "You can get confirmed train ti...",
    bg: "#333235",
    art: dykTrain,
  },
  {
    text: "Flights are up to ₹3000 off",
    bg: "#062966",
    art: dykFlights,
  },
  {
    text: "Gold loans start @ 0.79% p.m",
    bg: "#09504f",
    art: dykGoldloan,
  },
  {
    text: "Wish Card has 100% approval*",
    bg: "#200043",
    art: dykWishcard,
  },
  {
    text: "You can make Donations on P...",
    bg: "#402b29",
    art: dykDonations,
  },
];

const INSURANCE_SECTION: CategorySectionConfig = {
  title: "Insurance",
  items: [
    { label: "Bike", icon: insBike },
    { label: "Car", icon: insCar },
    { label: "Health", icon: insHealth, badge: "✦ 25% Of...", badgeMode: "top-ribbon" },
    { label: "Life", icon: insLife },
  ],
  promoText: "₹50K Dengue cover at ₹59/...",
  promoArt: promoDengue,
};

const MUTUAL_FUNDS_SECTION: CategorySectionConfig = {
  title: "Mutual Funds",
  items: [
    { label: "Best SIP\nFunds", icon: mfBestSip },
    { label: "High Growth\nFunds", icon: mfHighGrowth },
    { label: "Choti SIP\nwith ₹250", icon: mfChotiSip },
    { label: "Daily SIP\nwith ₹10", icon: mfDailySip },
  ],
  promoText: "Start a SIP in 5 seconds",
  promoArt: promoSip5sec,
};

const DEPOSITS_SECTION: CategorySectionConfig = {
  title: "Deposits & Savings",
  items: [
    { label: "Fixed\nDeposit", icon: depFd },
    { label: "Daily\nDeposit", icon: depDaily, badge: "New", badgeMode: "corner-tag" },
    { label: "Top up\nNPS", icon: depTopupNps },
    { label: "New NPS\nAccount", icon: depNewNps },
  ],
  promoText: "Reach your goals with FDs",
  promoArt: promoFdGoals,
};

const TRAVEL_SECTION: CategorySectionConfig = {
  title: "Travel & Transit",
  items: [
    { label: "Flight", icon: trvFlight },
    { label: "Bus", icon: trvBus },
    { label: "Train", icon: trvTrain },
    { label: "Hotel", icon: trvHotel },
  ],
  promoText: "Save up to 30% on Hotels",
  promoArt: promoHotels30,
};

const CREDIT_CARDS = [
  { label: "PhonePe\nHDFC card", image: ccHdfc },
  { label: "PhonePe\nSBI card", image: ccSbi },
  { label: "100%\nApproval ...", image: ccWish },
  { label: "Axis\nCredit Card", image: ccAxis },
];

const OFFERS_SECTION: CategorySectionConfig = {
  title: "Offers & Rewards",
  items: [
    { label: "Offer\nZone", icon: offZone },
    { label: "Brand\nVouchers", icon: offVouchers },
    { label: "Subscriptions", icon: offSubscriptions },
    { label: "Google\nPlay", icon: offGooglePlay },
  ],
  promoText: "Find the best offers for you",
  promoArt: promoBestOffers,
};

const BRAND_IN_FOCUS = [
  { label: "Story TV", icon: brandStorytv },
  { label: "Best Dramas", icon: brandDramas },
  { label: "Top Shows", icon: brandShows },
  { label: "Hit Series", icon: brandSeries },
];

function CategorySection({ config }: { config: CategorySectionConfig }) {
  return (
    <section className="px-[4.4cqw] pt-[5.8cqw]">
      <h2 className="text-[clamp(15px,4.1cqw,17.5px)] font-bold tracking-[-0.01em] text-white">
        {config.title}
      </h2>

      {/* Exact 4-column tile grid (20.37cqw tile width, 3.24cqw gap, seamless #272126 interior + 1px border) */}
      <div className="mt-[3.8cqw] grid grid-cols-4 gap-[3.24cqw]">
        {config.items.map((item) => (
          <button
            key={item.label}
            type="button"
            className="flex cursor-pointer flex-col items-center text-center active:opacity-80"
          >
            <div className="relative flex aspect-[176/114] w-full flex-col items-center justify-center overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#272126]">
              {item.badge && item.badgeMode === "top-ribbon" ? (
                <span className="flex w-full shrink-0 items-center justify-center bg-[#71004e] px-1 py-[3px] text-[clamp(8.5px,2.2cqw,10px)] font-semibold leading-none text-[#ffd9f4]">
                  {item.badge}
                </span>
              ) : null}

              {item.badge && item.badgeMode === "corner-tag" ? (
                <span className="absolute left-0 top-0 z-10 rounded-br-[9px] bg-[#71004e] px-[7px] py-[2.5px] text-[clamp(8.5px,2.2cqw,10px)] font-semibold leading-none text-[#ffe5fa]">
                  {item.badge}
                </span>
              ) : null}

              <div className="flex min-h-0 flex-1 w-full items-center justify-center">
                <img
                  decoding="async"
                  src={item.icon}
                  alt={item.label.replace("\n", " ")}
                  loading="lazy"
                  className="h-full w-full select-none object-contain"
                  draggable={false}
                />
              </div>
            </div>
            <span className="mt-[2.2cqw] whitespace-pre-line text-center text-[clamp(11px,3cqw,13px)] font-medium leading-[1.24] text-[#ece9ed]">
              {item.label}
            </span>
          </button>
        ))}
      </div>

      {/* Bottom Promo Strip (col-span-3) + More -> Button (col-span-1) — seamless #272126 + feathered art */}
      <div className="mt-[3.4cqw] grid grid-cols-4 gap-[3.24cqw]">
        <button
          type="button"
          className="col-span-3 flex h-[clamp(42px,11cqw,48px)] cursor-pointer items-center justify-between overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#272126] pl-[3.5cqw] pr-0.5 text-left active:opacity-80"
        >
          <span className="min-w-0 flex-1 truncate pr-1.5 text-[clamp(11.5px,3.1cqw,13.5px)] font-medium text-[#f2eff3]">
            {config.promoText}
          </span>
          <img
            decoding="async"
            src={config.promoArt}
            alt=""
            loading="lazy"
            className="h-[92%] w-auto max-w-[36%] shrink-0 select-none object-contain"
            draggable={false}
          />
        </button>

        <button
          type="button"
          className="col-span-1 flex h-[clamp(42px,11cqw,48px)] cursor-pointer items-center justify-center gap-1 rounded-[14px] border border-white/[0.08] bg-[#272126] text-[clamp(12px,3.25cqw,14px)] font-semibold text-[#a57ae8] active:opacity-80"
        >
          <span>More</span>
          <svg
            viewBox="0 0 24 24"
            className="h-[clamp(13px,3.4cqw,15px)] w-[clamp(13px,3.4cqw,15px)]"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.3}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14m-5-5 5 5-5 5" />
          </svg>
        </button>
      </div>
    </section>
  );
}

export function HomeScreen({ hasScrolled }: { hasScrolled: boolean }) {
  const navigate = useNavigate();
  const clearSession = useServerFn(clearAccessSession);
  const fetchSessionKey = useServerFn(getCurrentSessionKey);

  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [sessionKey, setSessionKey] = useState("");
  const [sessionUserName, setSessionUserName] = useState("");
  const [loadingKey, setLoadingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    if (!logoutDialogOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoggingOut) {
        setLogoutDialogOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [logoutDialogOpen, isLoggingOut]);

  const openLogoutDialog = () => {
    const cached = getRememberedKey();
    if (cached?.key) {
      setSessionKey(cached.key);
      setSessionUserName(cached.userName ?? "");
    }
    setCopiedKey(false);
    setLogoutDialogOpen(true);

    setLoadingKey(true);
    fetchSessionKey()
      .then((res) => {
        if (res?.ok && res.key) {
          setSessionKey(res.key);
          setSessionUserName(res.userName ?? "");
          saveRememberedKey({ key: res.key, userName: res.userName });
        }
      })
      .catch(() => {})
      .finally(() => setLoadingKey(false));
  };

  const handleCopyKey = async () => {
    if (!sessionKey) return;
    const ok = await copyTextToClipboard(sessionKey);
    if (ok) {
      setCopiedKey(true);
      toast.success("Access key copied");
      window.setTimeout(() => setCopiedKey(false), 1800);
    } else {
      toast.error("Could not copy key");
    }
  };

  const handleConfirmLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    // Explicit user logout: stop automatic redirect back to home until they unlock again
    setAutoLoginEnabled(false);
    if (sessionKey) {
      saveRememberedKey({ key: sessionKey, userName: sessionUserName });
    }
    try {
      const res = await clearSession();
      if (res?.key) {
        saveRememberedKey({ key: res.key, userName: res.userName });
      }
    } catch {
      // Proceed to login even if session clear request fails
    } finally {
      window.location.replace("/login");
    }
  };

  const moneyTransfers = [
    { label: "To Mobile\nNumber", icon: mtMobile, to: "/pay" as const },
    { label: "To Bank &\nSelf A/c", icon: mtBank, to: "/pay" as const },
    { label: "PhonePe\nWallet", icon: mtWallet, to: "/pay" as const },
    { label: "Check\nBalance", icon: mtBalance, to: "/check-balance" as const },
  ];

  return (
    <div className="@container relative w-full bg-[#060606] pb-6 text-white">
      {/* Sticky Top Header — transparent over hero, solid black on scroll */}
      <header
        className={`fixed inset-x-0 top-0 z-40 mx-auto flex h-[56px] w-full max-w-[430px] items-center justify-between px-[4.4cqw] transition-colors duration-200 ${
          hasScrolled
            ? "bg-[#060606]/96"
            : "bg-transparent"
        }`}
      >
        <button
          type="button"
          aria-label="Logout"
          title="Logout"
          disabled={isLoggingOut}
          onClick={openLogoutDialog}
          className="flex h-[clamp(34px,8.7cqw,38px)] w-[clamp(34px,8.7cqw,38px)] cursor-pointer items-center justify-center rounded-full bg-[#f2b111] shadow-sm transition-transform active:scale-95 disabled:opacity-70"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[15px] w-[15px] text-[#fff8dc]"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.7}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 4.5v15" />
            <path d="M5.5 8.25 18.5 15.75" />
            <path d="M18.5 8.25 5.5 15.75" />
          </svg>
        </button>

        <button
          type="button"
          aria-label="Help"
          className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded-full border-[1.7px] border-white/90 text-[14px] font-bold leading-none text-white active:opacity-75"
        >
          ?
        </button>
      </header>

      {/* Hero Banner — Buy Gold instantly! with edge-feathered 24K Gold bar (zero seam, zero '?' bleed) */}
      <section className="relative overflow-hidden bg-[radial-gradient(ellipse_at_72%_48%,#3a1b00_0%,#150800_46%,#060606_82%)] px-[4.4cqw] pb-[4.5cqw] pt-[64px]">
        <div className="relative flex min-h-[clamp(164px,42cqw,192px)] items-center justify-between">
          <div className="relative z-10 max-w-[56%] pl-[2cqw]">
            <h1 className="bg-gradient-to-b from-[#ffe2a3] via-[#f4c673] to-[#d99d43] bg-clip-text text-[clamp(27px,7.6cqw,33px)] font-extrabold leading-[1.12] tracking-[-0.02em] text-transparent">
              Buy Gold
              <br />
              instantly!
            </h1>
            <button
              type="button"
              className="mt-[4.5cqw] inline-flex cursor-pointer items-center gap-1 rounded-full bg-gradient-to-r from-[#d4963f] via-[#f1c66e] to-[#d99f45] px-[4.2cqw] py-[2.1cqw] text-[clamp(12px,3.25cqw,14px)] font-bold text-[#240e00] shadow-[0_6px_18px_rgba(242,188,82,0.28)] active:scale-95"
            >
              <span>Get Started</span>
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          </div>

          <img
            decoding="async"
            src={heroGoldBar}
            alt="24K Gold"
            className="pointer-events-none -mr-[3cqw] h-[clamp(164px,43cqw,194px)] w-auto shrink-0 select-none object-contain"
            draggable={false}
          />
        </div>
      </section>

      {/* Money Transfers Section */}
      <section className="px-[4.4cqw] pt-[2cqw]">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[clamp(15px,4.1cqw,17.5px)] font-bold tracking-[-0.01em] text-white">
            Money Transfers
          </h2>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#5f2a10] bg-[#3a1608] py-[4px] pl-[5px] pr-[11px] active:opacity-80"
          >
            <span className="flex h-[20px] w-[20px] items-center justify-center rounded-full bg-gradient-to-br from-[#ffd35c] to-[#d17a10] text-[10px] font-extrabold text-[#3a1608]">
              ₹
            </span>
            <span className="text-[clamp(11px,3cqw,13px)] font-semibold text-[#f1bfaf]">
              Refer → ₹1200
            </span>
          </button>
        </div>

        {/* 4 Purple Circular Transfer Actions (clean circular alpha mask — zero black corner rim) */}
        <div className="mt-[4.2cqw] grid grid-cols-4 gap-[3.24cqw]">
          {moneyTransfers.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                toast("MADE BY ZIMBOLA");
                navigate({ to: item.to });
              }}
              className="flex cursor-pointer flex-col items-center text-center active:scale-95"
            >
              <div className="flex h-[clamp(52px,14.8cqw,64px)] w-[clamp(52px,14.8cqw,64px)] items-center justify-center overflow-hidden rounded-full bg-[#5e00c0]">
                <img
                  decoding="async"
                  src={item.icon}
                  alt={item.label.replace("\n", " ")}
                  className="h-full w-full select-none object-cover"
                  draggable={false}
                />
              </div>
              <span className="mt-[2.2cqw] whitespace-pre-line text-center text-[clamp(11px,3cqw,13px)] font-medium leading-[1.24] text-[#ece9ed]">
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Horizontal Scrollable Promo Pills Band — zero text bleed in icons */}
      <div className="mt-[4.8cqw] bg-[#1a171b] py-[2.8cqw]">
        <div className="no-scrollbar flex gap-[2.6cqw] overflow-x-auto px-[4.4cqw]">
          {PROMO_PILLS.map((pill) => (
            <button
              key={pill.label}
              type="button"
              className="flex shrink-0 cursor-pointer items-center gap-[2.2cqw] rounded-[13px] border border-white/[0.08] bg-[#272126] py-[5px] pl-[7px] pr-[14px] active:opacity-80"
            >
              <img
                decoding="async"
                src={pill.icon}
                alt=""
                loading="lazy"
                className="h-[34px] w-[32px] shrink-0 select-none rounded-[8px] object-contain"
                draggable={false}
              />
              <span className="whitespace-nowrap text-[clamp(11.5px,3.1cqw,13.5px)] font-medium text-[#f2eff3]">
                {pill.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Category Sections 1–3 */}
      <CategorySection config={RECHARGE_SECTION} />
      <CategorySection config={LOANS_SECTION} />
      <CategorySection config={GOLD_SECTION} />

      {/* "Did you know?" Horizontal Swipeable Carousel — exact colors, single arrow, feathered art */}
      <div className="mt-[5.8cqw]">
        <div className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto">
          {DID_YOU_KNOW_CARDS.map((card) => (
            <button
              key={card.text}
              type="button"
              className="relative flex h-[clamp(86px,22cqw,96px)] w-full shrink-0 snap-center cursor-pointer items-center justify-between overflow-hidden pl-[4.4cqw] text-left active:opacity-90"
              style={{ backgroundColor: card.bg }}
            >
              <div className="relative z-10 min-w-0 max-w-[74%] pr-2">
                <p className="text-[clamp(11px,3cqw,13px)] font-normal text-white/80">
                  Did you know?
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="truncate text-[clamp(13.5px,3.7cqw,16px)] font-bold leading-tight text-white">
                    {card.text}
                  </p>
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-white text-[#141414]">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14m-5-5 5 5-5 5" />
                    </svg>
                  </span>
                </div>
              </div>
              <img
                decoding="async"
                src={card.art}
                alt=""
                loading="lazy"
                className="h-full w-auto shrink-0 select-none object-contain"
                draggable={false}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Category Sections 4–7 */}
      <CategorySection config={INSURANCE_SECTION} />
      <CategorySection config={MUTUAL_FUNDS_SECTION} />
      <CategorySection config={DEPOSITS_SECTION} />
      <CategorySection config={TRAVEL_SECTION} />

      {/* New Credit Card Full-Bleed Dark Showcase */}
      <section className="mt-[5.8cqw] bg-[#272126] px-[4.4cqw] py-[5cqw]">
        <h2 className="text-[clamp(15px,4.1cqw,17.5px)] font-bold tracking-[-0.01em] text-white">
          New Credit Card
        </h2>
        <div className="mt-[4cqw] grid grid-cols-4 gap-[3.24cqw]">
          {CREDIT_CARDS.map((card) => (
            <button
              key={card.label}
              type="button"
              className="flex cursor-pointer flex-col items-center text-center active:opacity-80"
            >
              <div className="aspect-[135/200] w-[86%] overflow-hidden rounded-[9px] shadow-md">
                <img
                  decoding="async"
                  src={card.image}
                  alt={card.label.replace("\n", " ")}
                  loading="lazy"
                  className="h-full w-full select-none object-cover"
                  draggable={false}
                />
              </div>
              <span className="mt-[2.6cqw] whitespace-pre-line text-center text-[clamp(11px,3cqw,13px)] font-medium leading-[1.24] text-[#ece9ed]">
                {card.label}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Category Section 8: Offers & Rewards */}
      <CategorySection config={OFFERS_SECTION} />

      {/* PhonePe Invest Full-Bleed Blue Banner — exact vertical gradient + feathered phone (zero seam) */}
      <section className="mt-[6cqw] overflow-hidden bg-[linear-gradient(180deg,#1264c1_0%,#0f64c9_14%,#0f64c9_86%,#0d56ab_100%)]">
        <div className="flex h-[clamp(138px,36.5cqw,160px)] items-center justify-between pl-[4.4cqw]">
          <div className="z-10 flex min-w-0 max-w-[50%] flex-col justify-center py-3">
            <div className="flex items-center gap-1.5">
              <span className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-extrabold text-[#1160bd]">
                पे
              </span>
              <div className="leading-[1.05]">
                <span className="block text-[clamp(10.5px,2.8cqw,12px)] font-bold text-white">
                  PhonePe
                </span>
                <span className="block text-[clamp(11.5px,3.1cqw,13px)] font-extrabold text-white">
                  Invest
                </span>
              </div>
            </div>

            <p className="mt-2 text-[clamp(13px,3.6cqw,15.5px)] font-semibold leading-[1.25] text-white">
              A new{" "}
              <span className="font-bold text-[#7df9ff]">Investment app</span>
              <br />
              from PhonePe
            </p>

            <button
              type="button"
              className="mt-2.5 w-fit cursor-pointer rounded-full bg-[#f4cb29] px-[3.6cqw] py-[1.4cqw] text-[clamp(11px,2.9cqw,12.5px)] font-bold text-[#141414] shadow-xs active:scale-95"
            >
              Download now
            </button>
          </div>

          <img
            decoding="async"
            src={investPhone}
            alt="PhonePe Invest app preview"
            loading="lazy"
            className="h-full w-auto max-w-[53%] shrink-0 select-none object-contain object-bottom"
            draggable={false}
          />
        </div>
      </section>

      {/* Brand in Focus Section */}
      <section className="px-[4.4cqw] pt-[5.8cqw]">
        <h2 className="text-[clamp(15px,4.1cqw,17.5px)] font-bold tracking-[-0.01em] text-white">
          Brand in Focus
        </h2>
        <div className="mt-[4cqw] grid grid-cols-4 gap-[3.24cqw]">
          {BRAND_IN_FOCUS.map((brand) => (
            <button
              key={brand.label}
              type="button"
              className="flex cursor-pointer flex-col items-center text-center active:opacity-80"
            >
              <div className="h-[clamp(44px,11.8cqw,52px)] w-[clamp(44px,11.8cqw,52px)] overflow-hidden rounded-full bg-[#bd0072]">
                <img
                  decoding="async"
                  src={brand.icon}
                  alt={brand.label}
                  loading="lazy"
                  className="h-full w-full select-none object-cover"
                  draggable={false}
                />
              </div>
              <span className="mt-[2.2cqw] whitespace-nowrap text-[clamp(11px,3cqw,13px)] font-medium leading-tight text-[#ece9ed]">
                {brand.label}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Logout Confirmation Dialog (Yes / No + Copy Key) */}
      {logoutDialogOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
          onClick={() => {
            if (!isLoggingOut) setLogoutDialogOpen(false);
          }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 px-5 "
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ios-hud-pop w-full max-w-[360px] overflow-hidden rounded-[22px] border border-white/[0.1] bg-[#1a171e] p-5 text-white shadow-[0_24px_60px_rgba(0,0,0,0.8)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f2b111]/15 text-[#f2b111] ring-1 ring-[#f2b111]/30">
                  <LogOut className="h-5 w-5" strokeWidth={2.2} />
                </span>
                <div>
                  <h3
                    id="logout-dialog-title"
                    className="text-[17px] font-bold leading-snug text-white"
                  >
                    Log Out?
                  </h3>
                  <p className="mt-0.5 text-[12px] text-[#a6a1ab]">
                    Are you sure you want to log out?
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                disabled={isLoggingOut}
                onClick={() => setLogoutDialogOpen(false)}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/[0.06] text-[#a6a1ab] transition-colors hover:bg-white/[0.12] hover:text-white disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Access Key + Copy Key Box */}
            <div className="mt-4 rounded-[14px] border border-white/[0.08] bg-[#100e13] p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9b95a3]">
                  <KeyRound className="h-3.5 w-3.5 text-[#a57ae8]" />
                  <span>Your Access Key</span>
                </span>
                <span className="text-[10.5px] font-medium text-emerald-400/90">
                  Saved on login
                </span>
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {loadingKey && !sessionKey ? (
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-[#8e8896]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#a57ae8]" />
                      <span>Loading key…</span>
                    </span>
                  ) : sessionKey ? (
                    <p className="truncate font-mono text-[14px] font-bold tracking-[0.04em] text-white">
                      {sessionKey}
                    </p>
                  ) : (
                    <p className="text-[12.5px] text-[#8e8896]">
                      Bound to this device
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!sessionKey}
                  onClick={() => void handleCopyKey()}
                  className={`inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[9px] px-3 text-[12px] font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
                    copiedKey
                      ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40"
                      : "bg-[#8522ee] text-white hover:bg-[#771cd8]"
                  }`}
                >
                  {copiedKey ? (
                    <>
                      <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Key</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <p className="mt-3 text-[12px] leading-relaxed text-[#9e98a6]">
              Your key stays locked to this device only — no other device can use it, and it will stay remembered when you log back in.
            </p>

            {/* Yes / No Confirmation Actions */}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={() => setLogoutDialogOpen(false)}
                className="flex h-[44px] cursor-pointer items-center justify-center rounded-[12px] border border-white/[0.1] bg-[#29242d] text-[14px] font-semibold text-white transition-colors hover:bg-[#342e39] active:scale-[0.98] disabled:opacity-50"
              >
                No
              </button>
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={() => void handleConfirmLogout()}
                className="flex h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-[12px] bg-[#e53935] text-[14px] font-semibold text-white shadow-[0_6px_18px_rgba(229,57,53,0.35)] transition-colors hover:bg-[#d32f2f] active:scale-[0.98] disabled:opacity-60"
              >
                {isLoggingOut ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Logging Out…</span>
                  </>
                ) : (
                  <span>Yes, Log Out</span>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
