const STORAGE_KEY = "sp:kotak-balance";
export const DEFAULT_BALANCE = 1100.5;

export function getBalance(): number {
  if (typeof window === "undefined") return DEFAULT_BALANCE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_BALANCE;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_BALANCE;
  } catch {
    return DEFAULT_BALANCE;
  }
}

export function setBalance(value: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Storage full or restricted in private browsing — ignore
  }
}

export function formatBalance(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
