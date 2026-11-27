import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import fingerprintShield from "@/assets/originals/fingerprint_shield.png";
import npciUpiLogoDark from "@/assets/originals/ic_upi_npci_logo_dark.png";
import kotakBankLogo from "@/assets/originals/kotak_bank_logo.png";
import { copyTextToClipboard } from "@/lib/rememberedKey";

const detailsSearchSchema = z.object({
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
  from: z.string().max(20).catch(""),
});

export const Route = createFileRoute("/success-details")({
  validateSearch: (search) => detailsSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Transaction Successful — Details" },
      {
        name: "description",
        content: "Full transaction details: transfer ID, UTR, debited account and more.",
      },
      { property: "og:title", content: "Transaction Successful — Details" },
      {
        property: "og:description",
        content: "Full transaction details: transfer ID, UTR, debited account and more.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransactionDetailsPage,
});

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return (parts[0] ?? "").slice(0, 2).toUpperCase();
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase();
}

function formatDetailTime(d: Date) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-GB", { month: "short" });
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, "0")}:${minutes} ${ampm} on ${day} ${month} ${year}`;
}

/* Official PhonePe APK vector: ic_details_transfer_details.xml */
function TransferDetailsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[20px] w-[20px] shrink-0 fill-[#dfdfdf]" aria-hidden="true">
      <path d="M19.5,4.5v15H4.5V4.5h15m0-1.5H4.5A1.5,1.5,0,0,0,3,4.5v15A1.5,1.5,0,0,0,4.5,21h15A1.5,1.5,0,0,0,21,19.5V4.5A1.5,1.5,0,0,0,19.5,3Z" />
      <path d="M9,7.25H7.55a0.83,0.83,0,0,0-0.83,0.83v0.67H8.19A0.83,0.83,0,0,0,9,7.92V7.25Z" />
      <path d="M17.27,7.25H12.2a0.83,0.83,0,0,0-0.82,0.83v0.67h5.06a0.83,0.83,0,0,0,0.83-0.83V7.25Z" />
      <path d="M9,11.25H7.55a0.83,0.83,0,0,0-0.83,0.83v0.67H8.19A0.83,0.83,0,0,0,9,11.92v-0.67Z" />
      <path d="M17.27,11.25H12.2a0.83,0.83,0,0,0-0.82,0.83v0.67h5.06a0.83,0.83,0,0,0,0.83-0.83v-0.67Z" />
      <path d="M9,15.25H7.55a0.83,0.83,0,0,0-0.83,0.83v0.67H8.19A0.83,0.83,0,0,0,9,15.92v-0.67Z" />
      <path d="M17.27,15.25H12.2a0.83,0.83,0,0,0-0.82,0.83v0.67h5.06a0.83,0.83,0,0,0,0.83-0.83v-0.67Z" />
    </svg>
  );
}

/* Official PhonePe APK vector: ic_details_copy.xml */
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] fill-[#8264ac]" aria-hidden="true">
      <path d="M3.68,15H3V4.28A2.32,2.32,0,0,1,5.32,2H16v0.67a0.83,0.83,0,0,1-0.83,0.83H5.32a0.82,0.82,0,0,0-0.81,0.81v9.89A0.83,0.83,0,0,1,3.68,15Z" />
      <path d="M18.14,22.07H8.32A2.32,2.32,0,0,1,6,19.76V7.28A2.32,2.32,0,0,1,8.32,5H14a0.75,0.75,0,0,1,0.55,0.23l5.69,6.05a0.74,0.74,0,0,1,0.2,0.51v8a2.32,2.32,0,0,1-2.31,2.31ZM8.32,6.47a0.82,0.82,0,0,0-0.81,0.81V19.76a0.82,0.82,0,0,0,0.81,0.81h9.82a0.82,0.82,0,0,0,0.81-0.81v-7.7L13.69,6.47Z" />
      <path d="M20.09,12.61H14.51a1.73,1.73,0,0,1-1.72-1.73V5.72h1.5v5.16a0.23,0.23,0,0,0,0.22,0.23h5.58Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-[19px] w-[19px] text-emerald-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.4}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

/* Official PhonePe APK vector: ic_details_contact_support.xml */
function ContactSupportIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px] shrink-0 fill-[#dfdfdf]" aria-hidden="true">
      <path d="M12,21.05a9,9,0,0,1-4.42-1.16,1.31,1.31,0,0,0-1-0.13l-2.22,0.82a0.74,0.74,0,0,1-0.79-0.18,0.73,0.73,0,0,1-0.18-0.78l0.84-2.31a1.27,1.27,0,0,0-0.15-0.89A9,9,0,1,1,12,21.05ZM6.93,18.22a2.8,2.8,0,0,1,1.39,0.36,7.58,7.58,0,1,0-2.9-2.9,2.87,2.87,0,0,1,0.28,2.07l-0.32,0.87,0.79-0.29A3,3,0,0,1,6.93,18.22Z" />
      <path d="M12.45,14.64h-0.67a0.83,0.83,0,0,1-0.83-0.83V12.48a0.5,0.5,0,0,1,0.5-0.5h0.25a2.8,2.8,0,0,0,0.89-0.15,1.81,1.81,0,0,0,0.59-0.4,1.87,1.87,0,0,0,0.4-0.59,1.92,1.92,0,0,0,0.14-0.72,1.82,1.82,0,0,0-0.15-0.72,1.86,1.86,0,0,0-3-0.59l-0.09,0.09a0.82,0.82,0,0,1-1,0.23l-0.74-0.31A3.35,3.35,0,0,1,13.17,7a3.51,3.51,0,0,1,1.07,0.71A3.36,3.36,0,0,1,15,8.82a3.41,3.41,0,0,1,0,2.61,3.21,3.21,0,0,1-0.72,1.06,3.36,3.36,0,0,1-1.07,0.72,3,3,0,0,1-0.72,0.2Z" />
      <circle cx="11.73" cy="16.48" r="0.82" />
    </svg>
  );
}

/* Dark-mode YES BANK footer mark matching 60708_2.jpg */
function YesBankMark() {
  return (
    <span className="inline-flex items-center gap-[2.5px] select-none">
      <svg viewBox="0 0 18 16" className="h-[12px] w-[14px]" aria-hidden="true">
        <path
          d="M1.5 8.5 L6.2 13.4 L16.2 2.2 L13.4 2.2 L6.2 10.2 L3.9 7.8 Z"
          fill="#c4334d"
        />
        <path
          d="M11.6 8.2 L14.4 5.2 L16.5 5.2 L13.5 8.5 Z"
          fill="#4a63a8"
        />
      </svg>
      <span className="text-[9.5px] font-extrabold tracking-[0.02em] text-[#4c66ab]">
        YES BANK
      </span>
    </span>
  );
}

function TransactionDetailsPage() {
  const navigate = useNavigate();
  const { name, upi, amount, message, from } = Route.useSearch();
  const cameFromHistory = from === "history";
  const [copied, setCopied] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);

  const [transactionId, setTransactionId] = useState("T0000000000000000000000");
  const [utr, setUtr] = useState("000000000000");
  const [timestamp, setTimestamp] = useState("");

  useEffect(() => {
    setTransactionId(
      "T" + Array.from({ length: 22 }, () => Math.floor(Math.random() * 10)).join(""),
    );
    setUtr(Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join(""));
    setTimestamp(formatDetailTime(new Date()));
  }, []);

  const copy = (key: string, value: string) => {
    void copyTextToClipboard(value).then((ok) => {
      if (!ok) return;
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    });
  };

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

  const actions: { label: string; icon: ReactNode; onClick?: () => void }[] = [
    {
      label: "Send Again",
      onClick: () =>
        navigate({
          to: "/pay",
          search: { ...(name ? { pn: name } : {}), ...(upi ? { pa: upi } : {}) },
        }),
      icon: (
        <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] fill-[#a683df]" aria-hidden="true">
          <path d="M19.52,15.16h-0.67a0.83,0.83,0,0,1-0.83-0.83V6H9.71a0.83,0.83,0,0,1-0.83-0.83V4.51H19.52Z" />
          <path d="M5.76,19.27l-0.48-0.47a0.85,0.85,0,0,1,0-1.18l12.8-12.8,1.06,1.06Z" />
        </svg>
      ),
    },
    {
      label: "View History",
      icon: (
        <svg viewBox="0 0 24 24" className="h-[20px] w-[20px] fill-[#a683df]" aria-hidden="true">
          <path d="M12,3.5A8.5,8.5,0,1,1,3.5,12,8.51,8.51,0,0,1,12,3.5M12,2A10,10,0,1,0,22,12,10,10,0,0,0,12,2Z" />
          <path d="M15.52,15.65l-4.27-3.32V7.52h0.67a0.83,0.83,0,0,1,0.83,0.83V11.6L17.1,15l-0.41,0.53A0.83,0.83,0,0,1,15.52,15.65Z" />
        </svg>
      ),
      onClick: () =>
        navigate({
          to: "/",
          search: { tab: "history" },
          replace: true,
        }),
    },
    {
      label: "Split Expense",
      icon: (
        <svg viewBox="0 0 24 24" className="h-[20px] w-[20px] fill-[#a683df]" aria-hidden="true">
          <path d="M7.9,5.45l-1.28,-1.3 -1.28,1.3c-0.37,0.38 -0.98,0.38 -1.36,0.01l-0.39,-0.38 3.03,-3.08 3.03,3.08 -0.39,0.38c-0.38,0.37 -0.99,0.37 -1.36,-0.01Z" />
          <path d="M18.67,5.45l-1.28,-1.3 -1.28,1.3c-0.37,0.38 -0.98,0.38 -1.36,0.01l-0.39,-0.38 3.03,-3.08 3.03,3.08 -0.39,0.38c-0.38,0.37 -0.99,0.37 -1.36,-0.01Z" />
          <path d="M9.37,12.95c-0.31,-0.18 -0.6,-0.38 -0.88,-0.61 -0.27,-0.22 -0.53,-0.46 -0.77,-0.72 -0.23,-0.25 -0.45,-0.53 -0.65,-0.82 -0.2,-0.3 -0.38,-0.6 -0.53,-0.92 -0.15,-0.32 -0.29,-0.65 -0.39,-0.98 -0.1,-0.33 -0.18,-0.68 -0.24,-1.04 -0.05,-0.36 -0.08,-0.72 -0.08,-1.08V3.55h1.6v3.23c0,0.28 0.02,0.56 0.06,0.84 0.04,0.28 0.1,0.55 0.19,0.8 0.08,0.26 0.18,0.52 0.3,0.76 0.12,0.25 0.26,0.48 0.41,0.71 0.15,0.22 0.32,0.44 0.51,0.64 0.19,0.2 0.39,0.39 0.6,0.56l0.07,0.05c0.34,0.26 0.43,0.73 0.21,1.1l-0.41,0.7Z" />
          <path d="M12.75,21.97h-0.7c-0.44,0 -0.8,-0.36 -0.8,-0.8v-6.37c0,-0.67 0.2,-1.33 0.58,-1.88 0.38,-0.56 0.91,-0.98 1.54,-1.23 0.97,-0.38 1.79,-1.04 2.38,-1.91 0.59,-0.86 0.9,-1.87 0.9,-2.91V3.89h1.5v2.85c0,0.89 -0.13,1.79 -0.47,2.61 -0.71,1.75 -2.06,3.07 -3.75,3.74 -0.34,0.14 -0.64,0.37 -0.85,0.68 -0.21,0.31 -0.32,0.67 -0.32,1.04v7.17Z" />
        </svg>
      ),
    },
    {
      label: "Share Receipt",
      icon: (
        <svg viewBox="0 0 24 24" className="h-[20px] w-[20px] fill-[#a683df]" aria-hidden="true">
          <path d="M17,6.5C17.828,6.5 18.5,5.828 18.5,5C18.5,4.172 17.828,3.5 17,3.5C16.171,3.5 15.5,4.172 15.5,5C15.5,5.828 16.171,6.5 17,6.5ZM17,8C18.657,8 20,6.657 20,5C20,3.343 18.657,2 17,2C15.343,2 14,3.343 14,5C14,6.657 15.343,8 17,8Z" />
          <path d="M17,20.499C17.828,20.499 18.5,19.828 18.5,18.999C18.5,18.171 17.828,17.499 17,17.499C16.171,17.499 15.5,18.171 15.5,18.999C15.5,19.828 16.171,20.499 17,20.499ZM17,21.999C18.657,21.999 20,20.656 20,18.999C20,17.342 18.657,15.999 17,15.999C15.343,15.999 14,17.342 14,18.999C14,20.656 15.343,21.999 17,21.999Z" />
          <path d="M7.541,14.041C8.646,14.041 9.541,13.145 9.541,12.041C9.541,10.936 8.646,10.041 7.541,10.041C6.436,10.041 5.541,10.936 5.541,12.041C5.541,13.145 6.436,14.041 7.541,14.041ZM7.541,15.541C9.474,15.541 11.041,13.974 11.041,12.041C11.041,10.108 9.474,8.541 7.541,8.541C5.608,8.541 4.041,10.108 4.041,12.041C4.041,13.974 5.608,15.541 7.541,15.541Z" />
          <path d="M15.554,6.082C15.813,6.405 15.761,6.877 15.437,7.136L10.437,11.136C10.114,11.395 9.642,11.342 9.383,11.019C9.124,10.696 9.177,10.224 9.5,9.965L14.5,5.965C14.824,5.706 15.296,5.758 15.554,6.082Z" />
          <path d="M15.554,17.939C15.813,17.615 15.761,17.143 15.437,16.885L10.437,12.885C10.114,12.626 9.642,12.678 9.383,13.002C9.124,13.325 9.177,13.797 9.5,14.056L14.5,18.056C14.824,18.315 15.296,18.262 15.554,17.939Z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex min-h-dvh justify-center bg-[#0d0d0d]">
      <div className="@container flex min-h-dvh w-full max-w-[430px] flex-col bg-[#0d0d0d]">
        {/* Green Header — exact #0b7a2d, back arrow at 4.9cqw, title column at 17.6cqw */}
        <header className="flex shrink-0 items-center bg-[#0b7a2d] py-[clamp(12px,1.7dvh,15px)] pl-[4.2cqw] pr-[4cqw]">
          <button
            type="button"
            aria-label="Back"
            onClick={() =>
              cameFromHistory
                ? navigate({ to: "/", search: { tab: "history" }, replace: true })
                : navigate({
                    to: "/success",
                    search: { name, upi, amount, message },
                  })
            }
            className="flex h-8 w-8 shrink-0 items-center justify-start text-white transition-opacity active:opacity-70"
          >
            <svg
              className="h-[21px] w-[21px]"
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
          <div className="ml-[5.4cqw] min-w-0 flex-1">
            <h1 className="text-[clamp(15px,3.8cqw,16.5px)] font-bold leading-[1.25] tracking-[-0.01em] text-[#f2fff6]">
              Transaction Successful
            </h1>
            <p className="mt-[2px] text-[clamp(11.5px,3.05cqw,13px)] font-normal leading-[1.25] text-[#c5f4d2]">
              {timestamp}
            </p>
          </div>
        </header>

        {/* Card 1: Paid to + Transfer Details + 4 Actions — exact 2cqw outer margin, 12px radius, #191919 surface */}
        <section className="mx-[2cqw] mt-[2.2cqw] rounded-[12px] bg-[#191919] px-[4cqw] pb-[4.6cqw] pt-[3.6cqw]">
          <p className="text-[clamp(13.5px,3.45cqw,15px)] font-bold leading-tight text-[#f5f5f5]">
            Paid to
          </p>

          {/* Receiver Row — fixed 9.8cqw left slot + 3.8cqw gap so text spine lands at 19.6cqw */}
          <div className="mt-[4cqw] flex items-start gap-[3.8cqw]">
            <div className="flex h-[clamp(38px,9.8cqw,44px)] w-[clamp(38px,9.8cqw,44px)] shrink-0 items-center justify-center rounded-full bg-[#2ab5f3]">
              <span className="text-[clamp(12.5px,3.2cqw,14px)] font-semibold tracking-wide text-white">
                {getInitials(name) || "PP"}
              </span>
            </div>
            <div className="min-w-0 flex-1 pt-[1px]">
              <p className="break-words text-[clamp(14.5px,3.75cqw,16.5px)] font-normal leading-[1.28] text-[#eaeaea]">
                {name || "Receiver"}
              </p>
              <p className="mt-[3px] truncate text-[clamp(12.5px,3.25cqw,14.5px)] font-normal leading-[1.25] text-[#b8b8b8]">
                {upi || "—"}
              </p>
            </div>
            <p className="shrink-0 pt-[1px] text-[clamp(14.5px,3.75cqw,16.5px)] font-bold leading-[1.28] text-[#f3f3f3]">
              ₹{formattedAmount}
            </p>
          </div>

          <div className="mt-[4.2cqw] border-t border-[#2a2a2a]" />

          {/* Transfer Details Toggle Header */}
          <button
            type="button"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((o) => !o)}
            className="flex w-full items-center gap-[4.7cqw] py-[4.2cqw] text-left"
          >
            <TransferDetailsIcon />
            <span className="text-[clamp(14px,3.6cqw,15.5px)] font-normal leading-tight text-[#e3e3e3]">
              Transfer Details
            </span>
            <svg
              className={`ml-auto h-[17px] w-[17px] text-[#dcdcdc] transition-transform duration-200 ${
                detailsOpen ? "" : "rotate-180"
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>

          {/* Collapsible Transfer Details Drawer */}
          <div
            className={`grid transition-[grid-template-rows] duration-300 ease-out ${
              detailsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="overflow-hidden">
              <div className="min-h-0">
                {/* PhonePe Transaction ID */}
                <p className="text-[clamp(11.5px,2.85cqw,12.5px)] font-normal leading-tight text-[#adadad]">
                  PhonePe Transaction ID
                </p>
                <div className="mt-[1.4cqw] flex items-center justify-between gap-3">
                  <p className="break-all text-[clamp(12.5px,3.2cqw,14px)] font-normal leading-tight tracking-[0.01em] text-[#e2e2e2]">
                    {transactionId}
                  </p>
                  <button
                    type="button"
                    aria-label="Copy transaction ID"
                    onClick={() => copy("txn", transactionId)}
                    className="shrink-0 p-1 active:opacity-70"
                  >
                    {copied === "txn" ? <CheckIcon /> : <CopyIcon />}
                  </button>
                </div>

                {/* Debited from — exact same 9.8cqw left slot + 3.8cqw gap so XXXXXXXX9329 & UTR align with receiver name */}
                <p className="mt-[4cqw] text-[clamp(11.5px,2.85cqw,12.5px)] font-normal leading-tight text-[#adadad]">
                  Debited from
                </p>
                <div className="mt-[2.6cqw] flex items-start gap-[3.8cqw]">
                  <div className="flex w-[clamp(38px,9.8cqw,44px)] shrink-0 items-start justify-start">
                    <div className="flex h-[clamp(30px,7.6cqw,34px)] w-[clamp(30px,7.6cqw,34px)] items-center justify-center rounded-full bg-white p-[3px]">
                      <img
                        src={kotakBankLogo}
                        alt="Kotak Mahindra Bank"
                        className="h-full w-full select-none object-contain"
                        draggable={false}
                      />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3 pt-[4px]">
                      <p className="text-[clamp(13.5px,3.45cqw,15px)] font-normal leading-tight tracking-[0.02em] text-[#e4e4e4]">
                        XXXXXXXX9329
                      </p>
                      <p className="shrink-0 text-[clamp(13.5px,3.5cqw,15px)] font-normal leading-tight text-[#e2e2e2]">
                        ₹{formattedAmount}
                      </p>
                    </div>
                    <div className="mt-[4.2cqw] flex items-center justify-between gap-3">
                      <p className="truncate text-[clamp(12.5px,3.2cqw,14px)] font-normal leading-tight text-[#b4b4b4]">
                        UTR: {utr}
                      </p>
                      <button
                        type="button"
                        aria-label="Copy UTR"
                        onClick={() => copy("utr", utr)}
                        className="shrink-0 p-1 active:opacity-70"
                      >
                        {copied === "utr" ? <CheckIcon /> : <CopyIcon />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-[4.8cqw] border-t border-[#2a2a2a]" />

          {/* 4 Action Buttons Row — exact 11.5cqw #391b59 circles & official APK icons */}
          <div className="mt-[4.8cqw] grid grid-cols-4 gap-1">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className="flex flex-col items-center gap-[2.5cqw] active:opacity-75"
              >
                <span className="flex h-[clamp(44px,11.5cqw,52px)] w-[clamp(44px,11.5cqw,52px)] items-center justify-center rounded-full bg-[#391b59]">
                  {action.icon}
                </span>
                <span className="whitespace-nowrap text-center text-[clamp(10.5px,2.75cqw,12px)] font-normal leading-tight text-[#dcdcdc]">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Card 2: Contact PhonePe Support — text aligned on exact same 19.6cqw spine */}
        <button
          type="button"
          className="mx-[2cqw] mt-[2cqw] flex items-center gap-[3.8cqw] rounded-[12px] bg-[#191919] px-[4cqw] py-[4.2cqw] text-left transition-colors active:bg-[#222222]"
        >
          <span className="flex w-[clamp(38px,9.8cqw,44px)] shrink-0 items-center justify-center">
            <ContactSupportIcon />
          </span>
          <span className="text-[clamp(14px,3.6cqw,15.5px)] font-normal leading-tight text-[#e0e0e0]">
            Contact PhonePe Support
          </span>
          <svg
            className="ml-auto h-[17px] w-[17px] text-[#dcdcdc]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Card 3: Pay securely with fingerprint — pure #070707 card & seamless HD fingerprint_shield.png */}
        <section className="mx-[2cqw] mt-[2cqw] flex items-center justify-between gap-3 rounded-[12px] bg-[#070707] px-[6cqw] py-[5.4cqw]">
          <div className="min-w-0 flex-1">
            <p className="text-[clamp(13.5px,3.5cqw,15.5px)] font-bold leading-snug text-[#f2f2f2]">
              Pay securely with fingerprint
            </p>
            <p className="mt-[1.6cqw] text-[clamp(11.5px,2.95cqw,13px)] font-normal leading-[1.38] text-[#a6a6a6]">
              Enjoy seamless and safer payments up to ₹10,000.
            </p>
            <button
              type="button"
              className="mt-[4.2cqw] inline-flex h-[clamp(30px,7.4cqw,34px)] items-center justify-center rounded-[7px] bg-[#8523ec] px-[3.8cqw] text-[clamp(11.5px,2.95cqw,13px)] font-semibold text-white transition-colors hover:bg-[#771cd8] active:bg-[#6a16c4]"
            >
              Activate Now
            </button>
          </div>
          <img
            src={fingerprintShield}
            alt="Fingerprint security shield"
            className="h-[clamp(72px,18.2cqw,84px)] w-auto shrink-0 select-none object-contain"
            draggable={false}
          />
        </section>

        {/* Powered by UPI ✓ YES BANK Footer — exact compact placement from 60708_2.jpg */}
        <footer className="mt-[4.4cqw] flex shrink-0 flex-col items-center pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <p className="text-[clamp(11.5px,2.95cqw,13px)] font-normal leading-tight text-[#acacac]">
            Powered by
          </p>
          <div className="mt-[1.4cqw] flex items-center justify-center gap-[5px]">
            <img
              src={npciUpiLogoDark}
              alt="NPCI UPI"
              className="-my-1.5 h-[clamp(22px,5.6cqw,26px)] w-auto select-none object-contain opacity-90"
              draggable={false}
            />
            <YesBankMark />
          </div>
        </footer>
      </div>
    </div>
  );
}
