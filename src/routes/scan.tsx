import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { LottiePlayer } from "@/components/LottiePlayer";
import bhimUpiLogoDark from "@/assets/originals/logo_upi_bhim_dark.png";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "Scan any QR — Scan & Pay" },
      { name: "description", content: "Scan any QR code to pay instantly." },
      { property: "og:title", content: "Scan any QR — Scan & Pay" },
      { property: "og:description", content: "Scan any QR code to pay instantly." },
    ],
  }),
  component: ScanPage,
});

type Scanner = {
  start: (...args: unknown[]) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
  isScanning: boolean;
  scanFile: (f: File, show?: boolean) => Promise<string>;
  applyVideoConstraints: (c: MediaTrackConstraints) => Promise<void>;
};

type CameraStatus = "starting" | "active" | "prompt" | "denied" | "error";

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

async function queryCameraPermission(): Promise<PermissionState | "unknown"> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unknown";
  }
  try {
    const status = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    return status.state;
  } catch {
    return "unknown";
  }
}

function getErrorName(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    return String((err as { name?: unknown }).name ?? "");
  }
  if (typeof err === "string") {
    return err;
  }
  return "";
}

function ScanPage() {
  const navigate = useNavigate();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("starting");
  const [requestingPerm, setRequestingPerm] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraNonce, setCameraNonce] = useState(0);
  const scannerRef = useRef<Scanner | null>(null);
  const handledRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);

  const handleText = useCallback(
    (text: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      if (text.toLowerCase().startsWith("upi://")) {
        const params = new URLSearchParams(text.split("?")[1] ?? "");
        navigate({
          to: "/pay",
          search: {
            pa: params.get("pa") ?? undefined,
            pn: params.get("pn") ?? undefined,
          },
        });
        return;
      }
      setResult(text);
    },
    [navigate],
  );

  // Auto-restart live camera when user enables Camera permission in Settings and returns
  useEffect(() => {
    let permStatus: PermissionStatus | null = null;
    let active = true;

    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "camera" as PermissionName })
        .then((status) => {
          if (!active) return;
          permStatus = status;
          status.onchange = () => {
            if (!active) return;
            if (status.state === "granted") {
              setError(null);
              setCameraStatus("starting");
              setCameraNonce((n) => n + 1);
            } else if (status.state === "prompt") {
              setError(null);
              setCameraStatus("prompt");
            } else if (status.state === "denied") {
              setCameraStatus("denied");
            }
          };
        })
        .catch(() => {});
    }

    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      if (cameraStatus === "denied" || cameraStatus === "prompt" || cameraStatus === "error") {
        void queryCameraPermission().then((state) => {
          if (!active) return;
          if (state === "granted") {
            setError(null);
            setCameraStatus("starting");
            setCameraNonce((n) => n + 1);
          } else if (state === "prompt" && cameraStatus === "denied") {
            setError(null);
            setCameraStatus("prompt");
          }
        });
      }
    };

    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);

    return () => {
      active = false;
      if (permStatus) permStatus.onchange = null;
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [cameraStatus]);

  useEffect(() => {
    if (result) return;
    handledRef.current = false;
    setError(null);
    setCameraStatus("starting");
    let cancelled = false;
    let instance: Scanner | null = null;

    const safeCleanup = async (s: Scanner | null) => {
      if (!s) return;
      try {
        if (s.isScanning) {
          await s.stop();
        }
      } catch {
        // Ignore stop errors when camera was not active
      }
      try {
        s.clear();
      } catch {
        // Ignore DOM clear errors on unmount
      }
    };

    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) {
          setCameraStatus("error");
          setError("Live camera not supported here. Use Take QR Photo or Upload QR.");
        }
        return;
      }

      const initialPerm = await queryCameraPermission();
      if (cancelled) return;
      if (initialPerm === "denied") {
        setCameraStatus("denied");
        return;
      }

      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;

      const host = document.getElementById("qr-reader");
      if (host) host.innerHTML = "";

      const scanner = new Html5Qrcode("qr-reader", {
        verbose: false,
      }) as unknown as Scanner;
      instance = scanner;
      scannerRef.current = scanner;

      const onDecoded = (text: string) => {
        if (handledRef.current) return;
        void scanner
          .stop()
          .catch(() => {})
          .finally(() => {
            try {
              scanner.clear();
            } catch {
              // Ignore clear errors
            }
          });
        handleText(text);
      };

      const startWithConstraint = async (constraint: MediaTrackConstraints | string) => {
        await scanner.start(constraint, { fps: 10, disableFlip: false }, onDecoded, () => {});
      };

      const attemptStartedAt = Date.now();
      try {
        try {
          await startWithConstraint({ facingMode: "environment" });
        } catch (primaryErr) {
          const primaryName = getErrorName(primaryErr);
          const isPermErr =
            /NotAllowed|PermissionDenied|PermissionDismissed|SecurityError|denied|dismissed|permission/i.test(
              primaryName,
            ) ||
            /NotAllowed|PermissionDenied|PermissionDismissed|dismissed|permission/i.test(
              String(primaryErr),
            );
          if (isPermErr) throw primaryErr;

          await startWithConstraint({ facingMode: "user" });
        }

        if (cancelled) {
          await safeCleanup(scanner);
        } else {
          // Camera granted & live — never show any permission prompt again
          setCameraStatus("active");
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        const elapsedMs = Date.now() - attemptStartedAt;
        await safeCleanup(scanner);
        const permAfter = await queryCameraPermission();
        if (cancelled) return;

        const errStr = `${getErrorName(err)} ${String(err ?? "")}`;

        if (permAfter === "denied") {
          setCameraStatus("denied");
        } else if (permAfter === "prompt") {
          // User dismissed the popup (Back / X / outside tap) — browser can still prompt again!
          setCameraStatus("prompt");
        } else if (/NotFoundError|DevicesNotFoundError/i.test(errStr)) {
          setCameraStatus("error");
          setError("No camera found on this device. Use Upload QR below.");
        } else if (
          /PermissionDismissed/i.test(errStr) ||
          (/NotAllowed|PermissionDenied|permission/i.test(errStr) && elapsedMs >= 250)
        ) {
          // Browser showed dialog and user dismissed it (iOS/WebKit without Permissions API)
          setCameraStatus("prompt");
        } else if (/NotAllowed|PermissionDenied|SecurityError/i.test(errStr) && elapsedMs < 250) {
          // Instant rejection without dialog -> blocked or requires tap gesture
          setCameraStatus("prompt");
        } else {
          setCameraStatus("prompt");
          setError("Tap Allow Camera below to start scanning.");
        }
      }
    })();

    return () => {
      cancelled = true;
      setTorchOn(false);
      const s = instance ?? scannerRef.current;
      scannerRef.current = null;
      void safeCleanup(s);
    };
  }, [result, handleText, cameraNonce]);

  // Direct user-gesture permission request — re-triggers native browser popup
  // whenever user accidentally dismissed it, and opens camera permanently once Allowed.
  const requestCameraPermission = async () => {
    if (requestingPerm) return;
    setRequestingPerm(true);
    setError(null);
    const clickedAt = Date.now();

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus("error");
        setError("Live camera not supported here. Use Take QR Photo or Upload QR.");
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
      } catch (firstErr) {
        const msg = `${getErrorName(firstErr)} ${String(firstErr ?? "")}`;
        if (/NotAllowedError|PermissionDeniedError|PermissionDismissedError|SecurityError/i.test(msg)) {
          throw firstErr;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      // Permission granted! Release probe stream so live scanner starts cleanly.
      for (const track of stream.getTracks()) {
        track.stop();
      }
      setCameraStatus("starting");
      setCameraNonce((n) => n + 1);
    } catch (err) {
      const elapsedMs = Date.now() - clickedAt;
      const perm = await queryCameraPermission();
      const msg = `${getErrorName(err)} ${String(err ?? "")}`;

      if (perm === "prompt") {
        // Still promptable (user dismissed the popup again) — keep Allow Camera button ready!
        setCameraStatus("prompt");
        setError("Permission dismissed. Tap Allow Camera and select Allow.");
      } else if (perm === "denied") {
        // Permanently blocked by browser after Disallow / repeated dismissals
        setCameraStatus("denied");
        setError(
          isIosDevice()
            ? "Blocked by Safari/iOS. Allow Camera in Settings, or tap Take QR Photo."
            : "Blocked by Chrome/Android. Enable Camera in Site Settings / App Info, or tap Take QR Photo.",
        );
      } else if (/NotAllowed|PermissionDenied|SecurityError/i.test(msg)) {
        // Browsers without Permissions API (iOS Safari):
        // Instant rejection (<250ms) means OS/Safari permanently blocked it without showing a dialog.
        if (elapsedMs < 250) {
          setCameraStatus("denied");
          setError(
            isIosDevice()
              ? "Blocked by Safari/iOS. Allow Camera in Settings, or tap Take QR Photo."
              : "Camera is blocked in browser settings. Enable Camera or tap Take QR Photo.",
          );
        } else {
          // Dialog was shown and dismissed -> stay on Allow Camera so user can tap again
          setCameraStatus("prompt");
          setError("Permission dismissed. Tap Allow Camera and select Allow.");
        }
      } else {
        setCameraStatus("error");
        setError("Could not open live camera. Tap Take QR Photo or Upload QR.");
      }
    } finally {
      setRequestingPerm(false);
    }
  };

  const toggleTorch = async () => {
    const s = scannerRef.current;
    if (!s?.isScanning) return;
    try {
      await s.applyVideoConstraints({
        advanced: [{ torch: !torchOn } as MediaTrackConstraintSet],
      });
      setTorchOn((prev) => !prev);
      setError(null);
    } catch {
      setError("Torch is not supported on this device.");
    }
  };

  const scanQrImageFile = async (file: File) => {
    setError(null);
    try {
      let s = scannerRef.current;
      if (!s) {
        const { Html5Qrcode } = await import("html5-qrcode");
        s = new Html5Qrcode("qr-reader", { verbose: false }) as unknown as Scanner;
        scannerRef.current = s;
      }
      if (s.isScanning) {
        await s.stop().catch(() => {});
      }
      const text = await s.scanFile(file, false);
      handleText(text);
    } catch {
      setError("No QR code found in this photo. Try again with a clearer shot.");
      if (cameraStatus === "active") {
        setCameraNonce((n) => n + 1);
      }
    }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await scanQrImageFile(file);
  };

  const ios = isIosDevice();
  const showPermissionCard =
    !result && (cameraStatus === "prompt" || cameraStatus === "denied" || cameraStatus === "error");

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#121212] text-white">
      <style>{`
        #qr-reader {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          border: 0 !important;
          overflow: hidden !important;
        }
        #qr-reader video {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
        #qr-reader__scan_region {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          min-height: 100% !important;
        }
        #qr-reader__scan_region > img,
        #qr-reader__dashboard,
        #qr-shaded-region {
          display: none !important;
        }
      `}</style>

      {/* Camera video layer */}
      <div id="qr-reader" className="absolute inset-0 h-full w-full" />

      {/* UI overlay */}
      <div className="relative z-10 mx-auto flex h-full w-full max-w-[430px] flex-col justify-between px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 sm:pt-10">
        <header className="relative z-20 flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-5">
            <button
              type="button"
              aria-label="Back"
              onClick={() => navigate({ to: "/" })}
              className="rounded-full p-1 transition-colors hover:bg-white/10"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-[16px] font-semibold">Scan any QR</h1>
          </div>
          <button
            type="button"
            aria-label="Help"
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-sm font-bold"
          >
            ?
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-4">
          {/* Clean viewfinder window with spotlight dim cutout */}
          <div className="relative aspect-square w-[min(78vw,300px,42dvh)] rounded-[22px] shadow-[0_0_0_9999px_rgba(0,0,0,0.52)]">
            {!result && !showPermissionCard && (
              <LottiePlayer
                path="/animations/qr_scanning.json"
                renderer="svg"
                loop
                className="pointer-events-none absolute -inset-2.5 h-[calc(100%+20px)] w-[calc(100%+20px)]"
                ariaLabel="Scanning QR code"
              />
            )}

            {showPermissionCard && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-[22px] border border-white/15 bg-[#18161c]/95 px-4 py-3 text-center backdrop-blur-md">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#8a3ffc]/20 text-[#c084fc]">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>

                <p className="text-[13.5px] font-semibold leading-tight text-white">
                  {cameraStatus === "denied" ? "Camera Permission Blocked" : "Allow Camera Access"}
                </p>

                {cameraStatus === "denied" ? (
                  <p className="text-[10.5px] leading-snug text-white/70">
                    {ios
                      ? "Phone blocked live camera. Enable in Settings → Safari → Camera, or snap a QR photo below."
                      : "Browser blocked live camera. Enable in App Info / Chrome Site Settings → Camera, or snap a QR photo below."}
                  </p>
                ) : (
                  <p className="text-[11px] leading-snug text-white/70">
                    Tap below to allow camera permission for live QR scanning.
                  </p>
                )}

                {cameraStatus === "denied" ? (
                  <div className="mt-0.5 flex w-full flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => captureRef.current?.click()}
                      className="w-full rounded-full bg-[#8a3ffc] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-opacity active:opacity-80"
                    >
                      Take QR Photo (Camera)
                    </button>
                    <button
                      type="button"
                      disabled={requestingPerm}
                      onClick={() => void requestCameraPermission()}
                      className="w-full rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[11.5px] font-medium text-white/90 transition-opacity active:opacity-80 disabled:opacity-60"
                    >
                      {requestingPerm ? "Checking..." : "I Enabled Camera — Retry"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={requestingPerm}
                    onClick={() => void requestCameraPermission()}
                    className="mt-1 w-full rounded-full bg-[#8a3ffc] px-4 py-2 text-[13px] font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-60"
                  >
                    {requestingPerm ? "Requesting..." : "Allow Camera"}
                  </button>
                )}
              </div>
            )}

            {result && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[22px] bg-black/75 p-6 text-center backdrop-blur-sm">
                <p className="break-all text-sm">{result}</p>
                <button
                  type="button"
                  onClick={() => {
                    handledRef.current = false;
                    setResult(null);
                  }}
                  className="rounded-full bg-[#8a3ffc] px-4 py-2 text-sm font-medium"
                >
                  Scan again
                </button>
              </div>
            )}
          </div>

          <div className="relative z-20 mt-9 flex gap-16 sm:mt-10 sm:gap-20">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center gap-2"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-xs transition-colors active:bg-white/35">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="4" y="4" width="16" height="16" rx="1" />
                  <path d="M7 16l3-4 2 2 2-3 3 5z" fill="currentColor" />
                </svg>
              </span>
              <span className="text-[13px] font-medium">Upload QR</span>
            </button>
            <button
              type="button"
              onClick={toggleTorch}
              className="flex flex-col items-center gap-2"
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-full backdrop-blur-xs transition-colors ${
                  torchOn ? "bg-white/50" : "bg-white/20 active:bg-white/35"
                }`}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 3h10v4l-2 3v11H9V10L7 7z" />
                  <path d="M12 13v2" />
                </svg>
              </span>
              <span className="text-[13px] font-medium">Torch</span>
            </button>
          </div>

          {error && (
            <p className="relative z-20 mt-3 max-w-[320px] rounded-2xl bg-black/60 px-4 py-1.5 text-center text-xs text-red-300">
              {error}
            </p>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
          <input
            ref={captureRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onUpload}
          />
        </div>

        <div className="relative z-20 flex shrink-0 items-center justify-center pb-2">
          <img
            src={bhimUpiLogoDark}
            alt="BHIM UPI"
            className="h-7 w-auto select-none object-contain opacity-90"
            draggable={false}
          />
        </div>
      </div>
    </main>
  );
}
