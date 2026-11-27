// Stores completed payments in localStorage so they appear in the History tab.
import type { HistoryTransaction } from "@/components/HistoryScreen";

const STORAGE_KEY = "simple-pay-history";

export function getMonthLabel(d: Date = new Date()): string {
  return d.toLocaleString("en-GB", { month: "long", year: "numeric" });
}

export function getStoredPayments(): HistoryTransaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as HistoryTransaction[]).map((tx) => ({
      ...tx,
      amount: Number(tx.amount) || 0,
    }));
  } catch {
    return [];
  }
}

export function addStoredPayment(input: {
  name: string;
  upi: string;
  amount: string;
  message?: string;
}): void {
  if (typeof window === "undefined") return;
  const amount = Number(input.amount);
  if (!input.name || !Number.isFinite(amount) || amount <= 0) return;

  const now = Date.now();
  const tx: HistoryTransaction = {
    id: `p-${now}`,
    kind: "paid",
    label: "Paid to",
    name: input.name,
    upi: input.upi,
    amount,
    date: "Just now",
    month: getMonthLabel(new Date(now)),
    createdAt: now,
    ...(input.message ? { message: input.message } : {}),
  };

  const existing = getStoredPayments();
  // Deduplicate StrictMode remounts within 5 seconds, while allowing real repeat payments
  const isRecentDuplicate = existing.some((t) => {
    if (t.name !== tx.name || t.upi !== tx.upi || t.amount !== tx.amount) {
      return false;
    }
    const prevTs =
      typeof t.createdAt === "number"
        ? t.createdAt
        : t.id.startsWith("p-")
          ? Number(t.id.slice(2))
          : 0;
    return Number.isFinite(prevTs) && prevTs > 0 && Math.abs(now - prevTs) < 5000;
  });
  if (isRecentDuplicate) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([tx, ...existing]));
  } catch {
    // Storage full or unavailable — ignore.
  }
}
