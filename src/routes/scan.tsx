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

function ScanPage() {
  const navigate = useNavigate();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraNonce, setCameraNonce] = useState(0);
  const scannerRef = useRef<Scanner | null>(null);
  const handledRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (result) return;
    handledRef.current = false;
    setError(null);
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
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;

      const host = document.getElementById("qr-reader");
      if (host) host.innerHTML = "";

      const scanner = new Html5Qrcode("qr-reader", {
        verbose: false,
      }) as unknown as Scanner;
      instance = scanner;
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, disableFlip: false },
          (text: string) => {
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
          },
          () => {},
        );
        if (cancelled) {
          await safeCleanup(scanner);
        }
      } catch {
        if (!cancelled) {
          setError("Camera access was blocked or no camera found.");
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

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
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
      setError("No QR code found in this image.");
      setCameraNonce((n) => n + 1);
    }
  };

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
          <div className="relative aspect-square w-[min(74vw,286px,40dvh)] rounded-[22px] shadow-[0_0_0_9999px_rgba(0,0,0,0.52)]">
            {!result && (
              <LottiePlayer
                path="/animations/qr_scanning.json"
                renderer="svg"
                loop
                className="pointer-events-none absolute -inset-2.5 h-[calc(100%+20px)] w-[calc(100%+20px)]"
                ariaLabel="Scanning QR code"
              />
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
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                  <path d="M7 3h10v4l-2 3v11H9V10L7 7z" />
                  <path d="M12 13v2" />
                </svg>
              </span>
              <span className="text-[13px] font-medium">Torch</span>
            </button>
          </div>

          {error && (
            <p className="relative z-20 mt-3 rounded-full bg-black/50 px-4 py-1 text-center text-xs text-red-300">
              {error}
            </p>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
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
