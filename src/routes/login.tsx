import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, Headset, Megaphone, Minus, Package, Plus, Send, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import loginCss from "../login.css?url";
import { z } from "zod";
import {
  clearAccessSession,
  getAccessStatus,
  getPublicLoginConfig,
  redeemAccessKey,
  resumeDeviceSession,
  type AccessDeniedReason,
} from "@/lib/access.functions";
import {
  getExistingClientDeviceIdAsync,
  getOrCreateClientDeviceIdAsync,
  getRememberedKey,
  isAutoLoginEnabled,
  saveClientDeviceId,
  saveRememberedKey,
  setAutoLoginEnabled,
} from "@/lib/rememberedKey";
import {
  collectDeviceInfo,
  computeHardwareFingerprint,
  type ClientDeviceInfo,
} from "@/lib/deviceInfo";

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
      { title: "Sign In — PhonePe Spoof For iPhone & Android" },
      {
        name: "description",
        content:
          "Official ZimbolaClux.shop (Zimbola) website in India. Sign in with your access key for ZimbolaClux digital services, online store, and 24/7 customer support.",
      },
      {
        name: "keywords",
        content:
          "zimbola, zimbolaclux, zimbolaclux.shop, zimbola clux, zimbolaclux official, zimbolaclux website, zimbolaclux india, zimbolaclux login, zimbolaclux store, zimbolaclux support, what is zimbolaclux",
      },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { property: "og:site_name", content: "ZimbolaClux" },
      { property: "og:title", content: "Sign In — PhonePe Spoof For iPhone & Android" },
      {
        property: "og:description",
        content:
          "Official ZimbolaClux.shop (Zimbola) platform in India. Sign in with your access key for ZimbolaClux digital services, online store, and customer support.",
      },
      { property: "og:url", content: "https://zimbolaclux.shop/login" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "canonical", href: "https://zimbolaclux.shop/login" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap",
      },
      { rel: "stylesheet", href: loginCss },
      { rel: "preload", href: "/login-poster.jpg", as: "image" },
    ],
  }),
  component: LoginPage,
});

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

const cleanKey = (value: string) => value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();

/* ---- Default Pricing (synced live from /zimadmin & Neon) ---- */
const DEFAULT_SINGLE_PRICE = 99;
const DEFAULT_BULK_PRICE = 59;
const BULK_MIN = 10;
const BULK_MAX = 1000;
const BULK_PRESETS = [10, 25, 50, 100];

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const clampQty = (n: number) =>
  Math.min(BULK_MAX, Math.max(BULK_MIN, Math.round(Number.isFinite(n) ? n : BULK_MIN)));

/** Adds a Telegram deep-link start param (e.g. ?start=bulk_25) so the bot knows what was picked. */
function withStart(url: string, param: string): string {
  try {
    const u = new URL(url);
    if (!/(^|\.)t\.me$|telegram\.me$/i.test(u.hostname) || u.searchParams.has("start")) return url;
    u.searchParams.set("start", param);
    return u.toString();
  } catch {
    return url;
  }
}

function LoginPage() {
  const { reason } = Route.useSearch();
  const redeem = useServerFn(redeemAccessKey);
  const resumeSession = useServerFn(resumeDeviceSession);
  const fetchConfig = useServerFn(getPublicLoginConfig);
  const clearSession = useServerFn(clearAccessSession);

  const [key, setKey] = useState("");
  const [autoResuming, setAutoResuming] = useState(false);
  const [error, setError] = useState(() => getReasonMessage(reason));
  const [cooldown, setCooldown] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginSucceeded, setLoginSucceeded] = useState(false);
  const [buyKeyBotUrl, setBuyKeyBotUrl] = useState("https://t.me/ZimbolaKeyBot");
  const [telegramSupportUrl, setTelegramSupportUrl] = useState("https://t.me/ZimbolaSupport");
  const [telegramChannelUrl, setTelegramChannelUrl] = useState("https://t.me/ZimbolaClux");
  const [singlePrice, setSinglePrice] = useState(DEFAULT_SINGLE_PRICE);
  const [bulkPrice, setBulkPrice] = useState(DEFAULT_BULK_PRICE);
  const [shake, setShake] = useState(0);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [tgSheetOpen, setTgSheetOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [qty, setQty] = useState(BULK_MIN);
  const [qtyDraft, setQtyDraft] = useState(String(BULK_MIN));

  const videoRef = useRef<HTMLVideoElement>(null);
  const userMutedRef = useRef(false);
  const [muted, setMuted] = useState(false);

  // Auto-fill remembered key AND automatically jump to / if user never logged out
  // and their key is still active & bound to this device in Neon.
  useEffect(() => {
    const saved = getRememberedKey();
    if (saved?.key) {
      setKey((prev) => prev || saved.key);
    }

    if (reason && reason !== "none") {
      setAutoLoginEnabled(false);
      return;
    }

    if (!saved?.key || !isAutoLoginEnabled()) return;

    let active = true;
    setAutoResuming(true);

    Promise.all([
      getExistingClientDeviceIdAsync().catch(() => undefined),
      collectDeviceInfo().catch(() => undefined),
    ])
      .then(async ([savedDeviceId, deviceInfo]) => {
        const deviceFp = await computeHardwareFingerprint(deviceInfo).catch(() => undefined);
        return resumeSession({
          data: {
            key: saved.key,
            ...(savedDeviceId ? { clientDeviceId: savedDeviceId } : {}),
            ...(deviceFp ? { deviceFp } : {}),
            ...(deviceInfo ? { deviceInfo } : {}),
          },
        });
      })
      .then((res) => {
        if (!active) return;
        if (res?.ok) {
          if ("deviceId" in res && typeof res.deviceId === "string" && res.deviceId) {
            saveClientDeviceId(res.deviceId);
          }
          window.location.replace("/");
          return;
        }
        // Admin paused, deleted, removed user, or key expired -> stop auto-login & show reason
        setAutoLoginEnabled(false);
        if (res?.reason && res.reason !== "none") {
          setError(getReasonMessage(res.reason));
        }
        setAutoResuming(false);
      })
      .catch(() => {
        if (active) setAutoResuming(false);
      });

    return () => {
      active = false;
    };
  }, [reason, resumeSession]);

  useEffect(() => {
    if (reason && reason !== "none") {
      setAutoLoginEnabled(false);
      setError(getReasonMessage(reason));
      if (reason === "revoked" || reason === "expired") void clearSession();
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
        if (!active) return;
        if (cfg.buyKeyBotUrl) setBuyKeyBotUrl(cfg.buyKeyBotUrl);
        if (cfg.telegramSupportUrl) setTelegramSupportUrl(cfg.telegramSupportUrl);
        if (cfg.telegramChannelUrl) setTelegramChannelUrl(cfg.telegramChannelUrl);
        if (typeof cfg.singlePrice === "number" && cfg.singlePrice > 0) setSinglePrice(cfg.singlePrice);
        if (typeof cfg.bulkPrice === "number" && cfg.bulkPrice > 0) setBulkPrice(cfg.bulkPrice);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [fetchConfig]);

  /* ---- Background video: download into local video/mp4 Blob for zero-lag browser + APK playback with audio ---- */
  const attemptPlay = useCallback((el: HTMLVideoElement, wantAudio: boolean) => {
    const shouldUnmute = wantAudio && !userMutedRef.current;
    el.volume = 1;
    el.defaultMuted = !shouldUnmute;
    el.muted = !shouldUnmute;
    if (el.muted) {
      el.setAttribute("muted", "");
    } else {
      el.removeAttribute("muted");
    }

    const p = el.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        setMuted(el.muted);
      }).catch(() => {
        // Browser blocked unmuted autoplay -> start muted immediately so video ALWAYS shows on browser
        if (!el.muted) {
          el.defaultMuted = true;
          el.muted = true;
          el.setAttribute("muted", "");
          setMuted(true);
          const mutedPlay = el.play();
          if (mutedPlay && typeof mutedPlay.catch === "function") {
            mutedPlay.catch(() => {});
          }
        }
      });
    } else {
      setMuted(el.muted);
    }
  }, []);

  useEffect(() => {
    if (autoResuming) return;
    const v = videoRef.current;
    if (!v) return;

    let cancelled = false;
    let blobUrl: string | null = null;
    const controller = new AbortController();

    // Force inline mobile playback on both iOS Safari and Android Chrome/WebView
    v.playsInline = true;
    v.loop = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");

    const onReady = () => {
      if (cancelled) return;
      if (v.paused) {
        attemptPlay(v, !userMutedRef.current);
      }
    };

    const onEnded = () => {
      if (cancelled) return;
      try {
        v.currentTime = 0;
      } catch {
        // Ignore
      }
      attemptPlay(v, !userMutedRef.current);
    };

    const onResume = () => {
      if (cancelled) return;
      if (document.visibilityState === "visible" && v.paused) {
        attemptPlay(v, !userMutedRef.current);
      }
    };

    const removeUnlockListeners = () => {
      document.removeEventListener("pointerdown", unlockAudio, true);
      document.removeEventListener("touchend", unlockAudio, true);
      document.removeEventListener("click", unlockAudio, true);
      document.removeEventListener("keydown", unlockAudio, true);
    };

    // Keep audio ON: if strict browser autoplay forced a muted start, unmute on first valid user gesture
    // (keep listeners active until unmute actually succeeds so pointerdown rejection never breaks sound)
    const unlockAudio = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-sound-toggle]")) return;
      const el = videoRef.current;
      if (!el || userMutedRef.current) return;
      if (el.muted || el.paused) {
        el.defaultMuted = false;
        el.muted = false;
        el.removeAttribute("muted");
        el.volume = 1;
        const p = el.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            setMuted(false);
            removeUnlockListeners();
          }).catch(() => {
            // Keep video playing muted and wait for touchend/click on this same tap
            el.defaultMuted = true;
            el.muted = true;
            el.setAttribute("muted", "");
            setMuted(true);
            if (el.paused) {
              const m = el.play();
              if (m && typeof m.catch === "function") m.catch(() => {});
            }
          });
        } else {
          setMuted(false);
          removeUnlockListeners();
        }
      } else {
        removeUnlockListeners();
      }
    };

    v.addEventListener("loadedmetadata", onReady);
    v.addEventListener("loadeddata", onReady);
    v.addEventListener("canplay", onReady);
    v.addEventListener("canplaythrough", onReady);
    v.addEventListener("ended", onEnded);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("pageshow", onResume);
    document.addEventListener("pointerdown", unlockAudio, true);
    document.addEventListener("touchend", unlockAudio, true);
    document.addEventListener("click", unlockAudio, true);
    document.addEventListener("keydown", unlockAudio, true);

    // Download full MP4 once via fetch() into a typed video/mp4 Blob URL:
    // - Guarantees proper video/mp4 MIME type on all browsers (fixes browser download/blank bug)
    // - Eliminates network buffering & loop lag completely
    fetch("/login-bg.mp4", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((rawBlob) => {
        if (cancelled) return;
        const mp4Blob =
          rawBlob.type === "video/mp4"
            ? rawBlob
            : new Blob([rawBlob], { type: "video/mp4" });
        blobUrl = URL.createObjectURL(mp4Blob);
        v.src = blobUrl;
        v.load();
        attemptPlay(v, !userMutedRef.current);
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback to direct URL if fetch is blocked or unavailable
        v.src = "/login-bg.mp4";
        v.load();
        attemptPlay(v, !userMutedRef.current);
      });

    return () => {
      cancelled = true;
      controller.abort();
      v.removeEventListener("loadedmetadata", onReady);
      v.removeEventListener("loadeddata", onReady);
      v.removeEventListener("canplay", onReady);
      v.removeEventListener("canplaythrough", onReady);
      v.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("pageshow", onResume);
      removeUnlockListeners();
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [autoResuming, attemptPlay]);

  function toggleSound() {
    const v = videoRef.current;
    if (!v) return;
    const nextMuted = !v.muted;
    userMutedRef.current = nextMuted;
    v.defaultMuted = nextMuted;
    v.muted = nextMuted;
    if (nextMuted) {
      v.setAttribute("muted", "");
    } else {
      v.removeAttribute("muted");
    }
    v.volume = 1;
    setMuted(nextMuted);
    if (v.paused) {
      attemptPlay(v, !nextMuted);
    }
  }

  /* ---- Escape closes sheet / bulk ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSheetOpen(false);
      setTgSheetOpen(false);
      setBulkOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handlePaste() {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip.trim()) {
        setKey(cleanKey(clip).toUpperCase());
        setError("");
      }
    } catch {
      // Clipboard blocked (non-HTTPS or permission denied): focus the field so long-press paste works
      document.getElementById("login-key")?.focus();
    }
  }

  function fail(message: string) {
    setError(message);
    setShake((n) => n + 1);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(30);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cooldown > 0) return;
    setError("");

    const trimmedKey = cleanKey(key);
    if (!trimmedKey) {
      fail("Enter your access key.");
      return;
    }

    setIsSubmitting(true);
    try {
      const [deviceInfo, clientDeviceId] = await Promise.all([
        collectDeviceInfo().catch(() => undefined),
        getOrCreateClientDeviceIdAsync().catch(() => undefined),
      ]);
      const deviceFp = await computeHardwareFingerprint(deviceInfo).catch(() => undefined);
      const payload: {
        key: string;
        clientDeviceId?: string;
        deviceFp?: string;
        deviceInfo?: ClientDeviceInfo;
      } = { key: trimmedKey };
      if (clientDeviceId) payload.clientDeviceId = clientDeviceId;
      if (deviceFp) payload.deviceFp = deviceFp;
      if (deviceInfo) payload.deviceInfo = deviceInfo;

      const result = await redeem({ data: payload });
      if (!result || typeof result !== "object") {
        fail("Unexpected server response. Refresh and try again.");
        return;
      }
      if (!result.ok) {
        if (result.retryAfterSeconds > 0) setCooldown(result.retryAfterSeconds);
        fail(result.detail || getReasonMessage(result.reason, result.retryAfterSeconds));
        return;
      }

      if ("deviceId" in result && typeof result.deviceId === "string" && result.deviceId) {
        saveClientDeviceId(result.deviceId);
      }
      saveRememberedKey({ key: trimmedKey });
      setAutoLoginEnabled(true);
      setLoginSucceeded(true);
      window.setTimeout(() => window.location.replace("/"), 700);
    } catch (err) {
      console.error("[LoginPage] redeem failed:", err);
      const msg = err instanceof Error && err.message ? err.message : "";
      fail(msg || "Couldn't reach the server. Check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function setQuantity(n: number) {
    const q = clampQty(n);
    setQty(q);
    setQtyDraft(String(q));
  }

  function openBulk() {
    setSheetOpen(false);
    setBulkOpen(true);
  }

  const savePercent = singlePrice > 0 ? Math.max(0, Math.round((1 - bulkPrice / singlePrice) * 100)) : 0;
  const canSubmit = key.trim().length > 0 && !isSubmitting && !loginSucceeded && cooldown === 0;
  const shownError = cooldown > 0 ? `Too many attempts. Try again in ${cooldown}s.` : error;
  const singleUrl = withStart(buyKeyBotUrl, "buy_1");
  const bulkUrl = withStart(buyKeyBotUrl, `bulk_${qty}`);

  return (
    <main className="zx">
      <div className="zx-bg" aria-hidden="true">
        <video
          ref={videoRef}
          poster="/login-poster.jpg"
          autoPlay
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload noplaybackrate noremoteplayback"
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      <button
        type="button"
        data-sound-toggle
        onClick={toggleSound}
        aria-label={muted ? "Turn sound on" : "Turn sound off"}
        className="zx-sound zx-mat zx-press"
      >
        {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>

      {/* ============================ LOGIN ============================ */}
      <section className={`zx-screen zx-login ${bulkOpen ? "away" : ""}`} aria-hidden={bulkOpen}>
        <div className="zx-login-top">
          <div className="zx-col">
            <h1 className="zx-title zx-an zx-grad">Enter Access Key</h1>
            <p className="zx-sub">PhonePe Spoof For iPhone &amp; Android</p>

            <form onSubmit={handleSubmit} autoComplete="off" noValidate>
              <label key={shake} className={`zx-field ${shake ? "zx-shake" : ""}`}>
                <input
                  id="login-key"
                  name="key"
                  className="zx-mono"
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  enterKeyHint="go"
                  spellCheck={false}
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value.toUpperCase());
                    if (error && cooldown === 0) setError("");
                  }}
                  placeholder="ZIM-XXXX-XXXX"
                  aria-label="Access key"
                  aria-invalid={Boolean(shownError)}
                />
                {key ? (
                  <button
                    type="button"
                    onClick={() => setKey("")}
                    aria-label="Clear key"
                    className="zx-clear zx-press"
                  >
                    <X size={12} strokeWidth={3.5} />
                  </button>
                ) : (
                  <button type="button" onClick={() => void handlePaste()} className="zx-paste zx-an zx-press">
                    Paste
                  </button>
                )}
              </label>

              <p className="zx-err" role={shownError ? "alert" : undefined}>
                {shownError}
              </p>

              <button type="submit" disabled={!canSubmit} className="zx-btn zx-unlock zx-an zx-press">
                {isSubmitting ? (
                  <span className="zx-spin" />
                ) : cooldown > 0 ? (
                  `Wait ${cooldown}s`
                ) : (
                  "Unlock"
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="zx-col">
          <button
            type="button"
            onClick={() => {
              setTgSheetOpen(false);
              setSheetOpen(true);
            }}
            className="zx-buy zx-mat zx-press"
          >
            <Package size={22} color="#FF9AC1" />
            <span className="zx-an">Buy Keys</span>
            <span className="zx-from">
              from <b className="zx-grad">{inr(bulkPrice)}</b>
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSheetOpen(false);
              setTgSheetOpen(true);
            }}
            className="zx-tg zx-mat zx-press"
          >
            <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
              <circle cx="12" cy="12" r="12" fill="#29B6F6" />
              <path
                d="M17.34 7.42 15.2 17.5c-.16.71-.58.89-1.18.55l-3.25-2.4-1.57 1.51c-.17.17-.32.32-.66.32l.23-3.31 6.03-5.45c.26-.23-.06-.36-.41-.13l-7.45 4.69-3.21-1c-.7-.22-.71-.7.15-1.03l12.54-4.83c.58-.21 1.09.14.92 1.0z"
                fill="#fff"
              />
            </svg>
            <span className="zx-tg-txt">Telegram</span>
            <span className="zx-tg-dot">·</span>
            <span className="zx-tg-sub">Support &amp; Channel</span>
          </button>
        </div>
      </section>

      {/* ============================ BULK ============================ */}
      <section className={`zx-screen zx-bulk ${bulkOpen ? "on" : ""}`} aria-hidden={!bulkOpen}>
        <div className="zx-bulk-inner">
          <div className="zx-nav">
            <button type="button" className="zx-an" onClick={() => setBulkOpen(false)}>
              <ChevronLeft size={22} strokeWidth={2.6} />
              Back
            </button>
          </div>
          <h2 className="zx-lt zx-an zx-grad">Buy in Bulk</h2>
          <div className="zx-ls">
            <s>{inr(singlePrice)}</s> {inr(bulkPrice)} per key
            <span className="zx-save">Save {savePercent}%</span>
          </div>

          <p className="zx-lbl zx-an">Quantity</p>
          <div className="zx-grp">
            <div className="zx-row">
              <span>Keys</span>
              <input
                className="zx-qty zx-an"
                type="number"
                inputMode="numeric"
                min={BULK_MIN}
                max={BULK_MAX}
                value={qtyDraft}
                onChange={(e) => {
                  setQtyDraft(e.target.value);
                  const n = Number(e.target.value);
                  if (e.target.value !== "" && n >= BULK_MIN && n <= BULK_MAX) setQty(Math.round(n));
                }}
                onBlur={() => setQuantity(Number(qtyDraft))}
                aria-label="Number of keys"
              />
              <span className="zx-step">
                <button type="button" onClick={() => setQuantity(qty - 1)} disabled={qty <= BULK_MIN} aria-label="Fewer keys">
                  <Minus size={18} />
                </button>
                <button type="button" onClick={() => setQuantity(qty + 1)} disabled={qty >= BULK_MAX} aria-label="More keys">
                  <Plus size={18} />
                </button>
              </span>
            </div>
          </div>
          <div className="zx-chips">
            {BULK_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                className={`zx-an zx-press ${qty === n ? "on" : ""}`}
                onClick={() => setQuantity(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="zx-ft">Minimum order is {BULK_MIN} keys.</p>

          <p className="zx-lbl zx-an">Summary</p>
          <div className="zx-grp">
            <div className="zx-row">
              <span>Price per key</span>
              <span className="zx-sum-v">
                <s>{inr(singlePrice)}</s>
                <b>{inr(bulkPrice)}</b>
              </span>
            </div>
            <div className="zx-row">
              <span>You save</span>
              <span className="zx-sum-v">
                <b style={{ color: "var(--green)" }}>{inr(qty * (singlePrice - bulkPrice))}</b>
              </span>
            </div>
            <div className="zx-row" style={{ minHeight: 64 }}>
              <span style={{ fontWeight: 600 }}>Total</span>
              <span className="zx-total zx-an zx-grad">{inr(qty * bulkPrice)}</span>
            </div>
          </div>

          <div className="zx-cta">
            <a className="zx-btn zx-an zx-press" href={bulkUrl} target="_blank" rel="noopener noreferrer">
              <Send size={18} />
              Buy {qty} Keys · {inr(qty * bulkPrice)}
            </a>
          </div>
        </div>
      </section>

      {/* ============================ SHEETS DIM ============================ */}
      <div
        className={`zx-dim ${sheetOpen || tgSheetOpen ? "on" : ""}`}
        onClick={() => {
          setSheetOpen(false);
          setTgSheetOpen(false);
        }}
      />
      <div
        className={`zx-sheet ${sheetOpen ? "on" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="zx-sheet-title"
        aria-hidden={!sheetOpen}
      >
        <div className="zx-grab" />
        <h3 id="zx-sheet-title" className="zx-an zx-grad">
          Buy Keys
        </h3>
        <p>Pick how many you need.</p>
        <a className="zx-opt zx-press" href={singleUrl} target="_blank" rel="noopener noreferrer">
          <span className="zx-ic" style={{ background: "linear-gradient(135deg,#FFD3A5,#FF9AC1)" }}>
            1
          </span>
          <span>
            <span className="zx-an">1 Key</span>
            <span className="zx-d">One device · instant on Telegram</span>
          </span>
          <span className="zx-pr">{inr(singlePrice)}</span>
        </a>
        <button type="button" className="zx-opt hot zx-press" onClick={openBulk}>
          <span className="zx-ic" style={{ background: "linear-gradient(135deg,#FF9AC1,#C79BFF)" }}>
            {BULK_MIN}+
          </span>
          <span>
            <span className="zx-an">Bulk Keys</span>
            <span className="zx-d">Resell at your own price</span>
          </span>
          <span className="zx-pr">
            <small>{inr(singlePrice)}</small>
            <span className="zx-grad">{inr(bulkPrice)}</span>
          </span>
        </button>
        <div style={{ height: 8 }} />
      </div>

      {/* ============================ TELEGRAM SHEET ============================ */}
      <div
        className={`zx-sheet ${tgSheetOpen ? "on" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="zx-tg-sheet-title"
        aria-hidden={!tgSheetOpen}
      >
        <div className="zx-grab" />
        <h3 id="zx-tg-sheet-title" className="zx-an zx-grad">
          Telegram
        </h3>
        <p>Join our channel or contact support.</p>

        <a
          className="zx-opt zx-press"
          href={telegramSupportUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setTgSheetOpen(false)}
        >
          <span className="zx-ic" style={{ background: "linear-gradient(135deg,#38BDF8,#2563EB)", color: "#fff" }}>
            <Headset size={21} strokeWidth={2.2} />
          </span>
          <span>
            <span className="zx-an">Support</span>
            <span className="zx-d">Need help? Message us on Telegram</span>
          </span>
          <ChevronRight size={20} className="zx-chev" />
        </a>

        <a
          className="zx-opt hot zx-press"
          href={telegramChannelUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setTgSheetOpen(false)}
        >
          <span className="zx-ic" style={{ background: "linear-gradient(135deg,#FF9AC1,#C79BFF)", color: "#2a0e2e" }}>
            <Megaphone size={21} strokeWidth={2.2} />
          </span>
          <span>
            <span className="zx-an">Channel</span>
            <span className="zx-d">Official updates, news &amp; drops</span>
          </span>
          <ChevronRight size={20} className="zx-chev" />
        </a>
        <div style={{ height: 8 }} />
      </div>

      {autoResuming ? (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#060606] text-white"
          aria-live="polite"
        >
          <span className="zx-spin" style={{ width: 28, height: 28, borderColor: "rgba(255,255,255,0.2)", borderTopColor: "#ff9ac1" }} />
        </div>
      ) : null}

      {loginSucceeded ? (
        <div className="zx-hud">
          <div>
            <Check size={56} strokeWidth={2.6} />
            <span className="zx-an">Signed In</span>
          </div>
        </div>
      ) : null}
    </main>
  );
}
