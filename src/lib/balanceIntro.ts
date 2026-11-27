// Session-level flag for the balance-fetching loader between /balance-pin and /balance-success.
let balanceIntroPlayed = true;

export function shouldPlayBalanceIntro() {
  return !balanceIntroPlayed;
}

export function markBalanceIntroPlayed() {
  balanceIntroPlayed = true;
}

export function resetBalanceIntro() {
  balanceIntroPlayed = false;
}
