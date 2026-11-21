import { useEffect, useRef, useState } from "react";
import type { AnimationItem } from "lottie-web";

type LottieData = Record<string, unknown> & {
  layers?: unknown[];
};

let greentickPromise: Promise<LottieData> | null = null;

export function preloadSuccessAnimation(): Promise<LottieData> {
  if (!greentickPromise) {
    greentickPromise = fetch("/animations/greentickmove.json").then((res) => {
      if (!res.ok) throw new Error("Failed to load greentickmove.json");
      return res.json() as Promise<LottieData>;
    });
  }
  return greentickPromise;
}

// Share heavy embedded image assets by reference while cloning lightweight layers
function cloneForInstance(data: LottieData): LottieData {
  return {
    ...data,
    layers: data.layers ? structuredClone(data.layers) : [],
  };
}

export function SuccessAnimation() {
  const container = useRef<HTMLDivElement>(null);
  const [animationReady, setAnimationReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let animation: AnimationItem | undefined;

    void Promise.all([import("lottie-web"), preloadSuccessAnimation()])
      .then(([{ default: lottie }, data]) => {
        if (disposed || !container.current) return;
        animation = lottie.loadAnimation({
          container: container.current,
          renderer: "canvas",
          loop: true,
          autoplay: true,
          animationData: cloneForInstance(data),
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        });
        const onReady = () => {
          if (!disposed) setAnimationReady(true);
        };
        animation.addEventListener("DOMLoaded", onReady);
      })
      .catch(() => {
        // Fallback static tick remains visible if fetch fails.
      });

    return () => {
      disposed = true;
      animation?.destroy();
    };
  }, []);

  return (
    <div
      className="relative mx-auto h-[72px] w-[72px]"
      role="img"
      aria-label="Payment successful"
    >
      {/* Static tick shown instantly while the animation JSON loads */}
      <div
        aria-hidden={animationReady}
        className={`absolute left-1/2 top-1/2 flex h-[126px] w-[126px] -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-opacity duration-300 ${
          animationReady ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <svg className="h-[72px] w-[72px]" viewBox="0 0 74 74" fill="none">
          <circle cx="37" cy="37" r="37" fill="white" />
          <path
            d="M22 38.5L32.5 49L53 27"
            stroke="#2D7D4E"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div
        ref={container}
        className="absolute left-1/2 top-1/2 h-[126px] w-[126px] -translate-x-1/2 -translate-y-1/2"
      />
    </div>
  );
}
