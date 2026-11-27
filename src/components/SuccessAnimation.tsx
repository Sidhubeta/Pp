import { LottiePlayer, type LottieSegment } from "@/components/LottiePlayer";

const SUCCESS_SEGMENTS: LottieSegment[] = [
  [0, 90],
  [120, 210],
];

export function preloadSuccessAnimation(): Promise<void> {
  return fetch("/animations/confirmation_success_loader.json")
    .then(() => undefined)
    .catch(() => undefined);
}

export function SuccessAnimation({
  size = "hero",
}: {
  size?: "hero" | "intro";
}) {
  const outerClass =
    size === "intro"
      ? "h-[clamp(86px,11dvh,104px)] w-[clamp(86px,11dvh,104px)]"
      : "h-[clamp(62px,7.4dvh,76px)] w-[clamp(62px,7.4dvh,76px)]";
  const lottieClass =
    size === "intro"
      ? "h-[clamp(146px,18dvh,172px)] w-[clamp(146px,18dvh,172px)]"
      : "h-[clamp(108px,13dvh,130px)] w-[clamp(108px,13dvh,130px)]";

  return (
    <div
      className={`relative mx-auto flex shrink-0 items-center justify-center overflow-visible ${outerClass}`}
      role="img"
      aria-label="Payment successful"
    >
      <LottiePlayer
        path="/animations/confirmation_success_loader.json"
        renderer="svg"
        loop
        segments={SUCCESS_SEGMENTS}
        className={`shrink-0 ${lottieClass}`}
      />
    </div>
  );
}
