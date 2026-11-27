import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";

export type LottieSegment = [number, number];

type LottiePlayerProps = {
  path: string;
  loop?: boolean;
  renderer?: "svg" | "canvas";
  preserveAspectRatio?: string;
  segments?: LottieSegment | LottieSegment[];
  onComplete?: () => void;
  onReady?: () => void;
  className?: string;
  ariaLabel?: string;
};

export function LottiePlayer({
  path,
  loop = true,
  renderer = "svg",
  preserveAspectRatio = "xMidYMid meet",
  segments,
  onComplete,
  onReady,
  className = "",
  ariaLabel,
}: LottiePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  const onReadyRef = useRef(onReady);

  onCompleteRef.current = onComplete;
  onReadyRef.current = onReady;

  useEffect(() => {
    let disposed = false;
    let animation: AnimationItem | undefined;

    void import("lottie-web").then(({ default: lottie }) => {
      if (disposed || !containerRef.current) return;

      animation =
        renderer === "canvas"
          ? lottie.loadAnimation({
              container: containerRef.current,
              renderer: "canvas",
              loop,
              autoplay: !segments,
              path,
              rendererSettings: { preserveAspectRatio },
            })
          : lottie.loadAnimation({
              container: containerRef.current,
              renderer: "svg",
              loop,
              autoplay: !segments,
              path,
              rendererSettings: { preserveAspectRatio },
            });

      const handleReady = () => {
        if (disposed) return;
        if (segments && animation) {
          animation.playSegments(segments, true);
        }
        onReadyRef.current?.();
      };

      const handleComplete = () => {
        if (!disposed) onCompleteRef.current?.();
      };

      animation.addEventListener("DOMLoaded", handleReady);
      animation.addEventListener("complete", handleComplete);
    });

    return () => {
      disposed = true;
      animation?.destroy();
    };
  }, [path, loop, renderer, preserveAspectRatio, segments]);

  return (
    <div
      ref={containerRef}
      className={className}
      {...(ariaLabel ? { role: "img", "aria-label": ariaLabel } : {})}
    />
  );
}
