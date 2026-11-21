import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  AlertCircle,
  Check,
  ChevronRight,
  KeyRound,
  Loader2,
  Lock,
  Send,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  clearAccessSession,
  getAccessStatus,
  getPublicLoginConfig,
  redeemAccessKey,
  type AccessDeniedReason,
} from "@/lib/access.functions";

const loginSearchSchema = z.object({
  reason: z
    .enum(["none", "invalid", "used", "paused", "expired", "revoked", "rate_limited", "misconfigured"])
    .optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: (search) => loginSearchSchema.parse(search),
  beforeLoad: async ({ search }) => {
    if (search.reason && search.reason !== "none") return;
    try {
      const access = await getAccessStatus();
      if (access.granted) {
        throw redirect({ to: "/", replace: true });
      }
    } catch (err) {
      if (err && typeof err === "object" && "to" in err) throw err;
    }
  },
  head: () => ({
    meta: [
      { title: "Sign In — Zimbola Clux" },
      { name: "description", content: "Sign in with your Zimbola Clux access key." },
      { property: "og:title", content: "Sign In — Zimbola Clux" },
      { property: "og:description", content: "Sign in with your Zimbola Clux access key." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function collectDeviceInfo() {
  if (typeof window === "undefined") return undefined;
  const ua = navigator.userAgent;

  let os = "Unknown OS";
  if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";

  return {
    os,
    browser,
    platform: navigator.platform || os,
    screen: `${window.screen.width}x${window.screen.height}`,
    timezone: tz,
    language: navigator.language || "en",
  };
}

function getReasonMessage(reason: AccessDeniedReason | undefined, retrySeconds = 0): string {
  switch (reason) {
    case "paused":
      return "Your access has been paused by the administrator.";
    case "expired":
      return "This access key has expired. Get a new key to continue.";
    case "revoked":
      return "This device session was revoked. Sign in with a valid key.";
    case "used":
      return "This key is already active on another device.";
    case "invalid":
      return "The access key you entered is not valid.";
    case "rate_limited": {
      const mins = Math.max(1, Math.ceil(retrySeconds / 60));
      return retrySeconds > 0
        ? `Too many failed attempts. Try again in ${retrySeconds < 60 ? `${retrySeconds}s` : `${mins}m`}.`
        : "Too many failed attempts. Please wait before trying again.";
    }
    case "misconfigured":
      return "Server configuration error. Verify DATABASE_URL and ACCESS_SESSION_SECRET.";
    default:
      return "";
  }
}

function LoginPage() {
  const { reason } = Route.useSearch();
  const redeem = useServerFn(redeemAccessKey);
  const fetchConfig = useServerFn(getPublicLoginConfig);
  const clearSession = useServerFn(clearAccessSession);

  const [userName, setUserName] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState(() => getReasonMessage(reason));
  const [cooldown, setCooldown] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginSucceeded, setLoginSucceeded] = useState(false);
  const [buyKeyBotUrl, setBuyKeyBotUrl] = useState("https://t.me/ZimbolaKeyBot");
  const [pasted, setPasted] = useState(false);

  useEffect(() => {
    if (reason && reason !== "none") {
      setError(getReasonMessage(reason));
      if (reason === "revoked" || reason === "expired") {
        void clearSession();
      }
    }
  }, [reason, clearSession]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          setError("");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  useEffect(() => {
    let active = true;
    fetchConfig()
      .then((cfg) => {
        if (active && cfg.buyKeyBotUrl) setBuyKeyBotUrl(cfg.buyKeyBotUrl);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [fetchConfig]);

  async function handlePaste() {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip.trim()) {
        setKey(clip.replace(/[\u200B-\u200D\uFEFF]/g, "").trim().toUpperCase());
        setError("");
        setPasted(true);
        window.setTimeout(() => setPasted(false), 1200);
      }
    } catch {
      // Clipboard blocked on non-HTTPS or denied permission
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cooldown > 0) return;
    setError("");

    const trimmedKey = key.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    if (!trimmedKey) {
      setError("Please enter your access key.");
      return;
    }

    setIsSubmitting(true);
    try {
      const deviceInfo = collectDeviceInfo();
      const payload: {
        key: string;
        userName?: string;
        deviceInfo?: NonNullable<ReturnType<typeof collectDeviceInfo>>;
      } = { key: trimmedKey };

      if (userName.trim()) payload.userName = userName.trim();
      if (deviceInfo) payload.deviceInfo = deviceInfo;

      const result = await redeem({ data: payload });
      if (!result.ok) {
        if (result.retryAfterSeconds > 0) {
          setCooldown(result.retryAfterSeconds);
        }
        setError(getReasonMessage(result.reason, result.retryAfterSeconds));
        return;
      }

      setLoginSucceeded(true);
      window.setTimeout(() => {
        window.location.replace("/");
      }, 900);
    } catch {
      setError("Could not reach the server. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = key.trim().length > 0 && !isSubmitting && !loginSucceeded && cooldown === 0;

  return (
    <main className="ios-native flex h-dvh w-full flex-col items-center justify-between overflow-hidden bg-black text-white">
      <div className="flex h-full w-full max-w-[402px] flex-col justify-between overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        {/* Top subtle spacer for vertical balance */}
        <div className="h-2 shrink-0" />

        {/* Center Sign-In Stack */}
        <div className="my-auto py-4">
          {/* App Identity Header */}
          <div className="ios-enter mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-[64px] w-[64px] items-center justify-center rounded-[16px] border border-white/[0.12] bg-[#1C1C1E] shadow-[0_8px_24px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.1)]">
              <KeyRound className="h-[30px] w-[30px] text-white" strokeWidth={1.8} />
            </div>
            <h1 className="text-[28px] font-bold tracking-[-0.025em] text-white">
              Zimbola Clux
            </h1>
            <p className="mt-1.5 max-w-[270px] text-[15px] leading-[1.35] text-[#EBEBF5]/60">
              Enter your access key to continue on this device.
            </p>
          </div>

          {/* Native iOS Inset Grouped Form */}
          <form onSubmit={handleSubmit} className="ios-enter-1">
            <div className="overflow-hidden rounded-[14px] bg-[#1C1C1E]">
              {/* Row 1: Name */}
              <div className="flex h-[50px] items-center px-4">
                <label
                  htmlFor="login-name"
                  className="w-[74px] shrink-0 text-[15px] font-normal text-white"
                >
                  Name
                </label>
                <input
                  id="login-name"
                  name="userName"
                  type="text"
                  autoComplete="name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Optional"
                  maxLength={80}
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-[#EBEBF5]/30 focus:outline-none"
                />
              </div>

              {/* iOS Inset Hairline Divider */}
              <div className="ml-4 h-[0.5px] bg-[#545458]/60" />

              {/* Row 2: Key */}
              <div className="flex h-[50px] items-center px-4">
                <label
                  htmlFor="login-key"
                  className="w-[74px] shrink-0 text-[15px] font-normal text-white"
                >
                  Key
                </label>
                <input
                  id="login-key"
                  name="key"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value.toUpperCase());
                    if (error && cooldown === 0) setError("");
                  }}
                  placeholder="ZIM-XXXX-XXXX"
                  required
                  aria-invalid={Boolean(error)}
                  className="min-w-0 flex-1 bg-transparent font-mono text-[15px] tracking-[0.04em] text-white placeholder:font-sans placeholder:tracking-normal placeholder:text-[#EBEBF5]/30 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handlePaste}
                  className="ml-2 shrink-0 cursor-pointer text-[14px] font-medium text-[#0A84FF] transition-opacity active:opacity-50"
                >
                  {pasted ? "Pasted" : "Paste"}
                </button>
              </div>
            </div>

            {/* Error Feedback */}
            {error ? (
              <div
                role="alert"
                className="ios-enter mt-3 flex items-start gap-2 rounded-[12px] bg-[#FF453A]/14 px-3.5 py-2.5 text-[13px] leading-[1.35] text-[#FF6961]"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#FF453A]" />
                <span>
                  {cooldown > 0
                    ? `Too many failed attempts. Try again in ${cooldown}s.`
                    : error}
                </span>
              </div>
            ) : null}

            {/* Primary iOS System Blue Action Button */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-4 flex h-[50px] w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-[#0A84FF] text-[16px] font-semibold tracking-[-0.01em] text-white transition-all duration-150 hover:bg-[#1E8FFF] active:scale-[0.985] active:opacity-85 disabled:cursor-not-allowed disabled:bg-[#1C1C1E] disabled:text-[#EBEBF5]/30"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verifying…</span>
                </>
              ) : cooldown > 0 ? (
                <span className="ios-tabular">Locked ({cooldown}s)</span>
              ) : (
                <span>Continue</span>
              )}
            </button>
          </form>

          {/* Buy Access Key — Native iOS Inset Grouped Cell */}
          <div className="ios-enter-2 mt-7">
            <p className="mb-2 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-[#EBEBF5]/45">
              Don&apos;t have a key?
            </p>
            <a
              href={buyKeyBotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-[14px] bg-[#1C1C1E] px-4 py-3 transition-colors active:bg-[#2C2C2E]"
            >
              <span className="flex items-center gap-3.5">
                <span className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[8px] bg-[#0A84FF]">
                  <Send className="h-[16px] w-[16px] text-white" strokeWidth={2.2} />
                </span>
                <span className="text-left">
                  <span className="block text-[15px] font-medium leading-tight text-white">
                    Buy Access Key
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-[#EBEBF5]/50">
                    Open Telegram bot for instant key
                  </span>
                </span>
              </span>
              <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[#EBEBF5]/30" />
            </a>
          </div>
        </div>

        {/* Footer */}
        <footer className="flex shrink-0 items-center justify-center gap-1.5 pt-2 text-[12px] text-[#EBEBF5]/35">
          <Lock className="h-3 w-3" />
          <span>Bound to one device per key</span>
        </footer>
      </div>

      {/* Authentic iOS HUD Overlay on Success */}
      {loginSucceeded ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm">
          <div className="ios-hud-pop ios-hud-blur flex w-[210px] flex-col items-center rounded-[22px] border border-white/[0.08] px-6 py-7 text-center shadow-2xl">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#30D158]/20 text-[#30D158]">
              <Check className="h-8 w-8" strokeWidth={2.8} />
            </div>
            <p className="mt-3.5 text-[16px] font-semibold tracking-[-0.01em] text-white">
              Unlocked
            </p>
            <p className="mt-0.5 text-[12.5px] text-[#EBEBF5]/55">
              Opening Zimbola Clux
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
