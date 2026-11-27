import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  CircleHelp,
  CirclePlus,
  Send,
  Wallet,
} from "lucide-react";
import { LottiePlayer } from "@/components/LottiePlayer";
import loanArtMain from "@/assets/originals/personal_loan_image_2.png";
import loanArtSub from "@/assets/originals/personal_loan_image_0.png";
import { PhonePePromoCard } from "@/components/PhonePePromoBanner";
import npciUpiLogoDark from "@/assets/originals/ic_upi_npci_logo_dark.png";
import kotakBankLogo from "@/assets/originals/kotak_bank_logo.png";

export const Route = createFileRoute("/check-balance")({
  head: () => ({
    meta: [
      { title: "Check Balance — Money Transfers & More" },
      {
        name: "description",
        content:
          "Check your bank account, UPI Lite and wallet balances in one place.",
      },
      { property: "og:title", content: "Check Balance — Money Transfers & More" },
      {
        property: "og:description",
        content:
          "Check your bank account, UPI Lite and wallet balances in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckBalancePage,
});

function KotakLogo() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white p-1.5">
      <img
        src={kotakBankLogo}
        alt="Kotak Mahindra Bank"
        className="h-full w-full select-none object-contain"
        draggable={false}
      />
    </span>
  );
}

function CheckBalancePage() {
  const navigate = useNavigate();

  return (
    <main className="min-h-dvh bg-[#0e0e0e]">
      <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-[#0e0e0e] pb-8 text-white">
        {/* Header */}
        <header className="flex items-center gap-3.5 px-4 pb-3 pt-4">
          <button
            type="button"
            aria-label="Go back"
            onClick={() => navigate({ to: "/" })}
            className="cursor-pointer rounded-full p-1 text-white/90 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2} />
          </button>
          <h1 className="flex-1 text-[18px] font-semibold tracking-tight">
            Check Balance
          </h1>
          <button
            type="button"
            aria-label="Help"
            className="cursor-pointer rounded-full p-1 text-white/90 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <CircleHelp className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </header>

        {/* Cashback banner */}
        <section className="mx-4 mt-1.5">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl bg-[#1c1c1e] px-4 py-3.5 text-left transition-colors hover:bg-[#242427] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-[15px] font-semibold">
                Up to ₹100* cashback
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white">
                  <ArrowRight className="h-3 w-3 text-black" strokeWidth={2.5} />
                </span>
              </span>
              <span className="mt-1 block text-[12.5px] text-white/55">
                Save your VISA Card and earn
              </span>
            </span>
            <LottiePlayer
              path="/animations/cashback_offer_gift_card.json"
              renderer="svg"
              loop
              className="h-16 w-16 shrink-0"
              ariaLabel="Cashback offer"
            />
          </button>
        </section>

        {/* Accounts list */}
        <section className="mt-3 px-4">
          {/* Bank account */}
          <button
            type="button"
            onClick={() => navigate({ to: "/balance-pin" })}
            className="flex w-full cursor-pointer items-center gap-3.5 rounded-xl px-1 py-4 text-left transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <KotakLogo />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">
                Kotak Mahindra Bank-9329
              </span>
              <span className="mt-0.5 block text-[12.5px] text-white/55">
                Bank Account
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-white/70" strokeWidth={1.8} />
          </button>

          {/* UPI Lite */}
          <div className="flex items-center gap-3.5 border-t border-white/5 px-1 py-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full">
              <Send className="h-6 w-6 text-white/85" strokeWidth={1.5} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">UPI Lite</span>
              <span className="mt-0.5 block text-[12.5px] text-white/55">
                Pin-less payments up to ₹1,000
              </span>
            </span>
            <button
              type="button"
              className="shrink-0 cursor-pointer rounded-lg px-2 py-1 text-[13.5px] font-semibold text-[#a685ff] transition-colors hover:bg-[#a685ff]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Try Now
            </button>
          </div>

          {/* Wallet */}
          <div className="flex items-center gap-3.5 border-t border-white/5 px-1 py-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full">
              <Wallet className="h-6 w-6 text-white/85" strokeWidth={1.5} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">
                PhonePe Wallet
              </span>
              <span className="mt-0.5 block text-[12.5px] text-white/55">
                Balance: ₹0
              </span>
            </span>
            <button
              type="button"
              className="shrink-0 cursor-pointer rounded-lg px-2 py-1 text-[13.5px] font-semibold text-[#a685ff] transition-colors hover:bg-[#a685ff]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Activate
            </button>
          </div>

          {/* Add UPI account */}
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-3.5 border-t border-white/5 px-1 py-4 text-left transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full">
              <CirclePlus className="h-6 w-6 text-white/85" strokeWidth={1.5} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">
                Add UPI account
              </span>
              <span className="mt-0.5 block text-[12.5px] text-white/55">
                RuPay card, bank account &amp; more
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-white/70" strokeWidth={1.8} />
          </button>
        </section>

        {/* Ad */}
        <section className="mt-5 bg-[#181818] px-3 pb-5 pt-3.5">
          <div className="relative h-[196px] w-full overflow-hidden rounded-2xl">
            <PhonePePromoCard
              bgColor="#DBEAFE"
              accentBg="#1E3A8A"
              ctaTextColor="#1E3A8A"
              headline={
                <>
                  Get <span className="font-bold">instant loan</span> up to ₹5
                  Lakhs in minutes
                </>
              }
              ctaLabel="Check Offer"
              artSrc={loanArtMain}
              artAlt="Instant Personal Loan"
              secondaryArtSrc={loanArtSub}
              artClassName="bottom-2 left-3 h-[80%] max-w-[34%]"
              secondaryArtClassName="bottom-3 left-[24%] h-[58%] max-w-[24%]"
              showAdBadge
              adBadgeVariant="purple"
            />
          </div>
        </section>

        {/* Powered by UPI footer */}
        <footer className="flex flex-col items-center gap-1 py-4">
          <span className="text-[11px] font-medium tracking-[0.2em] text-white/45">
            POWERED BY
          </span>
          <img
            src={npciUpiLogoDark}
            alt="NPCI UPI"
            className="-my-2 h-14 w-auto select-none object-contain"
            draggable={false}
          />
        </footer>
      </div>
    </main>
  );
}
