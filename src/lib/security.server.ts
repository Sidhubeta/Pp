import { getRequest } from "@tanstack/react-start/server";
import type { NeonQueryFunction } from "@neondatabase/serverless";

export type TrustedProxyMode = "cloudflare" | "railway" | "none";

const LICENSE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars (exact divisor of 256 -> unbiased)
const AUDIT_FLOOD_MAX_PER_WINDOW = 30;
const AUDIT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run 90-day purge at most once per hour per instance
let lastAuditCleanupAt = 0;

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Generates a cryptographically strong random license key with 12 random characters
 * grouped as ZIM-XXXX-XXXX-XXXX using crypto.getRandomValues (60 bits of entropy).
 */
export function generateRandomLicenseKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let chars = "";
  for (let i = 0; i < bytes.length; i += 1) {
    chars += LICENSE_ALPHABET[(bytes[i] ?? 0) & 31];
  }
  return `ZIM-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/**
 * Normalizes a license key pasted from Telegram/WhatsApp by stripping invisible
 * zero-width chars, quotes, backticks, and extra whitespace.
 */
export function normalizeLicenseKey(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF\u00A0`"'\r\n\t]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toUpperCase();
}

/**
 * Constant-time, case-sensitive secret comparison using a random per-call HMAC key
 * so neither string length nor timing leaks information.
 */
export async function constantTimeSecretMatch(
  candidate: string,
  expected: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const nonceKey = crypto.getRandomValues(new Uint8Array(32));
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    nonceKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign("HMAC", hmacKey, encoder.encode(candidate)),
    crypto.subtle.sign("HMAC", hmacKey, encoder.encode(expected)),
  ]);
  const bytesA = new Uint8Array(sigA);
  const bytesB = new Uint8Array(sigB);
  if (bytesA.length !== bytesB.length) return false;
  let diff = 0;
  for (let i = 0; i < bytesA.length; i += 1) {
    diff |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0);
  }
  return diff === 0;
}

function getRawSessionSecret(): string {
  const raw = process.env["ACCESS_SESSION_SECRET"]?.trim();
  if (!raw || raw.length < 8) {
    throw new Error("ACCESS_SESSION_SECRET is not configured.");
  }
  return raw;
}

/**
 * Always returns a valid 64-char hex password for TanStack/h3 useSession.
 */
export async function deriveSessionPassword(purpose: "user" | "admin"): Promise<string> {
  return sha256Hex(`zimbola:session:${purpose}:v2:${getRawSessionSecret()}`);
}

export function getTrustedProxyMode(): TrustedProxyMode {
  const raw = (process.env["TRUSTED_PROXY"] ?? "none").trim().toLowerCase();
  if (raw === "cloudflare") return "cloudflare";
  if (raw === "railway" || raw === "vercel" || raw === "proxy") return "railway";
  return "none";
}

export function isRequestSecure(req?: Request | null): boolean {
  const activeReq = req ?? safeGetRequest();
  if (!activeReq) return false;
  try {
    const parsed = new URL(activeReq.url);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return parsed.protocol === "https:";
    }
    const forwardedProto = activeReq.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    if (forwardedProto === "https") return true;
    if (forwardedProto === "http") return false;
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function safeGetRequest(): Request | null {
  try {
    return getRequest() ?? null;
  } catch {
    return null;
  }
}

export async function buildSessionCookieConfig(purpose: "user" | "admin") {
  const password = await deriveSessionPassword(purpose);
  const secure = isRequestSecure();
  // Admin session capped at 4h; user session stays within Chromium's 400-day limit
  const maxAge = purpose === "admin" ? 60 * 60 * 4 : 60 * 60 * 24 * 180;
  return {
    password,
    name: purpose === "admin" ? "zimbola-admin-sess" : "zimbola-access-sess",
    maxAge,
    cookie: {
      httpOnly: true,
      secure,
      sameSite: "lax" as const,
      path: "/",
      // Explicitly set maxAge on cookie options so h3/Nitro always emits Max-Age
      // (persistent cookie that survives browser/PWA/app restarts).
      maxAge,
    },
  };
}

function normalizeIpString(raw: string | null | undefined): string {
  if (!raw) return "unknown";
  const cleaned = raw.trim().replace(/^::ffff:/i, "");
  if (!cleaned) return "unknown";
  return cleaned.slice(0, 64);
}

function extractSocketRemoteAddress(req: Request): string | null {
  try {
    const r = req as unknown as {
      ip?: unknown;
      remoteAddress?: unknown;
      socket?: { remoteAddress?: unknown };
      connection?: { remoteAddress?: unknown };
      node?: { req?: { socket?: { remoteAddress?: unknown } } };
      runtime?: { node?: { req?: { socket?: { remoteAddress?: unknown } } } };
    };
    const candidates = [
      r.runtime?.node?.req?.socket?.remoteAddress,
      r.node?.req?.socket?.remoteAddress,
      r.socket?.remoteAddress,
      r.connection?.remoteAddress,
      r.remoteAddress,
      r.ip,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  } catch {
    // Ignore runtime-specific inspection errors
  }
  return null;
}

export function extractClientMeta(req?: Request | null): {
  ip: string;
  ua: string | null;
  deviceSignatureInput: string;
} {
  const activeReq = req ?? safeGetRequest();
  if (!activeReq?.headers) {
    return { ip: "unknown", ua: null, deviceSignatureInput: "unknown" };
  }

  const proxyMode = getTrustedProxyMode();
  let ip = "unknown";

  if (proxyMode === "cloudflare") {
    // Trust ONLY cf-connecting-ip when explicitly behind Cloudflare
    ip = normalizeIpString(activeReq.headers.get("cf-connecting-ip"));
  } else if (proxyMode === "railway") {
    // Trust ONLY the rightmost x-forwarded-for entry appended by the reverse proxy
    const xff = activeReq.headers.get("x-forwarded-for");
    const parts = xff
      ? xff
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
      : [];
    ip = normalizeIpString(parts.length > 0 ? parts[parts.length - 1] : null);
  } else {
    // Direct connection: ignore all client-spoofable forwarding headers; use socket remote address only
    ip = normalizeIpString(extractSocketRemoteAddress(activeReq));
  }

  const ua = activeReq.headers.get("user-agent")?.slice(0, 500) ?? null;

  // Coarse OS + browser family signature so browser minor-version auto-updates
  // do NOT falsely log users out, while copying a cookie to another device/OS fails.
  const uaStr = ua ?? "";
  let osFamily = "other";
  if (/iPhone|iPad|iPod/i.test(uaStr)) osFamily = "ios";
  else if (/Android/i.test(uaStr)) osFamily = "android";
  else if (/Mac OS X/i.test(uaStr)) osFamily = "macos";
  else if (/Windows/i.test(uaStr)) osFamily = "windows";
  else if (/Linux/i.test(uaStr)) osFamily = "linux";

  let engine = "other";
  if (/Edg\//i.test(uaStr)) engine = "edge";
  else if (/Firefox\//i.test(uaStr)) engine = "firefox";
  else if (/Chrome\//i.test(uaStr)) engine = "chromium";
  else if (/Safari\//i.test(uaStr)) engine = "webkit";

  // Use only stable User-Agent OS + browser engine family (never sec-ch-ua-platform,
  // which mobile browsers/PWAs often omit on cold GET navigations vs POST fetches).
  return {
    ip,
    ua,
    deviceSignatureInput: `${osFamily}|${engine}`,
  };
}

export async function computeDeviceSignatureHash(req?: Request | null): Promise<string> {
  const { deviceSignatureInput } = extractClientMeta(req);
  return sha256Hex(`zimbola:devsig:${deviceSignatureInput}`);
}

export function generateRandomTokenHex(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// AES-256-GCM encryption for storing license keys securely at rest
// ---------------------------------------------------------------------------
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`zimbola:aes-key:v1:${getRawSessionSecret()}`),
  );
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptKeyForStorage(plainKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await getEncryptionKey();
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    new TextEncoder().encode(plainKey),
  );
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(cipherBuf))}`;
}

export async function decryptStoredKey(encrypted: string | null): Promise<string | null> {
  if (!encrypted) return null;
  if (!encrypted.startsWith("v1:")) return encrypted;
  try {
    const parts = encrypted.split(":");
    if (parts.length !== 3 || !parts[1] || !parts[2]) return null;
    const iv = base64ToBytes(parts[1]);
    const cipherBytes = base64ToBytes(parts[2]);
    const cryptoKey = await getEncryptionKey();
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      cipherBytes,
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Distributed Rate Limiter (PostgreSQL / Neon backed — FAILS CLOSED on DB error)
// ---------------------------------------------------------------------------
export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

export async function checkRateLimit(
  sql: NeonQueryFunction<false, false>,
  bucket: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const rows = (await sql`
      SELECT attempts, window_start, blocked_until
      FROM public.rate_limits
      WHERE bucket = ${bucket}
      LIMIT 1
    `) as { attempts: number; window_start: string; blocked_until: string | null }[];

    const row = rows[0];
    if (!row) {
      return { allowed: true, retryAfterSeconds: 0, remaining: maxAttempts };
    }

    const now = Date.now();
    if (row.blocked_until) {
      const blockedMs = new Date(row.blocked_until).getTime();
      if (blockedMs > now) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((blockedMs - now) / 1000)),
          remaining: 0,
        };
      }
    }

    const windowStartMs = new Date(row.window_start).getTime();
    if (now - windowStartMs > windowSeconds * 1000) {
      return { allowed: true, retryAfterSeconds: 0, remaining: maxAttempts };
    }

    const remaining = Math.max(0, maxAttempts - Number(row.attempts));
    if (remaining === 0) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowStartMs + windowSeconds * 1000 - now) / 1000),
      );
      return { allowed: false, retryAfterSeconds, remaining: 0 };
    }

    return { allowed: true, retryAfterSeconds: 0, remaining };
  } catch (err) {
    console.error("[checkRateLimit] DB error (failing closed):", err);
    return { allowed: false, retryAfterSeconds: 30, remaining: 0 };
  }
}

export async function recordFailedAttempt(
  sql: NeonQueryFunction<false, false>,
  bucket: string,
  maxAttempts: number,
  windowSeconds: number,
  blockSeconds: number,
): Promise<RateLimitResult> {
  try {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const rows = (await sql`
      SELECT attempts, window_start
      FROM public.rate_limits
      WHERE bucket = ${bucket}
      LIMIT 1
    `) as { attempts: number; window_start: string }[];

    const existing = rows[0];
    const isFreshWindow =
      !existing || now - new Date(existing.window_start).getTime() > windowSeconds * 1000;

    const nextAttempts = isFreshWindow ? 1 : Number(existing.attempts) + 1;
    const nextWindowStart = isFreshWindow ? nowIso : existing.window_start;
    const blockedUntil =
      nextAttempts >= maxAttempts ? new Date(now + blockSeconds * 1000).toISOString() : null;

    await sql`
      INSERT INTO public.rate_limits (bucket, attempts, window_start, blocked_until)
      VALUES (${bucket}, ${nextAttempts}, ${nextWindowStart}::timestamptz, ${blockedUntil}::timestamptz)
      ON CONFLICT (bucket) DO UPDATE SET
        attempts = EXCLUDED.attempts,
        window_start = EXCLUDED.window_start,
        blocked_until = EXCLUDED.blocked_until
    `;

    return {
      allowed: nextAttempts < maxAttempts,
      retryAfterSeconds: blockedUntil ? blockSeconds : 0,
      remaining: Math.max(0, maxAttempts - nextAttempts),
    };
  } catch (err) {
    console.error("[recordFailedAttempt] DB error (failing closed):", err);
    return { allowed: false, retryAfterSeconds: 30, remaining: 0 };
  }
}

export async function clearRateLimit(
  sql: NeonQueryFunction<false, false>,
  bucket: string,
): Promise<void> {
  try {
    await sql`DELETE FROM public.rate_limits WHERE bucket = ${bucket}`;
  } catch {
    // Ignore cleanup errors
  }
}

// ---------------------------------------------------------------------------
// Security Audit Logger (Flood-capped + 90-day automatic retention cleanup)
// ---------------------------------------------------------------------------
export async function logAuditEvent(
  sql: NeonQueryFunction<false, false>,
  params: {
    eventType: string;
    actor: "user" | "admin" | "bot" | "system";
    severity?: "info" | "warn" | "danger";
    keyId?: string | null;
    summary: string;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  try {
    const normalizedIp = params.ip ?? null;

    // Prevent DB flooding: skip inserting the same eventType + ip more than 30 times per 10 minutes
    const recentRows = (await sql`
      SELECT COUNT(*)::int AS cnt
      FROM public.audit_logs
      WHERE event_type = ${params.eventType}
        AND ip IS NOT DISTINCT FROM ${normalizedIp}
        AND created_at > now() - interval '10 minutes'
    `) as { cnt: number }[];

    if (Number(recentRows[0]?.cnt ?? 0) >= AUDIT_FLOOD_MAX_PER_WINDOW) {
      return;
    }

    await sql`
      INSERT INTO public.audit_logs (event_type, actor, severity, key_id, summary, ip, user_agent)
      VALUES (
        ${params.eventType},
        ${params.actor},
        ${params.severity ?? "info"},
        ${params.keyId ?? null}::uuid,
        ${params.summary.slice(0, 300)},
        ${normalizedIp},
        ${params.userAgent ? params.userAgent.slice(0, 300) : null}
      )
    `;

    // Periodically prune audit logs older than 90 days (at most once per hour per instance)
    const now = Date.now();
    if (now - lastAuditCleanupAt >= AUDIT_CLEANUP_INTERVAL_MS) {
      lastAuditCleanupAt = now;
      await sql`
        DELETE FROM public.audit_logs
        WHERE created_at < now() - interval '90 days'
      `;
    }
  } catch {
    // Never let audit logging break primary auth flows
  }
}

function cleanServerVersion(raw: string | null | undefined): string {
  const v = (raw ?? "").replace(/^"|"$/g, "").trim().replace(/_/g, ".");
  if (!v || /^0+(?:\.0+)*$/.test(v)) return "";
  const parts = v.split(".").filter(Boolean);
  while (parts.length > 1 && parts[parts.length - 1] === "0") {
    parts.pop();
  }
  return parts.join(".");
}

export function extractServerDeviceHints(
  uaOverride?: string | null,
  req?: Request | null,
): { deviceName?: string; osVersion?: string; os?: string; browser?: string } {
  const activeReq = req ?? safeGetRequest();
  const ua = (uaOverride ?? activeReq?.headers.get("user-agent") ?? "").trim();
  const chModel = (activeReq?.headers.get("sec-ch-ua-model") ?? "").replace(/^"|"$/g, "").trim();
  const chPlatform = (activeReq?.headers.get("sec-ch-ua-platform") ?? "").replace(/^"|"$/g, "").trim();
  const chPlatformVer = cleanServerVersion(activeReq?.headers.get("sec-ch-ua-platform-version"));

  let os: string | undefined;
  if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua) || chPlatform.toLowerCase() === "android") os = "Android";
  else if (/Mac OS X/i.test(ua) || chPlatform.toLowerCase() === "macos") os = "macOS";
  else if (/Windows/i.test(ua) || chPlatform.toLowerCase() === "windows") os = "Windows";
  else if (/Linux/i.test(ua) || chPlatform.toLowerCase() === "linux") os = "Linux";

  let browser: string | undefined;
  if (/EdgA?\/|EdgiOS\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|OPT\//i.test(ua)) browser = "Opera";
  else if (/SamsungBrowser\//i.test(ua)) browser = "Samsung Internet";
  else if (/CriOS\//i.test(ua) || (/Chrome\//i.test(ua) && !/Edg\//i.test(ua))) browser = "Chrome";
  else if (/FxiOS\//i.test(ua) || /Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";

  let deviceName: string | undefined;
  let osVersion: string | undefined;

  if (os === "Android") {
    if (chModel && chModel !== "K") {
      deviceName = chModel.slice(0, 80);
    } else {
      const parenMatch = /\(([^)]+)\)/.exec(ua);
      if (parenMatch?.[1]) {
        const tokens = parenMatch[1].split(";").map((s) => s.trim()).filter(Boolean);
        const androidIdx = tokens.findIndex((t) => /^Android\b/i.test(t));
        if (androidIdx >= 0) {
          for (let i = androidIdx + 1; i < tokens.length; i += 1) {
            const candidate = (tokens[i] ?? "")
              .replace(/\s+Build\/.*$/i, "")
              .replace(/\s+MIUI\/.*$/i, "")
              .trim();
            if (
              !candidate ||
              candidate === "K" ||
              candidate.toLowerCase() === "wv" ||
              candidate.toLowerCase() === "mobile" ||
              candidate.toLowerCase() === "linux" ||
              candidate.toLowerCase() === "u" ||
              /^[a-z]{2}(?:-[a-z]{2})?$/i.test(candidate)
            ) {
              continue;
            }
            deviceName = candidate.slice(0, 80);
            break;
          }
        }
      }
    }
    const verMatch = /Android\s+([0-9]+(?:\.[0-9]+){0,2})/i.exec(ua);
    const ver = chPlatformVer || cleanServerVersion(verMatch?.[1]);
    osVersion = ver ? `Android ${ver}` : "Android";
  } else if (os === "iOS") {
    deviceName = /iPad/i.test(ua) ? "iPad" : /iPod/i.test(ua) ? "iPod" : "iPhone";
    const iosMatch = /OS\s+(\d+(?:_\d+){0,2})/i.exec(ua);
    const ver = cleanServerVersion(iosMatch?.[1]);
    osVersion = ver ? `iOS ${ver}` : "iOS";
  } else if (os === "macOS") {
    deviceName = "Mac";
    const macMatch = /Mac OS X\s+(\d+(?:[._]\d+){0,2})/i.exec(ua);
    const ver = chPlatformVer || cleanServerVersion(macMatch?.[1]);
    osVersion = ver ? `macOS ${ver}` : "macOS";
  } else if (os === "Windows") {
    deviceName = "Windows PC";
    if (chPlatformVer) {
      const major = Number(chPlatformVer.split(".")[0]);
      if (Number.isFinite(major) && major >= 13) osVersion = "Windows 11";
      else if (Number.isFinite(major) && major >= 1) osVersion = "Windows 10";
      else osVersion = "Windows";
    } else {
      osVersion = /Windows NT 10\.0/i.test(ua) ? "Windows 10/11" : "Windows";
    }
  } else if (os === "Linux") {
    deviceName = "Linux PC";
    osVersion = "Linux";
  }

  return { deviceName, osVersion, os, browser };
}

export function readCookieFromRequest(name: string, req?: Request | null): string | null {
  const activeReq = req ?? safeGetRequest();
  const header = activeReq?.headers?.get("cookie");
  if (!header) return null;
  const parts = header.split(";");
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) {
      try {
        const val = decodeURIComponent(part.slice(eq + 1).trim());
        return val || null;
      } catch {
        return part.slice(eq + 1).trim() || null;
      }
    }
  }
  return null;
}
