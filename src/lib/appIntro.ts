// Session-level flag so the full-screen launch intro plays once per app open.
let appIntroPlayed = false;

export function shouldPlayAppIntro() {
  return !appIntroPlayed;
}

export function markAppIntroPlayed() {
  appIntroPlayed = true;
}
