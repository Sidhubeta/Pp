import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  clearAllRateLimits,
  deleteAccessKey,
  generateAccessKey,
  getAdminStatus,
  listAdminDashboard,
  lockAdmin,
  removeKeyUser,
  setKeyPaused,
  unlockAdmin,
  updateBuyKeyBotUrl,
  updateKeyMeta,
  updatePricing,
  updateTelegramLinks,
  type AdminKeyRecord,
  type KeyStatus,
} from "@/lib/admin.functions";
import { copyTextToClipboard } from "@/lib/rememberedKey";

export const Route = createFileRoute("/zimadmin")({
  head: () => ({
    meta: [
      { title: "Admin — PhonePe Spoof For iPhone & Android" },
      { name: "description", content: "Manage access keys." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ZimAdminPage,
});

type PageStatus = "checking" | "locked" | "unlocked" | "unavailable";
type Tab = "keys" | "create" | "settings";
type FilterTab = "all" | KeyStatus;
type CreateMode = "random" | "custom";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) {
    const mins = Math.ceil(Math.abs(diffMs) / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.ceil(mins / 60);
    if (hrs < 24) return `in ${hrs}h`;
    return `in ${Math.ceil(hrs / 24)}d`;
  }
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return "Just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function maskKey(plain: string | null, fallback: string): string {
  if (!plain) return fallback;
  if (plain.length <= 8) return plain;
  return `${plain.slice(0, 8)}••••${plain.slice(-4)}`;
}

const STATUS: Record<KeyStatus, { label: string; color: string }> = {
  active: { label: "Active", color: "#30D158" },
  paused: { label: "Paused", color: "#FF9F0A" },
  unused: { label: "Unused", color: "#0A84FF" },
  expired: { label: "Expired", color: "#FF453A" },
};

const EXPIRY_PRESETS: { label: string; days: number | null }[] = [
  { label: "Lifetime", days: null },
  { label: "1 day", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

/* ------------------------------------------------------------------ */
/* Small iOS building blocks                                           */
/* ------------------------------------------------------------------ */

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="ios-secondary px-4 pb-1.5 pt-6 text-[13px] uppercase tracking-[0.02em]">
      {children}
    </p>
  );
}

function SectionFooter({ children }: { children: ReactNode }) {
  return <p className="ios-secondary px-4 pt-1.5 text-[13px] leading-snug">{children}</p>;
}

function InfoRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="ios-row-inset flex min-h-[44px] items-center justify-between gap-4 px-4 py-2.5">
      <span className="shrink-0 text-[16px]">{label}</span>
      <span
        className={`ios-secondary min-w-0 truncate text-right text-[16px] ${mono ? "font-mono text-[14px]" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function ActionRow({
  label,
  onClick,
  color = "#0A84FF",
  disabled,
  busy,
}: {
  label: string;
  onClick: () => void;
  color?: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className="ios-row-inset ios-row-press flex h-[48px] w-full items-center justify-center gap-2 px-4 text-[17px] transition-colors disabled:opacity-35"
      style={{ color }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {label}
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ios-pressable shrink-0 rounded-full px-3.5 py-1.5 text-[14px] font-medium ${
        active ? "bg-[#0A84FF] text-white" : "ios-fill text-white/85"
      }`}
    >
      {children}
    </button>
  );
}

function Sheet({
  title,
  onClose,
  right,
  children,
}: {
  title: string;
  onClose: () => void;
  right?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      onClick={onClose}
      className="ios-fade fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ios-sheet-up ios-sheet-bg flex max-h-[94dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[14px] sm:rounded-[14px]"
      >
        <div className="relative shrink-0 px-4 pb-2 pt-2">
          <div className="mx-auto mb-2 h-[5px] w-9 rounded-full bg-[#5A5A5E] sm:hidden" />
          <div className="flex h-9 items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="ios-pressable text-[17px] text-[#0A84FF]"
            >
              Close
            </button>
            <h3 className="absolute left-1/2 max-w-[50%] -translate-x-1/2 truncate text-[17px] font-semibold">{title}</h3>
            <div>{right}</div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function ZimAdminPage() {
  const readStatus = useServerFn(getAdminStatus);
  const authorize = useServerFn(unlockAdmin);
  const endAdminSession = useServerFn(lockAdmin);
  const fetchDashboard = useServerFn(listAdminDashboard);
  const createKeyFn = useServerFn(generateAccessKey);
  const togglePauseFn = useServerFn(setKeyPaused);
  const removeUserFn = useServerFn(removeKeyUser);
  const deleteKeyFn = useServerFn(deleteAccessKey);
  const updateMetaFn = useServerFn(updateKeyMeta);
  const saveBotUrlFn = useServerFn(updateBuyKeyBotUrl);
  const saveTelegramLinksFn = useServerFn(updateTelegramLinks);
  const savePricingFn = useServerFn(updatePricing);
  const clearLimitsFn = useServerFn(clearAllRateLimits);

  const [status, setStatus] = useState<PageStatus>("checking");
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const [tab, setTab] = useState<Tab>("keys");
  const [keys, setKeys] = useState<AdminKeyRecord[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    unused: 0,
    paused: 0,
    expired: 0,
    blockedIps: 0,
  });
  const [buyKeyBotUrl, setBuyKeyBotUrl] = useState("https://t.me/ZimbolaKeyBot");
  const [telegramSupportUrl, setTelegramSupportUrl] = useState("https://t.me/ZimbolaSupport");
  const [telegramChannelUrl, setTelegramChannelUrl] = useState("https://t.me/ZimbolaClux");
  const [singlePrice, setSinglePrice] = useState(99);
  const [bulkPrice, setBulkPrice] = useState(59);
  const [loadingList, setLoadingList] = useState(false);

  // New key
  const [createMode, setCreateMode] = useState<CreateMode>("random");
  const [customKeyInput, setCustomKeyInput] = useState("");
  const [keyLabelInput, setKeyLabelInput] = useState("");
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [customDaysInput, setCustomDaysInput] = useState("");
  const [freshKey, setFreshKey] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Keys list
  const [filter, setFilter] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Detail sheet
  const [selectedKey, setSelectedKey] = useState<AdminKeyRecord | null>(null);
  const [revealKey, setRevealKey] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editExpiryChoice, setEditExpiryChoice] = useState<number>(0);

  // Settings
  const [botUrlDraft, setBotUrlDraft] = useState("");
  const [supportUrlDraft, setSupportUrlDraft] = useState("");
  const [channelUrlDraft, setChannelUrlDraft] = useState("");
  const [singlePriceDraft, setSinglePriceDraft] = useState("99");
  const [bulkPriceDraft, setBulkPriceDraft] = useState("59");

  const flashNotice = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => {
      setNotice((prev) => (prev === msg ? "" : prev));
    }, 1800);
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoadingList(true);
    setError("");
    try {
      const data = await fetchDashboard();
      setKeys(data.keys);
      setStats(data.stats);
      setBuyKeyBotUrl(data.buyKeyBotUrl);
      setTelegramSupportUrl(data.telegramSupportUrl);
      setTelegramChannelUrl(data.telegramChannelUrl);
      if (typeof data.singlePrice === "number") setSinglePrice(data.singlePrice);
      if (typeof data.bulkPrice === "number") setBulkPrice(data.bulkPrice);
      setSelectedKey((current) =>
        current ? (data.keys.find((item) => item.id === current.id) ?? null) : null,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't load data. Check DATABASE_URL.",
      );
    } finally {
      setLoadingList(false);
    }
  }, [fetchDashboard]);

  useEffect(() => {
    let active = true;
    readStatus()
      .then(({ unlocked }) => {
        if (!active) return;
        setStatus(unlocked ? "unlocked" : "locked");
        if (unlocked) void loadDashboard();
      })
      .catch(() => {
        if (active) {
          setStatus("unavailable");
          setError("Admin session unavailable. Check ACCESS_SESSION_SECRET.");
        }
      });
    return () => {
      active = false;
    };
  }, [readStatus, loadDashboard]);

  // Reset edit fields only when a different key is opened
  const selectedId = selectedKey?.id ?? null;
  useEffect(() => {
    if (selectedKey) {
      setEditLabel(selectedKey.keyLabel ?? "");
      setEditExpiryChoice(0);
      setRevealKey(false);
      setConfirmDeleteId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (tab === "settings") {
      setBotUrlDraft(buyKeyBotUrl);
      setSupportUrlDraft(telegramSupportUrl);
      setChannelUrlDraft(telegramChannelUrl);
      setSinglePriceDraft(String(singlePrice));
      setBulkPriceDraft(String(bulkPrice));
    }
  }, [tab, buyKeyBotUrl, telegramSupportUrl, telegramChannelUrl, singlePrice, bulkPrice]);

  const filteredKeys = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return keys.filter((item) => {
      if (filter !== "all" && item.status !== filter) return false;
      if (!q) return true;
      return [
        item.keyPlain ?? "",
        item.keyHashShort,
        item.keyLabel ?? "",
        item.userName ?? "",
        item.userIp ?? "",
        item.deviceInfo?.deviceName ?? "",
        item.deviceInfo?.osVersion ?? "",
        item.deviceInfo?.os ?? "",
        item.deviceInfo?.browser ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [keys, filter, searchQuery]);

  async function copyText(id: string, value: string) {
    if (!value) return;
    const ok = await copyTextToClipboard(value);
    if (ok) {
      setCopiedId(id);
      flashNotice("Copied");
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } else {
      setError("Copy blocked by browser.");
    }
  }

  async function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsBusy(true);
    try {
      const result = await authorize({ data: { key: passcode } });
      if (!result.ok) {
        setError(result.error || "Incorrect passcode.");
        return;
      }
      setPasscode("");
      setStatus("unlocked");
      await loadDashboard();
    } catch {
      setError("Could not verify passcode.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLock() {
    setIsBusy(true);
    try {
      await endAdminSession();
      setStatus("locked");
      setKeys([]);
      setFreshKey("");
      setSelectedKey(null);
      setTab("keys");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFreshKey("");
    setIsBusy(true);
    try {
      const parsedCustomDays = customDaysInput.trim() ? Number(customDaysInput.trim()) : null;
      const effectiveDays =
        parsedCustomDays !== null && Number.isFinite(parsedCustomDays) && parsedCustomDays > 0
          ? Math.floor(parsedCustomDays)
          : expiryDays;

      const payload: { customKey?: string; label?: string; expiresInDays?: number | null } = {
        expiresInDays: effectiveDays,
      };
      if (createMode === "custom") payload.customKey = customKeyInput.trim();
      if (keyLabelInput.trim()) payload.label = keyLabelInput.trim();

      const result = await createKeyFn({ data: payload });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFreshKey(result.key);
      setCustomKeyInput("");
      setKeyLabelInput("");
      setCustomDaysInput("");
      flashNotice("Key Created");
      await loadDashboard();
    } catch {
      setError("Couldn't create key.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handlePauseToggle(item: AdminKeyRecord) {
    setActionBusyId(item.id);
    setError("");
    try {
      await togglePauseFn({ data: { id: item.id, paused: !item.isPaused } });
      flashNotice(item.isPaused ? "Resumed" : "Paused");
      await loadDashboard();
    } catch {
      setError("Failed to update status.");
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleRemoveUser(item: AdminKeyRecord) {
    setActionBusyId(item.id);
    setError("");
    try {
      await removeUserFn({ data: { id: item.id } });
      flashNotice("Device Removed");
      await loadDashboard();
    } catch {
      setError("Failed to remove device.");
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleDeleteKey(item: AdminKeyRecord) {
    if (confirmDeleteId !== item.id) {
      setConfirmDeleteId(item.id);
      return;
    }
    setActionBusyId(item.id);
    setError("");
    try {
      await deleteKeyFn({ data: { id: item.id } });
      setConfirmDeleteId(null);
      setSelectedKey(null);
      flashNotice("Deleted");
      await loadDashboard();
    } catch {
      setError("Failed to delete key.");
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleSaveMeta() {
    if (!selectedKey) return;
    setActionBusyId(selectedKey.id);
    setError("");
    try {
      const payload: {
        id: string;
        label: string | null;
        userName: string | null;
        expiresInDays?: number;
      } = {
        id: selectedKey.id,
        label: editLabel.trim() || null,
        userName: null,
      };
      if (editExpiryChoice !== 0) payload.expiresInDays = editExpiryChoice;
      await updateMetaFn({ data: payload });
      setEditExpiryChoice(0);
      flashNotice("Saved");
      await loadDashboard();
    } catch {
      setError("Failed to save changes.");
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleSaveBotUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setError("");
    try {
      const res = await saveBotUrlFn({ data: { url: botUrlDraft } });
      setBuyKeyBotUrl(res.url);
      setBotUrlDraft(res.url);
      flashNotice("Saved");
    } catch {
      setError("Couldn't save bot link.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSaveTelegramLinks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setError("");
    try {
      const res = await saveTelegramLinksFn({
        data: { supportUrl: supportUrlDraft, channelUrl: channelUrlDraft },
      });
      setTelegramSupportUrl(res.supportUrl);
      setTelegramChannelUrl(res.channelUrl);
      setSupportUrlDraft(res.supportUrl);
      setChannelUrlDraft(res.channelUrl);
      flashNotice("Telegram Links Saved");
    } catch {
      setError("Couldn't save Telegram links.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSavePricing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sPrice = Math.round(Number(singlePriceDraft));
    const bPrice = Math.round(Number(bulkPriceDraft));
    if (
      !Number.isFinite(sPrice) ||
      !Number.isFinite(bPrice) ||
      sPrice < 1 ||
      bPrice < 1 ||
      sPrice > 100000 ||
      bPrice > 100000
    ) {
      setError("Enter valid prices between ₹1 and ₹1,00,000.");
      return;
    }
    setIsBusy(true);
    setError("");
    try {
      const res = await savePricingFn({
        data: { singlePrice: sPrice, bulkPrice: bPrice },
      });
      setSinglePrice(res.singlePrice);
      setBulkPrice(res.bulkPrice);
      setSinglePriceDraft(String(res.singlePrice));
      setBulkPriceDraft(String(res.bulkPrice));
      flashNotice("Pricing Saved");
    } catch {
      setError("Couldn't save pricing.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleClearRateLimits() {
    setIsBusy(true);
    try {
      await clearLimitsFn();
      flashNotice("Blocks Cleared");
      await loadDashboard();
    } catch {
      setError("Couldn't clear blocks.");
    } finally {
      setIsBusy(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Locked                                                           */
  /* ---------------------------------------------------------------- */
  if (status !== "unlocked") {
    return (
      <main className="ios-shell flex min-h-dvh w-full flex-col items-center justify-center px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
        <div className="w-full max-w-[380px]">
          <div className="ios-enter flex flex-col items-center text-center">
            <div className="ios-app-icon flex h-[76px] w-[76px] items-center justify-center rounded-[20px]">
              <Lock className="h-8 w-8 text-white" strokeWidth={1.9} />
            </div>
            <h1 className="mt-5 text-[30px] font-bold tracking-[-0.03em]">Admin</h1>
            <p className="ios-secondary mt-1 text-[15px]">Enter passcode to continue</p>
          </div>

          <div className="ios-enter-1 mt-9">
            {status === "checking" ? (
              <div className="ios-secondary flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : status === "unavailable" ? (
              <div className="ios-group px-4 py-4 text-center text-[15px] text-[#FF453A]">
                {error || "Admin environment variables are missing."}
              </div>
            ) : (
              <form onSubmit={handleUnlock}>
                <div className="ios-group flex h-[52px] items-center gap-2 pl-4 pr-3">
                  <input
                    id="admin-passcode"
                    type={showPasscode ? "text" : "password"}
                    autoComplete="current-password"
                    autoFocus
                    value={passcode}
                    onChange={(e) => {
                      setPasscode(e.target.value);
                      if (error) setError("");
                    }}
                    placeholder="Passcode"
                    required
                    className="ios-input min-w-0 flex-1 bg-transparent text-[17px] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode((v) => !v)}
                    aria-label="Toggle passcode visibility"
                    className="ios-pressable ios-secondary p-1"
                  >
                    {showPasscode ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <p
                  role={error ? "alert" : undefined}
                  className="min-h-[40px] px-4 pt-2 text-[13px] text-[#FF453A]"
                >
                  {error}
                </p>
                <button
                  type="submit"
                  disabled={isBusy || !passcode.trim()}
                  className="ios-pressable ios-btn-blue flex h-[52px] w-full items-center justify-center rounded-[14px] text-[17px] font-semibold"
                >
                  {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Unlock"}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Unlocked                                                         */
  /* ---------------------------------------------------------------- */
  const tabTitle: Record<Tab, string> = {
    keys: "Keys",
    create: "New Key",
    settings: "Settings",
  };

  const filterCounts: Record<FilterTab, number> = {
    all: stats.total,
    active: stats.active,
    paused: stats.paused,
    unused: stats.unused,
    expired: stats.expired,
  };

  return (
    <main className="ios-shell min-h-dvh w-full">
      {/* HUD toast */}
      {notice ? (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center">
          <div className="ios-hud-pop ios-hud-blur flex min-w-[130px] flex-col items-center rounded-[18px] px-6 py-5">
            <Check className="h-9 w-9" strokeWidth={2.4} />
            <span className="mt-1.5 text-[15px] font-semibold">{notice}</span>
          </div>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-[680px] px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        {/* Large title */}
        <div className="flex items-end justify-between pb-2 pt-6">
          <h1 className="text-[34px] font-bold tracking-[-0.03em]">{tabTitle[tab]}</h1>
          {tab === "keys" ? (
            <button
              type="button"
              onClick={() => void loadDashboard()}
              disabled={loadingList}
              aria-label="Refresh"
              className="ios-pressable mb-1.5 p-1 text-[#0A84FF]"
            >
              <RefreshCw className={`h-[22px] w-[22px] ${loadingList ? "animate-spin" : ""}`} />
            </button>
          ) : null}
        </div>

        {error ? (
          <div className="ios-enter mt-2 flex items-start gap-3 rounded-[12px] bg-[#FF453A]/15 px-4 py-3 text-[14px] text-[#FF6961]">
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError("")} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {/* ============================ KEYS ============================ */}
        {tab === "keys" ? (
          <div className="ios-enter">
            <div className="ios-search mt-2 flex h-[36px] items-center gap-2 px-2.5">
              <Search className="ios-secondary h-4 w-4 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search key, device, Android, IP"
                className="ios-input min-w-0 flex-1 bg-transparent text-[16px] focus:outline-none"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  className="flex h-4 w-4 items-center justify-center rounded-full bg-[#8E8E93] text-black"
                >
                  <X className="h-2.5 w-2.5" strokeWidth={3} />
                </button>
              ) : null}
            </div>

            <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {(["all", "active", "paused", "unused", "expired"] as FilterTab[]).map((f) => (
                <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
                  <span className="capitalize">{f}</span>
                  <span className="ios-tabular ml-1.5 opacity-60">{filterCounts[f]}</span>
                </Chip>
              ))}
            </div>

            <div className="mt-4">
              {loadingList && keys.length === 0 ? (
                <div className="ios-secondary flex justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : filteredKeys.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                  <KeyRound className="ios-tertiary h-10 w-10" strokeWidth={1.5} />
                  <p className="mt-3 text-[17px] font-semibold">No Keys</p>
                  <p className="ios-secondary mt-1 text-[15px]">
                    {searchQuery || filter !== "all"
                      ? "Nothing matches this filter."
                      : "Create your first key to get started."}
                  </p>
                  {!searchQuery && filter === "all" ? (
                    <button
                      type="button"
                      onClick={() => setTab("create")}
                      className="ios-pressable mt-4 text-[17px] text-[#0A84FF]"
                    >
                      New Key
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="ios-group">
                  {filteredKeys.map((item) => {
                    const st = STATUS[item.status];
                    const displayKey = item.keyPlain ?? item.keyHashShort;
                    const deviceSummary = [
                      item.deviceInfo?.deviceName,
                      item.deviceInfo?.osVersion || item.deviceInfo?.os,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const subtitle =
                      item.keyLabel ||
                      deviceSummary ||
                      (item.claimedAt ? `Used ${formatRelative(item.lastSeenAt ?? item.claimedAt)}` : "Unused key");
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedKey(item)}
                        className="ios-row-avatar ios-row-press relative flex w-full items-center gap-3 py-2.5 pl-4 pr-3 text-left transition-colors"
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                          style={{ background: `${st.color}22`, color: st.color }}
                        >
                          <KeyRound className="h-[18px] w-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[14.5px] font-semibold tracking-[0.02em] text-white">
                            {displayKey}
                          </span>
                          <span className="ios-secondary block truncate text-[13px]">
                            {subtitle}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 text-[14px]" style={{ color: st.color }}>
                          <span className="h-2 w-2 rounded-full" style={{ background: st.color }} />
                          {st.label}
                        </span>
                        <ChevronRight className="ios-tertiary h-4 w-4 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        ) : null}

        {/* ========================== NEW KEY =========================== */}
        {tab === "create" ? (
          <div className="ios-enter">
            {freshKey ? (
              <>
                <div className="ios-group mt-4 px-4 py-6 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#30D158]">
                    <Check className="h-7 w-7 text-white" strokeWidth={2.8} />
                  </span>
                  <p className="ios-secondary mt-3 text-[13px] uppercase tracking-[0.02em]">
                    Key Created
                  </p>
                  <p className="mt-1.5 break-all font-mono text-[22px] font-semibold tracking-[0.04em]">
                    {freshKey}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => void copyText("fresh-key", freshKey)}
                    className="ios-pressable ios-btn-blue flex h-[50px] items-center justify-center gap-2 rounded-[14px] text-[16px] font-semibold"
                  >
                    <Copy className="h-4 w-4" />
                    Copy Key
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void copyText(
                        "fresh-msg",
                        `Your PhonePe Spoof For iPhone & Android Access Key:\n${freshKey}\n\nNote: Works on 1 device only.`,
                      )
                    }
                    className="ios-pressable ios-fill flex h-[50px] items-center justify-center gap-2 rounded-[14px] text-[16px] font-semibold text-[#0A84FF]"
                  >
                    <Copy className="h-4 w-4" />
                    Copy Message
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setFreshKey("")}
                  className="ios-pressable mx-auto mt-5 block text-[17px] text-[#0A84FF]"
                >
                  Create Another
                </button>
              </>
            ) : (
              <form onSubmit={handleCreateKey}>
                <div className="ios-segment mt-3 grid grid-cols-2">
                  {(["random", "custom"] as CreateMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setCreateMode(m)}
                      className={`h-[30px] text-[14px] font-semibold transition-all ${
                        createMode === m ? "ios-segment-on" : "text-white/80"
                      }`}
                    >
                      {m === "random" ? "Random" : "Custom"}
                    </button>
                  ))}
                </div>

                <SectionLabel>Details</SectionLabel>
                <div className="ios-group">
                  {createMode === "custom" ? (
                    <label className="ios-row-inset flex h-[48px] items-center px-4">
                      <span className="w-[72px] shrink-0 text-[16px]">Key</span>
                      <input
                        type="text"
                        value={customKeyInput}
                        onChange={(e) => setCustomKeyInput(e.target.value.toUpperCase())}
                        placeholder="VIP-CLIENT-01"
                        maxLength={64}
                        required
                        className="ios-input min-w-0 flex-1 bg-transparent font-mono text-[15px] tracking-[0.04em] focus:outline-none"
                      />
                    </label>
                  ) : null}
                  <label className="ios-row-inset flex h-[48px] items-center px-4">
                    <span className="w-[72px] shrink-0 text-[16px]">Label</span>
                    <input
                      type="text"
                      value={keyLabelInput}
                      onChange={(e) => setKeyLabelInput(e.target.value)}
                      placeholder="Buyer or @username"
                      maxLength={80}
                      className="ios-input min-w-0 flex-1 bg-transparent text-[16px] focus:outline-none"
                    />
                  </label>
                </div>

                <SectionLabel>Validity</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {EXPIRY_PRESETS.map((p) => (
                    <Chip
                      key={p.label}
                      active={expiryDays === p.days && !customDaysInput}
                      onClick={() => {
                        setExpiryDays(p.days);
                        setCustomDaysInput("");
                      }}
                    >
                      {p.label}
                    </Chip>
                  ))}
                </div>
                <div className="ios-group mt-3">
                  <label className="flex h-[48px] items-center px-4">
                    <span className="w-[72px] shrink-0 text-[16px]">Custom</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={3650}
                      value={customDaysInput}
                      onChange={(e) => setCustomDaysInput(e.target.value)}
                      placeholder="Days"
                      className="ios-input ios-tabular min-w-0 flex-1 bg-transparent text-[16px] focus:outline-none"
                    />
                  </label>
                </div>
                <SectionFooter>Keys lock to the first device that signs in.</SectionFooter>

                <button
                  type="submit"
                  disabled={isBusy || (createMode === "custom" && !customKeyInput.trim())}
                  className="ios-pressable ios-btn-blue mt-6 flex h-[52px] w-full items-center justify-center rounded-[14px] text-[17px] font-semibold"
                >
                  {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Create Key"}
                </button>
              </form>
            )}
          </div>
        ) : null}

        {/* ========================== SETTINGS ========================== */}
        {tab === "settings" ? (
          <div className="ios-enter">
            <form onSubmit={handleSavePricing}>
              <SectionLabel>Key Pricing (Website &amp; Bot)</SectionLabel>
              <div className="ios-group">
                <label className="ios-row-inset flex h-[48px] items-center gap-2 px-4">
                  <span className="w-[96px] shrink-0 text-[16px]">Single Key</span>
                  <span className="ios-secondary text-[16px]">₹</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100000}
                    value={singlePriceDraft}
                    onChange={(e) => setSinglePriceDraft(e.target.value)}
                    placeholder="99"
                    required
                    className="ios-input ios-tabular min-w-0 flex-1 bg-transparent text-[16px] focus:outline-none"
                  />
                </label>
                <label className="ios-row-inset flex h-[48px] items-center gap-2 px-4">
                  <span className="w-[96px] shrink-0 text-[16px]">Bulk / Key</span>
                  <span className="ios-secondary text-[16px]">₹</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100000}
                    value={bulkPriceDraft}
                    onChange={(e) => setBulkPriceDraft(e.target.value)}
                    placeholder="59"
                    required
                    className="ios-input ios-tabular min-w-0 flex-1 bg-transparent text-[16px] focus:outline-none"
                  />
                </label>
                {Number(singlePriceDraft) !== singlePrice || Number(bulkPriceDraft) !== bulkPrice ? (
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="ios-row-inset ios-row-press flex h-[48px] w-full items-center justify-center gap-2 px-4 text-[17px] font-semibold text-[#0A84FF] disabled:opacity-40"
                  >
                    {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save Pricing
                  </button>
                ) : null}
              </div>
              <SectionFooter>
                Updates Single &amp; Bulk prices instantly on both the Website and Telegram Bot.
              </SectionFooter>
            </form>

            <form onSubmit={handleSaveBotUrl}>
              <SectionLabel>Telegram Bot</SectionLabel>
              <div className="ios-group">
                <label className="flex h-[48px] items-center gap-2 pl-4 pr-3">
                  <input
                    type="text"
                    value={botUrlDraft}
                    onChange={(e) => setBotUrlDraft(e.target.value)}
                    placeholder="https://t.me/YourBot or @YourBot"
                    required
                    className="ios-input min-w-0 flex-1 bg-transparent text-[16px] focus:outline-none"
                  />
                  {botUrlDraft.trim() && botUrlDraft !== buyKeyBotUrl ? (
                    <button
                      type="submit"
                      disabled={isBusy}
                      className="ios-pressable shrink-0 text-[16px] font-semibold text-[#0A84FF]"
                    >
                      Save
                    </button>
                  ) : null}
                </label>
              </div>
              <SectionFooter>Used by Buy Keys &amp; Bulk buttons on the sign-in page.</SectionFooter>
            </form>

            <form onSubmit={handleSaveTelegramLinks}>
              <SectionLabel>Telegram Support &amp; Channel</SectionLabel>
              <div className="ios-group">
                <label className="ios-row-inset flex h-[48px] items-center gap-2 px-4">
                  <span className="w-[74px] shrink-0 text-[16px]">Support</span>
                  <input
                    type="text"
                    value={supportUrlDraft}
                    onChange={(e) => setSupportUrlDraft(e.target.value)}
                    placeholder="https://t.me/YourSupport or @username"
                    required
                    className="ios-input min-w-0 flex-1 bg-transparent text-[15px] focus:outline-none"
                  />
                </label>
                <label className="ios-row-inset flex h-[48px] items-center gap-2 px-4">
                  <span className="w-[74px] shrink-0 text-[16px]">Channel</span>
                  <input
                    type="text"
                    value={channelUrlDraft}
                    onChange={(e) => setChannelUrlDraft(e.target.value)}
                    placeholder="https://t.me/YourChannel or @channel"
                    required
                    className="ios-input min-w-0 flex-1 bg-transparent text-[15px] focus:outline-none"
                  />
                </label>
                {(supportUrlDraft.trim() && supportUrlDraft !== telegramSupportUrl) ||
                (channelUrlDraft.trim() && channelUrlDraft !== telegramChannelUrl) ? (
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="ios-row-inset ios-row-press flex h-[48px] w-full items-center justify-center gap-2 px-4 text-[17px] font-semibold text-[#0A84FF] disabled:opacity-40"
                  >
                    {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save Telegram Links
                  </button>
                ) : null}
              </div>
              <SectionFooter>Shown when users tap the Telegram button on the sign-in page.</SectionFooter>
            </form>

            <SectionLabel>Security</SectionLabel>
            <div className="ios-group">
              <InfoRow label="Blocked IPs" value={stats.blockedIps} />
              <ActionRow
                label="Clear All Blocks"
                onClick={() => void handleClearRateLimits()}
                disabled={stats.blockedIps === 0}
                busy={isBusy}
              />
            </div>
            <SectionFooter>IPs get blocked after too many wrong keys.</SectionFooter>

            <div className="ios-group mt-8">
              <ActionRow label="Lock Admin" color="#FF453A" onClick={() => void handleLock()} busy={isBusy} />
            </div>
          </div>
        ) : null}
      </div>

      {/* Tab bar */}
      <nav className="ios-bar fixed inset-x-0 bottom-0 z-40 shadow-[0_-0.5px_0_rgba(84,84,88,0.65)]">
        <div className="mx-auto grid h-[54px] max-w-[680px] grid-cols-3 pb-0">
          {(
            [
              { id: "keys", label: "Keys", icon: KeyRound },
              { id: "create", label: "New Key", icon: Plus },
              { id: "settings", label: "Settings", icon: Settings },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  window.scrollTo({ top: 0 });
                }}
                className={`flex flex-col items-center justify-center gap-0.5 pt-1 text-[10px] font-medium ${
                  on ? "text-[#0A84FF]" : "text-[#8E8E93]"
                }`}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={on ? 2.3 : 1.9} />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>

      {/* ======================== KEY DETAIL SHEET ======================== */}
      {selectedKey ? (
        <Sheet
          title="Key Details"
          onClose={() => setSelectedKey(null)}
          right={
            <button
              type="button"
              disabled={actionBusyId === selectedKey.id}
              onClick={() => void handleSaveMeta()}
              className="ios-pressable text-[17px] font-semibold text-[#0A84FF] disabled:opacity-40"
            >
              Save
            </button>
          }
        >
          {/* Key */}
          <div className="ios-group mt-3 px-4 py-4 text-center">
            <span
              className="inline-flex items-center gap-1.5 text-[13px] font-medium"
              style={{ color: STATUS[selectedKey.status].color }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS[selectedKey.status].color }} />
              {STATUS[selectedKey.status].label}
            </span>
            <p className="mt-2 break-all font-mono text-[19px] font-semibold tracking-[0.04em]">
              {revealKey
                ? (selectedKey.keyPlain ?? selectedKey.keyHashShort)
                : maskKey(selectedKey.keyPlain, selectedKey.keyHashShort)}
            </p>
            {selectedKey.keyPlain ? (
              <div className="mt-3 flex justify-center gap-6 text-[15px] text-[#0A84FF]">
                <button type="button" className="ios-pressable" onClick={() => setRevealKey((r) => !r)}>
                  {revealKey ? "Hide" : "Show"}
                </button>
                <button
                  type="button"
                  className="ios-pressable"
                  onClick={() => void copyText(`sheet-${selectedKey.id}`, selectedKey.keyPlain ?? "")}
                >
                  {copiedId === `sheet-${selectedKey.id}` ? "Copied" : "Copy"}
                </button>
              </div>
            ) : null}
          </div>

          {/* Editable */}
          <SectionLabel>Details</SectionLabel>
          <div className="ios-group">
            <label className="ios-row-inset flex h-[48px] items-center px-4">
              <span className="w-[64px] shrink-0 text-[16px]">Note</span>
              <input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                placeholder="Optional note"
                className="ios-input min-w-0 flex-1 bg-transparent text-[16px] focus:outline-none"
              />
            </label>
          </div>

          <SectionLabel>Change Expiry</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Keep", val: 0 },
              { label: "+7 days", val: 7 },
              { label: "+30 days", val: 30 },
              { label: "Lifetime", val: -1 },
            ].map((opt) => (
              <Chip key={opt.label} active={editExpiryChoice === opt.val} onClick={() => setEditExpiryChoice(opt.val)}>
                {opt.label}
              </Chip>
            ))}
          </div>

          {/* Info */}
          <SectionLabel>Info</SectionLabel>
          <div className="ios-group">
            <InfoRow
              label="Expires"
              value={selectedKey.expiresAt ? formatDateTime(selectedKey.expiresAt) : "Never"}
            />
            <InfoRow label="First Used" value={selectedKey.claimedAt ? formatDateTime(selectedKey.claimedAt) : "Not yet"} />
            <InfoRow label="Last Seen" value={formatRelative(selectedKey.lastSeenAt)} />
            <InfoRow label="Logins" value={selectedKey.loginCount} />
            <InfoRow
              label="Device Name"
              value={selectedKey.deviceInfo?.deviceName || "—"}
            />
            <InfoRow
              label={
                selectedKey.deviceInfo?.os === "Android" ||
                selectedKey.deviceInfo?.osVersion?.startsWith("Android")
                  ? "Android Version"
                  : "OS Version"
              }
              value={selectedKey.deviceInfo?.osVersion || selectedKey.deviceInfo?.os || "—"}
            />
            <InfoRow
              label="Browser"
              value={selectedKey.deviceInfo?.browser || "—"}
            />
            <InfoRow label="IP" value={selectedKey.userIp ?? "—"} mono />
            <InfoRow label="Created" value={formatDateTime(selectedKey.createdAt)} />
          </div>

          {/* Actions */}
          <div className="ios-group mt-8">
            <ActionRow
              label={selectedKey.isPaused ? "Resume Access" : "Pause Access"}
              color={selectedKey.isPaused ? "#30D158" : "#FF9F0A"}
              onClick={() => void handlePauseToggle(selectedKey)}
              busy={actionBusyId === selectedKey.id}
            />
            <ActionRow
              label="Remove Device"
              onClick={() => void handleRemoveUser(selectedKey)}
              disabled={!selectedKey.claimedAt}
              busy={actionBusyId === selectedKey.id}
            />
          </div>
          <SectionFooter>Removing the device lets this key sign in on a new one.</SectionFooter>

          <div className="ios-group mt-6">
            <ActionRow
              label={confirmDeleteId === selectedKey.id ? "Tap Again to Delete" : "Delete Key"}
              color="#FF453A"
              onClick={() => void handleDeleteKey(selectedKey)}
              busy={actionBusyId === selectedKey.id}
            />
          </div>
          <div className="h-4" />
        </Sheet>
      ) : null}
    </main>
  );
}
