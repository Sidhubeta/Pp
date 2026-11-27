import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import npciUpiLogoDark from "@/assets/originals/ic_upi_npci_logo_dark.png";
import kotakBankLogo from "@/assets/originals/kotak_bank_logo.png";

const paymentSchema = z.object({
  receiverName: z
    .string()
    .trim()
    .nonempty({ message: "Receiver name is required" })
    .max(100, { message: "Name must be less than 100 characters" }),
  upiId: z
    .string()
    .trim()
    .nonempty({ message: "UPI ID or mobile number is required" })
    .max(100, { message: "UPI ID must be less than 100 characters" })
    .refine(
      (v) => /^[^\s@]+@[^\s@]{2,}$/.test(v) || /^\d{10}$/.test(v),
      { message: "Enter a valid UPI ID (e.g. name@bank) or 10-digit number" },
    ),
  amount: z
    .string()
    .trim()
    .nonempty({ message: "Amount is required" })
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), {
      message: "Enter a valid amount (e.g. 250 or 250.50)",
    })
    .refine((v) => Number(v) > 0, { message: "Amount must be greater than 0" })
    .refine((v) => Number(v) <= 1000000, {
      message: "Amount must be less than ₹10,00,000",
    }),
});

export const Route = createFileRoute("/pay")({
  validateSearch: (search) =>
    z
      .object({ pa: z.string().optional(), pn: z.string().optional() })
      .parse(search),
  head: () => ({
    meta: [
      { title: "Pay — Send Money via UPI" },
      {
        name: "description",
        content: "Enter receiver name, UPI ID and amount to send a payment.",
      },
      { property: "og:title", content: "Pay — Send Money via UPI" },
      {
        property: "og:description",
        content: "Enter receiver name, UPI ID and amount to send a payment.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentPage,
});

type FieldErrors = Partial<Record<"receiverName" | "upiId" | "amount", string>>;

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase();
}

const SHEET_MS = 380;

function PaymentSheet({
  name,
  upiId,
  amount,
  onClose,
  onPay,
}: {
  name: string;
  upiId: string;
  amount: string;
  onClose: () => void;
  onPay: () => void;
}) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const close = useCallback(() => {
    setEntered(false);
    window.setTimeout(onClose, SHEET_MS);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        onClick={close}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ease-out ${
          entered ? "opacity-100" : "opacity-0"
        }`}
      />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Payment method"
          onClick={(e) => e.stopPropagation()}
          style={{ transitionDuration: `${SHEET_MS}ms` }}
          className={`pointer-events-auto relative flex w-full max-w-[430px] flex-col bg-transparent transition-transform ease-[cubic-bezier(0.32,0.72,0,1)] ${
            entered ? "translate-y-0" : "translate-y-full"
          }`}
        >
        {/* Close button */}
        <div
          onClick={close}
          className={`flex justify-center pb-6 transition-opacity duration-300 ${
            entered ? "opacity-100 delay-150" : "opacity-0 pointer-events-none"
          }`}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2a2a2a] text-white transition-colors hover:bg-[#3a3a3a]"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Sheet */}
        <div className="max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-[#111111]">
          {/* Total payable */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4.5">
            <p className="text-[15px] font-semibold text-white">Total Payable</p>
            <p className="text-[19px] font-bold text-white">₹{amount}</p>
          </div>

          {/* Recommended */}
          <div className="border-b border-zinc-800 px-5 py-4">
            <p className="text-[12.5px] text-zinc-400">Recommended</p>
            <div className="mt-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white p-1.5">
                  <img
                    src={kotakBankLogo}
                    alt="Kotak Mahindra Bank"
                    className="h-full w-full select-none object-contain"
                    draggable={false}
                  />
                </span>
                <div>
                  <p className="text-[14.5px] font-semibold text-white">Kotak Mahindra Bank</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-[12.5px] tracking-wider text-zinc-400">•••• 9329</span>
                    <img
                      src={npciUpiLogoDark}
                      alt="UPI"
                      className="h-4 w-auto select-none object-contain"
                      draggable={false}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-[14.5px] font-medium text-zinc-200">₹{amount}</span>
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600">
                  <svg
                    className="h-3.5 w-3.5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              </div>
            </div>
          </div>

          {/* Add payment method */}
          <div className="px-5 py-4">
            <p className="text-[12.5px] text-zinc-400">Add Payment Method</p>
            <button
              type="button"
              className="mt-3.5 flex w-full items-center justify-between text-left"
            >
              <span className="flex items-center gap-3.5">
                <svg
                  className="h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.6}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 10h18M4 6h16M5 6v12h14V6M9 18v-5h6v5"
                  />
                </svg>
                <span className="text-[14px] text-white">Add Bank Account</span>
              </span>
              <svg
                className="h-4 w-4 text-zinc-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              type="button"
              className="mt-4 flex w-full items-center justify-between text-left"
            >
              <span className="flex items-center gap-3.5">
                <svg
                  className="h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.6}
                >
                  <rect x="5" y="3" width="14" height="18" rx="2" />
                  <path strokeLinecap="round" d="M9 8h6M12 12v5M9.5 13.5l5-3" />
                </svg>
                <span className="text-[14px] text-white">Add credit line on UPI</span>
              </span>
              <svg
                className="h-4 w-4 text-zinc-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Pay button */}
          <div className="px-4 pb-5 pt-2">
            <button
              type="button"
              onClick={onPay}
              className="w-full rounded-lg bg-[#8522ee] py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-[#791dd9] active:bg-[#6d19c4]"
            >
              Pay ₹{amount}
            </button>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

function PaymentPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [receiverName, setReceiverName] = useState(search.pn ?? "");
  const [upiId, setUpiId] = useState(search.pa ?? "");

  useEffect(() => {
    if (search.pn) setReceiverName(search.pn);
    if (search.pa) setUpiId(search.pa);
  }, [search.pn, search.pa]);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showSheet, setShowSheet] = useState(false);

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    const result = paymentSchema.safeParse({ receiverName, upiId, amount });
    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setShowSheet(true);
  };

  const formattedAmount = (() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || amount === "") return amount;
    return n % 1 === 0
      ? n.toLocaleString("en-IN")
      : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  })();

  const isReady = paymentSchema.safeParse({ receiverName, upiId, amount }).success;

  return (
    <div className="flex h-dvh w-full justify-center overflow-hidden bg-[#0d0d0d]">
      <div className="flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-[#0d0d0d]">
        {/* Header — left-aligned Pay title matching 59952.jpg */}
        <div className="flex shrink-0 items-center justify-between bg-[#070707] px-4 py-3.5">
          <div className="flex items-center gap-5">
            <button
              type="button"
              aria-label="Back"
              onClick={() => navigate({ to: "/" })}
              className="rounded-full p-1 text-white transition-colors hover:bg-white/10"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 12H5m0 0l7-7m-7 7l7 7"
                />
              </svg>
            </button>
            <h1 className="text-[16px] font-semibold tracking-tight text-white">
              Pay
            </h1>
          </div>
          <button
            type="button"
            aria-label="Help"
            className="rounded-full p-1 text-white transition-colors hover:bg-white/10"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.7}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handlePay} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="min-h-0 flex-1 overflow-y-auto pb-3">
            {/* Receiver card matching 59952.jpg */}
            <div className="mx-3 mt-2.5 rounded-2xl bg-[#191919] px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2f54d4]">
                  <span className="text-[13px] font-semibold text-white">
                    {getInitials(receiverName) || "PP"}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <input
                    id="receiverName"
                    placeholder="Enter receiver name"
                    type="text"
                    value={receiverName}
                    onChange={(e) => {
                      setReceiverName(e.target.value);
                      if (errors.receiverName) {
                        setErrors((prev) => ({ ...prev, receiverName: undefined }));
                      }
                    }}
                    maxLength={100}
                    aria-label="Receiver name"
                    className="w-full border-0 bg-transparent text-[14px] font-semibold leading-snug text-white placeholder:font-normal placeholder:text-zinc-500 focus:outline-none focus:ring-0"
                  />
                  <input
                    id="upiId"
                    placeholder="Enter UPI ID (e.g. name@bank)"
                    type="text"
                    value={upiId}
                    onChange={(e) => {
                      setUpiId(e.target.value);
                      if (errors.upiId) {
                        setErrors((prev) => ({ ...prev, upiId: undefined }));
                      }
                    }}
                    maxLength={100}
                    aria-label="UPI ID"
                    className="mt-0.5 w-full border-0 bg-transparent text-[13px] leading-snug text-[#c4c4c4] placeholder:text-zinc-500 focus:outline-none focus:ring-0"
                  />
                </div>
              </div>
              {(errors.receiverName || errors.upiId) && (
                <p className="mt-2 text-xs text-red-400">
                  {errors.receiverName || errors.upiId}
                </p>
              )}

              {/* Amount — purple-outlined dark box matching 59952.jpg */}
              <div
                className={`mt-3.5 flex items-center rounded-[8px] border-[1.5px] bg-[#262626] px-3.5 py-3 transition-colors ${
                  errors.amount ? "border-red-500" : "border-[#8b5cf6]"
                }`}
              >
                <span className="mr-2 text-[17.5px] font-semibold leading-none text-white">
                  ₹
                </span>
                <input
                  id="amount"
                  placeholder="Enter amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^\d*\.?\d{0,2}$/.test(v)) {
                      setAmount(v);
                      if (errors.amount) {
                        setErrors((prev) => ({ ...prev, amount: undefined }));
                      }
                    }
                  }}
                  maxLength={12}
                  aria-label="Amount"
                  className="w-full bg-transparent text-[17.5px] font-semibold leading-none text-white placeholder:font-semibold placeholder:text-[#9e9e9e] focus:outline-none"
                />
              </div>
              {errors.amount && (
                <p className="mt-2 text-xs text-red-400">{errors.amount}</p>
              )}

              {/* Message (optional) — outlined box matching 59952.jpg */}
              <div className="mt-3 rounded-[8px] border border-[#4a4a4a] bg-[#222222] px-3.5 py-3 transition-colors focus-within:border-[#8b5cf6]">
                <input
                  id="message"
                  placeholder="Add a message (optional)"
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={100}
                  aria-label="Message (optional)"
                  className="w-full bg-transparent text-[13.5px] text-white placeholder:text-[#8e8e8e] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Full-bleed Proceed To Pay bar — live reactive state, never stuck */}
          <div className="shrink-0 bg-[#070707] pb-[env(safe-area-inset-bottom)]">
            <button
              type="submit"
              className={`w-full rounded-none py-[16px] text-[15px] font-semibold tracking-wide transition-colors ${
                isReady
                  ? "bg-[#8522ee] text-white hover:bg-[#791dd9] active:bg-[#6d19c4]"
                  : "bg-[#414141] text-[#c7c7c7]"
              }`}
            >
              Proceed To Pay
            </button>
          </div>
        </form>
      </div>
      {showSheet && (
        <PaymentSheet
          name={receiverName}
          upiId={upiId}
          amount={formattedAmount}
          onClose={() => setShowSheet(false)}
          onPay={() =>
            navigate({
              to: "/pin",
              search: {
                name: receiverName,
                upi: upiId,
                amount,
                message: message.trim() || "",
              },
            })
          }
        />
      )}
    </div>
  );
}
