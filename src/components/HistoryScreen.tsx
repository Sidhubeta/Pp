import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getMonthLabel, getStoredPayments } from "@/lib/paymentHistory";
import historyGoldCoin from "@/assets/originals/singlecoin.webp";
import kotakBankLogo from "@/assets/originals/kotak_bank_logo.png";

export type HistoryTransaction = {
  id: string;
  kind: "paid" | "received" | "bill";
  label: string;
  name: string;
  upi: string;
  amount: number;
  date: string;
  month?: string;
  createdAt?: number;
  message?: string;
};

export type HistoryMonth = {
  month: string;
  total: string;
  transactions: HistoryTransaction[];
};

const formatAmount = (n: number) => {
  const safe = Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  return safe % 1 === 0
    ? `₹${safe.toLocaleString("en-IN")}`
    : `₹${safe.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
};

export function calculateMonthTotal(transactions: HistoryTransaction[]): string {
  const sum = transactions.reduce(
    (acc, tx) => acc + (Number.isFinite(tx.amount) ? tx.amount : 0),
    0,
  );
  return formatAmount(sum);
}

const seedHistoryMonths: { month: string; transactions: HistoryTransaction[] }[] = [
  {
    month: "October 2026",
    transactions: [
      { id: "t1", kind: "paid", label: "Paid to", name: "GREEN BEAN CAFE LLP", upi: "greenbeancafe@okhdfcbank", amount: 835, date: "1 day ago" },
      { id: "t2", kind: "paid", label: "Paid to", name: "URBAN SPICE KITCHEN", upi: "urbanspice@ybl", amount: 160, date: "1 day ago" },
      { id: "t3", kind: "paid", label: "Paid to", name: "Mehta and brothers", upi: "mehtabrothers@okaxis", amount: 200, date: "1 day ago" },
      { id: "t5", kind: "paid", label: "Paid to", name: "RAKESH VERMA", upi: "rakeshverma@ybl", amount: 50, date: "01 Oct" },
      { id: "t6", kind: "paid", label: "Paid to", name: "Krishna general store", upi: "krishnastore@paytm", amount: 20, date: "01 Oct" },
    ],
  },
  {
    month: "September 2026",
    transactions: [
      { id: "t8", kind: "paid", label: "Paid to", name: "CITY BAZAAR RETAIL LTD", upi: "citybazaar@icici", amount: 1450, date: "27 Sep" },
      { id: "t9", kind: "paid", label: "Paid to", name: "QUICKBITE FOODS", upi: "quickbite@icici", amount: 389, date: "25 Sep" },
    ],
  },
];

export const historyMonths: HistoryMonth[] = seedHistoryMonths.map((m) => ({
  month: m.month,
  total: calculateMonthTotal(m.transactions),
  transactions: m.transactions,
}));

function BankBadge() {
  return (
    <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] bg-white p-[1.5px]">
      <img
        decoding="async"
        src={kotakBankLogo}
        alt="Kotak Mahindra Bank"
        className="h-full w-full select-none object-contain"
        draggable={false}
      />
    </span>
  );
}

function TxIcon({ kind }: { kind: HistoryTransaction["kind"] }) {
  if (kind === "bill") {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="white" strokeWidth="1.6">
          <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2a2a2a]">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
        {kind === "paid" ? <path d="M7 17 17 7M9 7h8v8" /> : <path d="M17 7 7 17M15 17H7V9" />}
      </svg>
    </div>
  );
}

export function HistoryScreen() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newPayments, setNewPayments] = useState<HistoryTransaction[]>([]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Load payments completed in this app, newest first.
  useEffect(() => {
    setNewPayments(getStoredPayments());
  }, []);

  // Group stored payments by month (defaulting legacy entries to current month)
  // and merge with seed months while dynamically computing every month's real total.
  const currentMonth = getMonthLabel();
  const groupedOrder: string[] = [];
  const groupedMap = new Map<string, HistoryTransaction[]>();

  const pushTx = (monthName: string, tx: HistoryTransaction) => {
    if (!groupedMap.has(monthName)) {
      groupedMap.set(monthName, []);
      groupedOrder.push(monthName);
    }
    groupedMap.get(monthName)!.push(tx);
  };

  for (const tx of newPayments) {
    const mName = tx.month || currentMonth;
    pushTx(mName, tx);
  }
  for (const seed of seedHistoryMonths) {
    for (const tx of seed.transactions) {
      pushTx(seed.month, tx);
    }
  }

  const q = searchQuery.trim().toLowerCase();
  const months: HistoryMonth[] = groupedOrder
    .map((monthName) => {
      const combined = groupedMap.get(monthName) ?? [];
      const filtered = q
        ? combined.filter(
            (tx) =>
              tx.name.toLowerCase().includes(q) ||
              tx.upi.toLowerCase().includes(q) ||
              String(tx.amount).includes(q),
          )
        : combined;
      return {
        month: monthName,
        total: calculateMonthTotal(filtered),
        transactions: filtered,
      };
    })
    .filter((m) => m.transactions.length > 0);

  const openTx = (tx: HistoryTransaction) =>
    navigate({
      from: "/",
      to: "/success-details",
      search: {
        name: tx.name,
        upi: tx.upi,
        amount: String(tx.amount),
        message: tx.message ?? "",
        // Tells the details page to send the user back to the history tab.
        from: "history",
      },
    });

  return (
    <div className="min-h-dvh bg-[#0a0a0a] text-white">
      {/* Top area: help icon row + big title (collapses on scroll) */}
      <div className="px-[22px] pt-3">
        <div className="flex justify-end">
          <HelpIcon />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-[19px] font-bold tracking-tight">History</h1>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full border border-[#3a3a3a] px-3.5 py-1.5 text-[12px] font-semibold"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="white" strokeWidth="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v9M8.5 12.5 12 16l3.5-3.5" />
            </svg>
            My Statements
          </button>
        </div>
      </div>

      {/* Sticky header shown after scroll: compact title + help, then search */}
      <div className="sticky top-0 z-30 bg-[#0a0a0a] px-[15px] pb-3 pt-3">
        <div
          className={`flex items-center justify-between overflow-hidden px-[2px] transition-all duration-200 ${
            scrolled ? "mb-4 max-h-12 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <span className="pt-4 text-[15px] font-bold">History</span>
          <span className="pt-4"><HelpIcon /></span>
        </div>
        <div className="flex h-[46px] items-center rounded-full bg-[#262626] px-4">
          <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="white" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            className="ml-3.5 flex-1 bg-transparent text-[14px] text-white placeholder:text-[#9a9a9a] outline-none"
          />
          <span className="mx-3 h-5 w-px bg-[#4a4a4a]" />
          <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="white" strokeWidth="1.8">
            <path d="M3 8h11M18 8h3M3 16h3M10 16h11" />
            <circle cx="16" cy="8" r="2" />
            <circle cx="8" cy="16" r="2" />
          </svg>
        </div>
      </div>

      {/* Sponsored Promo Strip (PhonePe homePage.json CATEGORY_ACTION_PROMO_H40) */}
      <div className="px-[15px] pb-3.5">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#1a1a1d] px-3.5 py-2.5">
          <img
            decoding="async"
            src={historyGoldCoin}
            alt="Gold SIP"
            loading="lazy"
            className="h-11 w-11 shrink-0 select-none object-contain"
            draggable={false}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-white/75">
                Ad
              </span>
              <span className="truncate text-[13.5px] font-semibold text-white">
                Start savings in Gold SIP at ₹10
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11.5px] text-[#a3a3a3]">
              24K pure gold • Pause or withdraw anytime
            </p>
          </div>
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#a685ff]" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
          </svg>
        </div>
      </div>

      {months.map((m) => (
        <section key={m.month}>
          <div className="flex items-center justify-between bg-[#1f1f1f] px-[20px] py-[12px] text-[12px] text-[#d4d4d4]">
            <span>{m.month}</span>
            <span className="flex items-center gap-2.5 text-[13.5px] font-medium text-white">
              {m.total}
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="#9a9a9a" strokeWidth="2">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </span>
          </div>
          {m.transactions.map((tx, i) => (
            <button
              key={tx.id}
              type="button"
              onClick={() => openTx(tx)}
              className="flex w-full gap-3.5 pl-[18px] pt-[16px] text-left"
            >
              <TxIcon kind={tx.kind} />
              <div className={`flex-1 pb-[16px] pr-[18px] ${i < m.transactions.length - 1 ? "border-b border-[#2a2a2a]" : ""}`}>
                <div className="text-[11px] text-[#b8b8b8]">{tx.label}</div>
                <div className="mt-0.5 flex items-center justify-between gap-3">
                  <span className="truncate text-[13.5px] font-medium">{tx.name}</span>
                  <span className={`shrink-0 text-[14px] font-semibold ${tx.kind === "received" ? "text-[#3fb950]" : ""}`}>
                    {tx.kind === "received" ? `+ ${formatAmount(tx.amount)}` : formatAmount(tx.amount)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#a3a3a3]">
                  <span>{tx.date}</span>
                  <span className="flex items-center gap-1.5">
                    {tx.kind === "received" ? "Credited to" : "Debited from"}
                    <BankBadge />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="white" strokeWidth="1.6">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01" strokeLinecap="round" />
    </svg>
  );
}
