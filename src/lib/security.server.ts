import { getRequest } from "@tanstack/react-start/server";
import type { NeonQueryFunction } from "@neondatabase/serverless";

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
 * Always returns a valid 64-char hex password for TanStack/h3 useSession (which
 * strictly requires >= 32 chars), even if the user provided a shorter env value.
 */
export async function deriveSessionPassword(purpose: "user" | "admin"): Promise<string> {
  return sha256Hex(`zimbola:session:${purpose}:v2:${getRawSessionSecret()}`);
}

export function isRequestSecure(req?: Request | null): boolean {
  const activeReq = req ?? safeGetRequest();
  if (!activeReq) return process.env["NODE_ENV"] === "production";
  const forwardedProto = activeReq.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedProto) return forwardedProto === "https";
  try {
    return new URL(activeReq.url).protocol === "https:";
  } catch {
    return process.env["NODE_ENV"] === "production";
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
  return {
    password,
    name: purpose === "admin" ? "zimbola-admin-sess" : "zimbola-access-sess",
    // Keep within Chromium's 400-day cookie limit so cookies are never rejected or silently clamped
    maxAge: purpose === "admin" ? 60 * 60 * 12 : 60 * 60 * 24 * 180,
    cookie: {
      httpOnly: true,
      secure,
      // SameSite=Lax works reliably on iOS Safari, Chrome, Firefox, and local HTTP preview
      // while defending against cross-site CSRF.
      sameSite: "lax" as const,
      path: "/",
    },
  };
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
  const ip =
    activeReq.headers.get("cf-connecting-ip")?.trim() ||
    activeReq.headers.get("x-real-ip")?.trim() ||
    activeReq.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const ua = activeReq.headers.get("user-agent")?.slice(0, 500) ?? null;

  // Coarse OS + browser family signature so browser minor-version auto-updates
  // do NOT falsely log users out, while copying a cookie to another device/OS fails!
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

  const secPlatform = activeReq.headers.get("sec-ch-ua-platform")?.replace(/"/g, "").toLowerCase() ?? "";
  return {
    ip: ip.slice(0, 64),
    ua,
    deviceSignatureInput: `${osFamily}|${engine}|${secPlatform}`,
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
// Distributed Rate Limiter (PostgreSQL / Neon backed)
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
  } catch {
    // Do not break login if rate_limits table has a transient error
    return { allowed: true, retryAfterSeconds: 0, remaining: maxAttempts };
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
  } catch {
    return { allowed: true, retryAfterSeconds: 0, remaining: maxAttempts };
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
// Security Audit Logger
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
    await sql`
      INSERT INTO public.audit_logs (event_type, actor, severity, key_id, summary, ip, user_agent)
      VALUES (
        ${params.eventType},
        ${params.actor},
        ${params.severity ?? "info"},
        ${params.keyId ?? null}::uuid,
        ${params.summary.slice(0, 300)},
        ${params.ip ?? null},
        ${params.userAgent ? params.userAgent.slice(0, 300) : null}
      )
    `;
  } catch {
    // Never let audit logging break primary auth flows
  }
}
