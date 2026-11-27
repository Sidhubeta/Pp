let sharedAudio: HTMLAudioElement | null = null;

function getPaymentAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!sharedAudio) {
    sharedAudio = new Audio("/sounds/paym.mp3");
    sharedAudio.preload = "auto";
  }
  return sharedAudio;
}

/**
 * Call inside a direct user click/tap handler (e.g. pressing Pay on /pin)
 * so mobile Safari/Chrome unlocks audio playback for the subsequent
 * payment confirmation tick after "Connecting Securely".
 */
export function unlockPaymentSound(): void {
  const audio = getPaymentAudio();
  if (!audio) return;
  try {
    audio.muted = true;
    const p = audio.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      }).catch(() => {
        audio.muted = false;
      });
    } else {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
    }
  } catch {
    audio.muted = false;
  }
}

export function playPaymentSuccessSound(): void {
  const audio = getPaymentAudio();
  if (!audio) return;
  try {
    audio.muted = false;
    audio.volume = 1;
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch {
    // Ignore playback errors if blocked by browser policy
  }
}
