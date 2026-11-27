import { useEffect, useState } from "react";
import { LottiePlayer } from "@/components/LottiePlayer";
import { markAppIntroPlayed, shouldPlayAppIntro } from "@/lib/appIntro";

export function AppIntroSplash() {
  const [visible, setVisible] = useState(() => shouldPlayAppIntro());
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    markAppIntroPlayed();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Safety fallback so slow devices never stay stuck on splash
    const safety = window.setTimeout(() => {
      setFading(true);
      window.setTimeout(() => setVisible(false), 320);
    }, 2600);

    return () => {
      window.clearTimeout(safety);
      document.body.style.overflow = prevOverflow;
    };
  }, [visible]);

  if (!visible) return null;

  const finish = () => {
    setFading(true);
    window.setTimeout(() => setVisible(false), 320);
  };

  return (
    <div
      className={`fixed inset-0 z-[100] flex h-dvh w-full items-center justify-center overflow-hidden bg-[#0d0d0d] transition-opacity duration-300 ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="h-dvh w-full max-w-[430px] overflow-hidden bg-[#0d0d0d]">
        <LottiePlayer
          path="/animations/intro.json"
          renderer="canvas"
          loop={false}
          preserveAspectRatio="xMidYMid slice"
          onComplete={finish}
          className="h-full w-full"
          ariaLabel="App launch intro"
        />
      </div>
    </div>
  );
}
