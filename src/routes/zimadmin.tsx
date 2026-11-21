import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  Bot,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Smartphone,
  Trash2,
  UserMinus,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
  type AdminAuditItem,
  type AdminKeyRecord,
  type KeyStatus,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/zimadmin")({
  head: () => ({
    meta: [
      { title: "Admin — Zimbola Clux" },
      { name: "description", content: "Manage access keys, users, and security logs." },
      { property: "og:title", content: "Admin — Zimbola Clux" },
      { property: "og:description", content: "Manage access keys, users, and security logs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ZimAdminPage,
});

type PageStatus = "checking" | "locked" | "unlocked" | "unavailable";
type MainSection = "users" | "create" | "security";
type FilterTab = "all" | KeyStatus;
type CreateMode = "random" | "custom";

function formatDateTime(iso: string | null): string {
  if (!iso) return "Not yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
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
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatUsageDuration(claimedAt: string | null): string {
  if (!claimedAt) return "Unused";
  const ms = Math.max(0, Date.now() - new Date(claimedAt).getTime());
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

function maskKey(plain: string | null, fallback: string): string {
  if (!plain) return fallback;
  if (plain.length <= 8) return plain;
  return `${plain.slice(0, 8)}••••${plain.slice(-4)}`;
}

function StatusPill({ status }: { status: KeyStatus }) {
  const map: Record<KeyStatus, { bg: string; text: string; dot: string; label: string }> = {
    active: { bg: "bg-[#30D158]/15", text: "text-[#30D158]", dot: "bg-[#30D158]", label: "Active" },
    paused: { bg: "bg-[#FF9F0A]/15", text: "text-[#FF9F0A]", dot: "bg-[#FF9F0A]", label: "Paused" },
    unused: { bg: "bg-[#0A84FF]/15", text: "text-[#64D2FF]", dot: "bg-[#0A84FF]", label: "Unused" },
    expired: { bg: "bg-[#FF453A]/15", text: "text-[#FF6961]", dot: "bg-[#FF453A]", label: "Expired" },
  };
  const cfg = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

const EXPIRY_PRESETS: { label: string; days: number | null }[] = [
  { label: "Lifetime", days: null },
  { label: "1d", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

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
  const clearLimitsFn = useServerFn(clearAllRateLimits);

  const [status, setStatus] = useState<PageStatus>("checking");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  // Navigation & dashboard data
  const [section, setSection] = useState<MainSection>("users");
  const [keys, setKeys] = useState<AdminKeyRecord[]>([]);
  const [logs, setLogs] = useState<AdminAuditItem[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    unused: 0,
    paused: 0,
    expired: 0,
    blockedIps: 0,
  });
  const [buyKeyBotUrl, setBuyKeyBotUrl] = useState("https://t.me/ZimbolaKeyBot");
  const [loadingList, setLoadingList] = useState(false);

  // Key generator state
  const [createMode, setCreateMode] = useState<CreateMode>("random");
  const [customKeyInput, setCustomKeyInput] = useState("");
  const [keyLabelInput, setKeyLabelInput] = useState("");
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [customDaysInput, setCustomDaysInput] = useState("");
  const [freshKey, setFreshKey] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filtering
  const [filter, setFilter] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Sheets & Inspector
  const [selectedKey, setSelectedKey] = useState<AdminKeyRecord | null>(null);
  const [revealKey, setRevealKey] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  // Edit inside Inspector
  const [editUserName, setEditUserName] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editExpiryChoice, setEditExpiryChoice] = useState<number>(0);

  // Bot link sheet
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [botUrlDraft, setBotUrlDraft] = useState("");

  const flashNotice = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => {
      setNotice((prev) => (prev === msg ? "" : prev));
    }, 2600);
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoadingList(true);
    setError("");
    try {
      const data = await fetchDashboard();
      setKeys(data.keys);
      setStats(data.stats);
      setLogs(data.logs);
      setBuyKeyBotUrl(data.buyKeyBotUrl);
      setSelectedKey((current) =>
        current ? (data.keys.find((item) => item.id === current.id) ?? null) : null,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load dashboard. Verify Neon DATABASE_URL.",
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

  useEffect(() => {
    if (selectedKey) {
      setEditUserName(selectedKey.userName ?? "");
      setEditLabel(selectedKey.keyLabel ?? "");
      setEditExpiryChoice(0);
      setRevealKey(false);
      setConfirmDeleteId(null);
    }
  }, [selectedKey]);

  const filteredKeys = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return keys.filter((item) => {
      if (filter !== "all" && item.status !== filter) return false;
      if (!q) return true;
      const haystack = [
        item.keyPlain ?? "",
        item.keyHashShort,
        item.keyLabel ?? "",
        item.userName ?? "",
        item.userIp ?? "",
        item.deviceHashShort ?? "",
        item.deviceInfo?.os ?? "",
        item.deviceInfo?.browser ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [keys, filter, searchQuery]);

  async function copyText(id: string, value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch {
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
      setError("Could not verify passcode. Check ZIMADMIN_PASSWORD and DATABASE_URL.");
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
      setLogs([]);
      setFreshKey("");
      setSelectedKey(null);
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

      const payload: {
        customKey?: string;
        label?: string;
        expiresInDays?: number | null;
      } = {
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
      flashNotice(createMode === "custom" ? "Custom key created" : "Key generated");
      await loadDashboard();
    } catch {
      setError("Could not create key.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handlePauseToggle(item: AdminKeyRecord) {
    setActionBusyId(item.id);
    setError("");
    try {
      await togglePauseFn({ data: { id: item.id, paused: !item.isPaused } });
      flashNotice(item.isPaused ? "User resumed" : "User paused");
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
      flashNotice("User kicked & device removed");
      await loadDashboard();
    } catch {
      setError("Failed to remove user.");
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
      flashNotice("Key deleted");
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
        userName: editUserName.trim() || null,
      };
      if (editExpiryChoice !== 0) {
        payload.expiresInDays = editExpiryChoice;
      }
      await updateMetaFn({ data: payload });
      setEditExpiryChoice(0);
      flashNotice("Changes saved");
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
      setSettingsOpen(false);
      flashNotice("Bot link updated");
    } catch {
      setError("Could not save bot link.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleClearRateLimits() {
    setIsBusy(true);
    try {
      await clearLimitsFn();
      flashNotice("All IP blocks cleared");
      await loadDashboard();
    } catch {
      setError("Could not clear blocks.");
    } finally {
      setIsBusy(false);
    }
  }

  // -------------------------------------------------------------------------
  // LOCKED VIEW — Clean Native Apple iOS Passcode Screen
  // -------------------------------------------------------------------------
  if (status !== "unlocked") {
    return (
      <main className="ios-native flex h-dvh w-full flex-col items-center justify-between overflow-hidden bg-black text-white">
        <div className="flex h-full w-full max-w-[396px] flex-col justify-between px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="h-2 shrink-0" />

          <div className="my-auto py-4">
            <div className="ios-enter mb-8 flex flex-col items-center text-center">
              <div className="mb-4 flex h-[64px] w-[64px] items-center justify-center rounded-[16px] border border-white/[0.12] bg-[#1C1C1E] shadow-[0_8px_24px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.1)]">
                <Lock className="h-[28px] w-[28px] text-white" strokeWidth={1.8} />
              </div>
              <h1 className="text-[28px] font-bold tracking-[-0.025em] text-white">
                Admin Console
              </h1>
              <p className="mt-1.5 text-[15px] text-[#EBEBF5]/55">
                Enter your administrator passcode.
              </p>
            </div>

            {status === "checking" ? (
              <div className="flex items-center justify-center gap-2.5 rounded-[14px] bg-[#1C1C1E] py-5 text-[14px] text-[#EBEBF5]/60">
                <Loader2 className="h-4 w-4 animate-spin text-[#0A84FF]" />
                <span>Checking session…</span>
              </div>
            ) : status === "unavailable" ? (
              <div className="rounded-[14px] bg-[#FF453A]/14 p-4 text-center text-[13.5px] text-[#FF6961]">
                {error || "Admin environment variables are missing."}
              </div>
            ) : (
              <form onSubmit={handleUnlock} className="ios-enter-1">
                <div className="overflow-hidden rounded-[14px] bg-[#1C1C1E]">
                  <div className="flex h-[50px] items-center px-4">
                    <label
                      htmlFor="admin-passcode"
                      className="w-[88px] shrink-0 text-[15px] text-white"
                    >
                      Passcode
                    </label>
                    <input
                      id="admin-passcode"
                      type="password"
                      autoComplete="current-password"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="Required"
                      required
                      className="min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-[#EBEBF5]/30 focus:outline-none"
                    />
                  </div>
                </div>

                {error ? (
                  <div
                    role="alert"
                    className="ios-enter mt-3 flex items-start gap-2 rounded-[12px] bg-[#FF453A]/14 px-3.5 py-2.5 text-[13px] text-[#FF6961]"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#FF453A]" />
                    <span>{error}</span>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={isBusy || !passcode.trim()}
                  className="mt-4 flex h-[50px] w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-[#0A84FF] text-[16px] font-semibold text-white transition-all active:scale-[0.985] active:opacity-85 disabled:cursor-not-allowed disabled:bg-[#1C1C1E] disabled:text-[#EBEBF5]/30"
                >
                  {isBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Signing In…</span>
                    </>
                  ) : (
                    <span>Sign In</span>
                  )}
                </button>
              </form>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-center gap-1.5 text-[12px] text-[#EBEBF5]/35">
            <Shield className="h-3 w-3" />
            <span>Rate-limited &amp; device-verified session</span>
          </footer>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------------------
  // UNLOCKED ADMIN CONSOLE — Authentic Native Apple iOS Dark Interface
  // -------------------------------------------------------------------------
  return (
    <main className="ios-native min-h-dvh w-full bg-black pb-[max(2.5rem,env(safe-area-inset-bottom))] text-white">
      {/* Subtle iOS Toast Banner */}
      {notice ? (
        <div className="fixed inset-x-0 top-3 z-[70] flex justify-center px-4">
          <div className="ios-hud-pop ios-hud-blur inline-flex items-center gap-2 rounded-full border border-white/[0.1] px-4 py-2 text-[13px] font-semibold text-white shadow-xl">
            <Check className="h-4 w-4 text-[#30D158]" strokeWidth={2.6} />
            <span>{notice}</span>
          </div>
        </div>
      ) : null}

      {/* Authentic iOS Translucent Sticky Navigation Bar */}
      <header className="ios-nav-blur sticky top-0 z-30 border-b border-[#545458]/40">
        <div className="mx-auto flex h-[54px] w-full max-w-[820px] items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-[28px] w-[28px] items-center justify-center rounded-[7px] bg-[#0A84FF]">
              <KeyRound className="h-[15px] w-[15px] text-white" strokeWidth={2.2} />
            </span>
            <span className="text-[17px] font-semibold tracking-[-0.02em] text-white">
              Zimbola Admin
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void loadDashboard()}
              disabled={loadingList}
              aria-label="Refresh"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#1C1C1E] text-[#0A84FF] transition-colors active:bg-[#2C2C2E]"
            >
              <RefreshCw className={`h-[15px] w-[15px] ${loadingList ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                setBotUrlDraft(buyKeyBotUrl);
                setSettingsOpen(true);
              }}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-[#1C1C1E] px-3 text-[13px] font-medium text-[#0A84FF] transition-colors active:bg-[#2C2C2E]"
            >
              <Bot className="h-[14px] w-[14px]" />
              <span>Bot Link</span>
            </button>
            <button
              type="button"
              onClick={handleLock}
              disabled={isBusy}
              aria-label="Lock"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#1C1C1E] text-[#FF453A] transition-colors active:bg-[#2C2C2E]"
            >
              <Lock className="h-[14px] w-[14px]" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[820px] px-4 pt-5">
        {/* Error Alert */}
        {error ? (
          <div
            role="alert"
            className="ios-enter mb-4 flex items-center justify-between gap-3 rounded-[14px] bg-[#FF453A]/14 px-4 py-3 text-[13.5px] text-[#FF6961]"
          >
            <span className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#FF453A]" />
              {error}
            </span>
            <button type="button" onClick={() => setError("")} className="p-1 text-[#FF6961]/70">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {/* Native iOS Segmented Control (Main Navigation) */}
        <div className="mb-5 grid grid-cols-3 rounded-[10px] bg-[#1C1C1E] p-[3px]">
          {(
            [
              { id: "users", label: `Users (${stats.total})` },
              { id: "create", label: "Create Key" },
              { id: "security", label: "Security" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id)}
              className={`h-[34px] cursor-pointer rounded-[8px] text-[13px] font-semibold tracking-[-0.01em] transition-all ${
                section === tab.id
                  ? "bg-[#3A3A3C] text-white shadow-[0_1px_4px_rgba(0,0,0,0.45)]"
                  : "text-[#EBEBF5]/55 hover:text-white/80"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ================================================================= */}
        {/* SECTION 1: USERS & LICENSE KEYS                                   */}
        {/* ================================================================= */}
        {section === "users" ? (
          <div className="ios-enter space-y-5">
            {/* Compact iOS Summary Metrics */}
            <div className="grid grid-cols-4 gap-2.5">
              {[
                { label: "Total", value: stats.total, tab: "all" as FilterTab, color: "text-white" },
                { label: "Active", value: stats.active, tab: "active" as FilterTab, color: "text-[#30D158]" },
                { label: "Paused", value: stats.paused, tab: "paused" as FilterTab, color: "text-[#FF9F0A]" },
                { label: "Unused", value: stats.unused, tab: "unused" as FilterTab, color: "text-[#0A84FF]" },
              ].map((tile) => (
                <button
                  key={tile.label}
                  type="button"
                  onClick={() => setFilter(tile.tab)}
                  className={`cursor-pointer rounded-[14px] bg-[#1C1C1E] px-3 py-3 text-left transition-all active:bg-[#2C2C2E] ${
                    filter === tile.tab ? "ring-1 ring-[#0A84FF]" : ""
                  }`}
                >
                  <span className="block text-[11.5px] font-medium text-[#EBEBF5]/50">
                    {tile.label}
                  </span>
                  <span className={`ios-tabular mt-1 block text-[22px] font-bold tracking-tight ${tile.color}`}>
                    {tile.value}
                  </span>
                </button>
              ))}
            </div>

            {/* Search + Status Filter Bar */}
            <div className="space-y-2.5">
              <div className="flex h-[40px] items-center gap-2 rounded-[10px] bg-[#1C1C1E] px-3">
                <Search className="h-[16px] w-[16px] shrink-0 text-[#EBEBF5]/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, key, IP, or device"
                  className="w-full bg-transparent text-[15px] text-white placeholder:text-[#EBEBF5]/35 focus:outline-none"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-[#3A3A3C] text-white/80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {(["all", "active", "paused", "unused", "expired"] as FilterTab[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setFilter(tab)}
                      className={`shrink-0 cursor-pointer rounded-full px-3 py-1 text-[12px] font-medium capitalize transition-colors ${
                        filter === tab
                          ? "bg-white text-black"
                          : "bg-[#1C1C1E] text-[#EBEBF5]/60 active:bg-[#2C2C2E]"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSection("create")}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-[#0A84FF] px-3 py-1 text-[12px] font-semibold text-white active:opacity-80"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New</span>
                </button>
              </div>
            </div>

            {/* Grouped User/Key List */}
            {loadingList && keys.length === 0 ? (
              <div className="flex items-center justify-center gap-2 rounded-[14px] bg-[#1C1C1E] py-12 text-[14px] text-[#EBEBF5]/50">
                <Loader2 className="h-4 w-4 animate-spin text-[#0A84FF]" />
                <span>Loading users…</span>
              </div>
            ) : filteredKeys.length === 0 ? (
              <div className="rounded-[14px] bg-[#1C1C1E] py-12 text-center text-[14px] text-[#EBEBF5]/45">
                No keys found for this filter.
              </div>
            ) : (
              <div className="overflow-hidden rounded-[14px] bg-[#1C1C1E]">
                {filteredKeys.map((item, idx) => {
                  const hasUser = Boolean(item.claimedAt);
                  const busy = actionBusyId === item.id;
                  const titleName =
                    item.userName || item.keyLabel || (hasUser ? "Active User" : "Unclaimed Key");

                  return (
                    <div key={item.id}>
                      {idx > 0 ? <div className="ml-4 h-[0.5px] bg-[#545458]/55" /> : null}

                      <div className="px-4 py-3.5">
                        {/* Top clickable inspector header */}
                        <button
                          type="button"
                          onClick={() => setSelectedKey(item)}
                          className="flex w-full cursor-pointer items-start justify-between gap-3 text-left active:opacity-75"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-[16px] font-semibold tracking-[-0.015em] text-white">
                                {titleName}
                              </span>
                              <StatusPill status={item.status} />
                              {item.isCustom ? (
                                <span className="rounded bg-[#2C2C2E] px-1.5 py-0.5 text-[10px] font-semibold text-[#EBEBF5]/70">
                                  CUSTOM
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[12.5px] text-[#EBEBF5]/60">
                              <span>{maskKey(item.keyPlain, item.keyHashShort)}</span>
                              {item.userIp ? <span className="text-[#EBEBF5]/40">• {item.userIp}</span> : null}
                            </div>

                            <div className="ios-tabular mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#EBEBF5]/45">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {item.claimedAt
                                  ? `Used ${formatDateTime(item.claimedAt)} (${formatUsageDuration(item.claimedAt)})`
                                  : `Created ${formatRelative(item.createdAt)}`}
                              </span>
                              {item.deviceInfo?.os ? (
                                <span className="inline-flex items-center gap-1">
                                  <Smartphone className="h-3 w-3" />
                                  {[item.deviceInfo.os, item.deviceInfo.browser].filter(Boolean).join(" ")}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <ChevronRight className="mt-1 h-[18px] w-[18px] shrink-0 text-[#EBEBF5]/30" />
                        </button>

                        {/* Compact iOS Action Pills */}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {item.keyPlain ? (
                            <button
                              type="button"
                              onClick={() => copyText(item.id, item.keyPlain ?? "")}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-[8px] bg-[#2C2C2E] px-2.5 py-1.5 text-[12px] font-medium text-white active:opacity-70"
                            >
                              {copiedId === item.id ? (
                                <Check className="h-3.5 w-3.5 text-[#30D158]" />
                              ) : (
                                <Copy className="h-3.5 w-3.5 text-[#EBEBF5]/70" />
                              )}
                              <span>{copiedId === item.id ? "Copied" : "Copy Key"}</span>
                            </button>
                          ) : null}

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handlePauseToggle(item)}
                            className={`inline-flex cursor-pointer items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[12px] font-medium active:opacity-70 disabled:opacity-40 ${
                              item.isPaused
                                ? "bg-[#30D158]/18 text-[#30D158]"
                                : "bg-[#FF9F0A]/16 text-[#FF9F0A]"
                            }`}
                          >
                            {item.isPaused ? (
                              <>
                                <Play className="h-3.5 w-3.5" />
                                <span>Resume</span>
                              </>
                            ) : (
                              <>
                                <Pause className="h-3.5 w-3.5" />
                                <span>Pause</span>
                              </>
                            )}
                          </button>

                          {hasUser ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleRemoveUser(item)}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-[8px] bg-[#0A84FF]/16 px-2.5 py-1.5 text-[12px] font-medium text-[#64D2FF] active:opacity-70 disabled:opacity-40"
                            >
                              <UserMinus className="h-3.5 w-3.5" />
                              <span>Remove User</span>
                            </button>
                          ) : null}

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleDeleteKey(item)}
                            className={`ml-auto inline-flex cursor-pointer items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[12px] font-medium active:opacity-70 disabled:opacity-40 ${
                              confirmDeleteId === item.id
                                ? "bg-[#FF453A] text-white"
                                : "bg-[#FF453A]/14 text-[#FF6961]"
                            }`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>{confirmDeleteId === item.id ? "Confirm" : "Delete"}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {/* ================================================================= */}
        {/* SECTION 2: CREATE RANDOM OR CUSTOM KEY                            */}
        {/* ================================================================= */}
        {section === "create" ? (
          <div className="ios-enter space-y-5">
            <div className="grid grid-cols-2 rounded-[10px] bg-[#1C1C1E] p-[3px]">
              <button
                type="button"
                onClick={() => setCreateMode("random")}
                className={`h-[34px] cursor-pointer rounded-[8px] text-[13px] font-semibold transition-all ${
                  createMode === "random" ? "bg-[#3A3A3C] text-white" : "text-[#EBEBF5]/55"
                }`}
              >
                Random Key
              </button>
              <button
                type="button"
                onClick={() => setCreateMode("custom")}
                className={`h-[34px] cursor-pointer rounded-[8px] text-[13px] font-semibold transition-all ${
                  createMode === "custom" ? "bg-[#3A3A3C] text-white" : "text-[#EBEBF5]/55"
                }`}
              >
                Custom Key
              </button>
            </div>

            <form onSubmit={handleCreateKey} className="space-y-4">
              <div>
                <p className="mb-2 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-[#EBEBF5]/45">
                  Key Details
                </p>
                <div className="overflow-hidden rounded-[14px] bg-[#1C1C1E]">
                  {createMode === "custom" ? (
                    <>
                      <div className="flex h-[50px] items-center px-4">
                        <label className="w-[96px] shrink-0 text-[15px] text-white">
                          Key Code
                        </label>
                        <input
                          type="text"
                          value={customKeyInput}
                          onChange={(e) => setCustomKeyInput(e.target.value.toUpperCase())}
                          placeholder="VIP-USER-01"
                          maxLength={64}
                          required
                          className="min-w-0 flex-1 bg-transparent font-mono text-[15px] text-white placeholder:font-sans placeholder:text-[#EBEBF5]/30 focus:outline-none"
                        />
                      </div>
                      <div className="ml-4 h-[0.5px] bg-[#545458]/55" />
                    </>
                  ) : null}

                  <div className="flex h-[50px] items-center px-4">
                    <label className="w-[96px] shrink-0 text-[15px] text-white">
                      Label
                    </label>
                    <input
                      type="text"
                      value={keyLabelInput}
                      onChange={(e) => setKeyLabelInput(e.target.value)}
                      placeholder="Buyer name or @telegram"
                      maxLength={80}
                      className="min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-[#EBEBF5]/30 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-[#EBEBF5]/45">
                  Validity Period
                </p>
                <div className="rounded-[14px] bg-[#1C1C1E] p-3.5">
                  <div className="flex flex-wrap gap-2">
                    {EXPIRY_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setExpiryDays(preset.days);
                          setCustomDaysInput("");
                        }}
                        className={`cursor-pointer rounded-[9px] px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                          expiryDays === preset.days && !customDaysInput
                            ? "bg-[#0A84FF] text-white"
                            : "bg-[#2C2C2E] text-[#EBEBF5]/75 active:opacity-75"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={customDaysInput}
                      onChange={(e) => setCustomDaysInput(e.target.value)}
                      placeholder="Custom days"
                      className="ios-tabular w-[112px] rounded-[9px] bg-[#2C2C2E] px-3 py-1.5 text-[13px] text-white placeholder:text-[#EBEBF5]/35 focus:outline-none focus:ring-1 focus:ring-[#0A84FF]"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isBusy}
                className="flex h-[50px] w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-[#0A84FF] text-[16px] font-semibold text-white transition-all active:scale-[0.985] active:opacity-85 disabled:opacity-50"
              >
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
                <span>{createMode === "custom" ? "Create Custom Key" : "Generate Access Key"}</span>
              </button>
            </form>

            {freshKey ? (
              <div className="ios-enter rounded-[14px] bg-[#1C1C1E] p-4 ring-1 ring-[#30D158]/40">
                <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#30D158]">
                  Generated Key (Encrypted in Neon)
                </p>
                <p className="mt-1.5 break-all font-mono text-[18px] font-bold tracking-wide text-white">
                  {freshKey}
                </p>
                <div className="mt-3.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => copyText("fresh-key", freshKey)}
                    className="flex h-[40px] cursor-pointer items-center justify-center gap-1.5 rounded-[10px] bg-[#0A84FF] text-[14px] font-semibold text-white active:opacity-80"
                  >
                    {copiedId === "fresh-key" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span>{copiedId === "fresh-key" ? "Copied" : "Copy Key"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      copyText(
                        "fresh-msg",
                        `Your Zimbola Clux Access Key:
${freshKey}

Note: Works on 1 device only.`,
                      )
                    }
                    className="flex h-[40px] cursor-pointer items-center justify-center gap-1.5 rounded-[10px] bg-[#2C2C2E] text-[14px] font-medium text-white active:opacity-80"
                  >
                    {copiedId === "fresh-msg" ? <Check className="h-4 w-4 text-[#30D158]" /> : <Copy className="h-4 w-4" />}
                    <span>{copiedId === "fresh-msg" ? "Copied" : "Copy Message"}</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ================================================================= */}
        {/* SECTION 3: SECURITY & AUDIT LOGS                                  */}
        {/* ================================================================= */}
        {section === "security" ? (
          <div className="ios-enter space-y-5">
            <div className="overflow-hidden rounded-[14px] bg-[#1C1C1E]">
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#30D158]/18 text-[#30D158]">
                    <Shield className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[15px] font-medium text-white">Key Storage Encryption</p>
                    <p className="text-[12px] text-[#EBEBF5]/50">AES-256-GCM + SHA-256 Hash</p>
                  </div>
                </div>
                <span className="text-[13px] font-semibold text-[#30D158]">Active</span>
              </div>
              <div className="ml-14 h-[0.5px] bg-[#545458]/55" />
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#FF9F0A]/18 text-[#FF9F0A]">
                    <ShieldAlert className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[15px] font-medium text-white">Brute-Force Protection</p>
                    <p className="ios-tabular text-[12px] text-[#EBEBF5]/50">
                      {stats.blockedIps} IP{stats.blockedIps === 1 ? "" : "s"} currently blocked
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleClearRateLimits()}
                  className="cursor-pointer rounded-[8px] bg-[#2C2C2E] px-3 py-1.5 text-[12.5px] font-medium text-[#0A84FF] active:opacity-75"
                >
                  Clear Blocks
                </button>
              </div>
            </div>

            <div>
              <p className="mb-2 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-[#EBEBF5]/45">
                Recent Security Events ({logs.length})
              </p>
              {logs.length === 0 ? (
                <div className="rounded-[14px] bg-[#1C1C1E] py-10 text-center text-[14px] text-[#EBEBF5]/45">
                  No security events recorded yet.
                </div>
              ) : (
                <div className="overflow-hidden rounded-[14px] bg-[#1C1C1E]">
                  {logs.map((log, idx) => {
                    const dotColor =
                      log.severity === "danger"
                        ? "bg-[#FF453A]"
                        : log.severity === "warn"
                          ? "bg-[#FF9F0A]"
                          : "bg-[#30D158]";
                    return (
                      <div key={log.id}>
                        {idx > 0 ? <div className="ml-4 h-[0.5px] bg-[#545458]/55" /> : null}
                        <div className="flex items-start gap-3 px-4 py-3">
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-medium leading-snug text-white">
                              {log.summary}
                            </p>
                            <p className="ios-tabular mt-0.5 text-[12px] text-[#EBEBF5]/45">
                              {formatDateTime(log.createdAt)}
                              {log.ip ? ` • ${log.ip}` : ""}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* =================================================================== */}
      {/* iOS BOTTOM SHEET — FULL USER & KEY INSPECTOR                        */}
      {/* =================================================================== */}
      {selectedKey ? (
        <div
          onClick={() => setSelectedKey(null)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur-xs sm:items-center sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="ios-sheet-up flex max-h-[90dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-[20px] bg-[#1C1C1E] sm:rounded-[20px]"
          >
            {/* iOS Sheet Grabber + Header */}
            <div className="shrink-0 border-b border-[#545458]/50 px-4 pb-3 pt-2.5">
              <div className="mx-auto mb-2.5 h-[5px] w-9 rounded-full bg-white/25 sm:hidden" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-[17px] font-semibold text-white">Key Details</h3>
                  <StatusPill status={selectedKey.status} />
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedKey(null)}
                  className="cursor-pointer rounded-full bg-[#2C2C2E] px-3 py-1 text-[13px] font-semibold text-[#0A84FF]"
                >
                  Done
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {/* License Key Box */}
              <div className="flex items-center justify-between gap-2 rounded-[12px] bg-[#2C2C2E] px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] font-medium uppercase tracking-wider text-[#EBEBF5]/45">
                    License Key
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[14.5px] font-semibold text-white">
                    {revealKey
                      ? (selectedKey.keyPlain ?? selectedKey.keyHashShort)
                      : maskKey(selectedKey.keyPlain, selectedKey.keyHashShort)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {selectedKey.keyPlain ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setRevealKey((r) => !r)}
                        aria-label="Toggle visibility"
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] bg-[#3A3A3C] text-white/80"
                      >
                        {revealKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyText(`sheet-${selectedKey.id}`, selectedKey.keyPlain ?? "")}
                        className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-[8px] bg-[#0A84FF] px-2.5 text-[12px] font-semibold text-white"
                      >
                        {copiedId === `sheet-${selectedKey.id}` ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>{copiedId === `sheet-${selectedKey.id}` ? "Copied" : "Copy"}</span>
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Editable Profile + Expiry */}
              <div className="overflow-hidden rounded-[12px] bg-[#2C2C2E]">
                <div className="flex h-[46px] items-center px-3.5">
                  <UserRound className="mr-2.5 h-4 w-4 shrink-0 text-[#EBEBF5]/45" />
                  <input
                    type="text"
                    value={editUserName}
                    onChange={(e) => setEditUserName(e.target.value)}
                    placeholder="User Name"
                    className="w-full bg-transparent text-[14.5px] text-white placeholder:text-[#EBEBF5]/35 focus:outline-none"
                  />
                </div>
                <div className="ml-3.5 h-[0.5px] bg-[#545458]/60" />
                <div className="flex h-[46px] items-center px-3.5">
                  <KeyRound className="mr-2.5 h-4 w-4 shrink-0 text-[#EBEBF5]/45" />
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    placeholder="Admin Note / Plan"
                    className="w-full bg-transparent text-[14.5px] text-white placeholder:text-[#EBEBF5]/35 focus:outline-none"
                  />
                </div>
                <div className="ml-3.5 h-[0.5px] bg-[#545458]/60" />
                <div className="flex flex-wrap items-center gap-1.5 px-3.5 py-2.5">
                  <span className="mr-1 text-[12px] text-[#EBEBF5]/50">Expiry:</span>
                  {[
                    { label: "Keep", val: 0 },
                    { label: "+7d", val: 7 },
                    { label: "+30d", val: 30 },
                    { label: "Lifetime", val: -1 },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setEditExpiryChoice(opt.val)}
                      className={`cursor-pointer rounded-[7px] px-2.5 py-1 text-[12px] font-medium ${
                        editExpiryChoice === opt.val
                          ? "bg-[#0A84FF] text-white"
                          : "bg-[#3A3A3C] text-[#EBEBF5]/75"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={actionBusyId === selectedKey.id}
                    onClick={() => void handleSaveMeta()}
                    className="ml-auto cursor-pointer rounded-[8px] bg-white px-3 py-1 text-[12px] font-semibold text-black active:opacity-75"
                  >
                    Save
                  </button>
                </div>
              </div>

              {/* Full Telemetry List */}
              <div className="ios-tabular overflow-hidden rounded-[12px] bg-[#2C2C2E] text-[13.5px]">
                {[
                  { k: "Key Used Time", v: formatDateTime(selectedKey.claimedAt) },
                  { k: "Active Duration", v: formatUsageDuration(selectedKey.claimedAt) },
                  { k: "Last Seen", v: selectedKey.lastSeenAt ? `${formatDateTime(selectedKey.lastSeenAt)} (${formatRelative(selectedKey.lastSeenAt)})` : "Never" },
                  { k: "Total Logins", v: String(selectedKey.loginCount) },
                  { k: "Created At", v: formatDateTime(selectedKey.createdAt) },
                  { k: "Expires At", v: selectedKey.expiresAt ? formatDateTime(selectedKey.expiresAt) : "Lifetime" },
                  { k: "Paused At", v: selectedKey.pausedAt ? formatDateTime(selectedKey.pausedAt) : "Not paused" },
                  { k: "Device ID", v: selectedKey.deviceHashShort ?? "Unbound" },
                  { k: "IP Address", v: selectedKey.userIp ?? "—" },
                  { k: "OS & Browser", v: [selectedKey.deviceInfo?.os, selectedKey.deviceInfo?.browser].filter(Boolean).join(" • ") || "—" },
                  { k: "Screen & TZ", v: [selectedKey.deviceInfo?.screen, selectedKey.deviceInfo?.timezone].filter(Boolean).join(" • ") || "—" },
                  { k: "Language", v: selectedKey.deviceInfo?.language ?? "—" },
                ].map((row, idx) => (
                  <div key={row.k}>
                    {idx > 0 ? <div className="ml-3.5 h-[0.5px] bg-[#545458]/60" /> : null}
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <span className="shrink-0 text-[#EBEBF5]/55">{row.k}</span>
                      <span className="truncate text-right font-medium text-white">{row.v}</span>
                    </div>
                  </div>
                ))}
                {selectedKey.userAgent ? (
                  <>
                    <div className="ml-3.5 h-[0.5px] bg-[#545458]/60" />
                    <div className="px-3.5 py-2.5">
                      <span className="block text-[11.5px] text-[#EBEBF5]/45">User Agent</span>
                      <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-[#EBEBF5]/70">
                        {selectedKey.userAgent}
                      </p>
                    </div>
                  </>
                ) : null}
              </div>

              {/* Action Controls */}
              <div className="grid grid-cols-2 gap-2.5 pb-2">
                <button
                  type="button"
                  disabled={actionBusyId === selectedKey.id}
                  onClick={() => void handlePauseToggle(selectedKey)}
                  className={`flex h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-[12px] text-[14px] font-semibold active:opacity-80 ${
                    selectedKey.isPaused
                      ? "bg-[#30D158] text-black"
                      : "bg-[#FF9F0A]/18 text-[#FF9F0A]"
                  }`}
                >
                  {selectedKey.isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  <span>{selectedKey.isPaused ? "Resume User" : "Pause User"}</span>
                </button>

                <button
                  type="button"
                  disabled={actionBusyId === selectedKey.id || !selectedKey.claimedAt}
                  onClick={() => void handleRemoveUser(selectedKey)}
                  className="flex h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-[12px] bg-[#0A84FF]/18 text-[14px] font-semibold text-[#64D2FF] active:opacity-80 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <UserMinus className="h-4 w-4" />
                  <span>Remove User</span>
                </button>

                <button
                  type="button"
                  disabled={actionBusyId === selectedKey.id}
                  onClick={() => void handleDeleteKey(selectedKey)}
                  className={`col-span-2 flex h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-[12px] text-[14px] font-semibold active:opacity-80 ${
                    confirmDeleteId === selectedKey.id
                      ? "bg-[#FF453A] text-white"
                      : "bg-[#FF453A]/15 text-[#FF6961]"
                  }`}
                >
                  <Trash2 className="h-4 w-4" />
                  <span>
                    {confirmDeleteId === selectedKey.id ? "Tap Again to Permanently Delete" : "Delete Key"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* =================================================================== */}
      {/* iOS SHEET — TELEGRAM BUY KEY BOT URL SETTINGS                       */}
      {/* =================================================================== */}
      {settingsOpen ? (
        <div
          onClick={() => setSettingsOpen(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur-xs sm:items-center sm:p-4"
        >
          <form
            onSubmit={handleSaveBotUrl}
            onClick={(e) => e.stopPropagation()}
            className="ios-sheet-up w-full max-w-[420px] rounded-t-[20px] bg-[#1C1C1E] p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-[20px]"
          >
            <div className="mx-auto mb-3 h-[5px] w-9 rounded-full bg-white/25 sm:hidden" />
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[17px] font-semibold text-white">Buy Key Bot Link</h3>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="cursor-pointer rounded-full bg-[#2C2C2E] px-3 py-1 text-[13px] font-semibold text-[#0A84FF]"
              >
                Cancel
              </button>
            </div>
            <p className="mb-3 text-[13px] text-[#EBEBF5]/55">
              Users tapping &ldquo;Buy Access Key&rdquo; on the login screen will be redirected here.
            </p>
            <div className="flex h-[48px] items-center gap-2.5 rounded-[12px] bg-[#2C2C2E] px-3.5">
              <Bot className="h-4 w-4 shrink-0 text-[#0A84FF]" />
              <input
                type="text"
                value={botUrlDraft}
                onChange={(e) => setBotUrlDraft(e.target.value)}
                placeholder="https://t.me/YourBot or @YourBot"
                required
                className="w-full bg-transparent text-[15px] text-white placeholder:text-[#EBEBF5]/35 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isBusy}
              className="mt-4 flex h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-[12px] bg-[#0A84FF] text-[15.5px] font-semibold text-white active:opacity-80 disabled:opacity-50"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span>Save Link</span>
            </button>
          </form>
        </div>
      ) : null}
    </main>
  );
}
