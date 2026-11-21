export const DEFAULT_BUY_KEY_BOT_URL = "https://t.me/ZimbolaKeyBot";

export function normalizeBotUrl(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return DEFAULT_BUY_KEY_BOT_URL;
  if (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("tg://")
  ) {
    return trimmed;
  }
  const cleanHandle = trimmed.replace(/^@+/, "");
  return `https://t.me/${cleanHandle}`;
}
