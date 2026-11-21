import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader, useSession } from "@tanstack/react-start/server";
import { z } from "zod";
import { DEFAULT_BUY_KEY_BOT_URL, normalizeBotUrl } from "@/lib/botUrl";
import type { AccessKeyRow, AppSettingRow } from "@/db/neon.server";

type AccessSession = {
  keyHash?: string;
  deviceId?: string;
  sessionToken?: string;
};

export type AccessDeniedReason =
  | "none"
  | "invalid"
  | "used"
  | "paused"
  | "expired"
  | "revoked"
  | "rate_limited"
  | "misconfigured";

export const getPublicLoginConfig = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("cache-control", "private, no-store");
  const envUrl = process.env["BUY_KEY_BOT_URL"] ?? process.env["VITE_BUY_KEY_BOT_URL"];

  try {
    const { ensureNeonSchema } = await import("@/db/neon.server");
    const sql = await ensureNeonSchema();
    const rows = (await sql`
      SELECT value FROM public.app_settings
      WHERE key = 'buy_key_bot_url'
      LIMIT 1
    `) as Pick<AppSettingRow, "value">[];

    const dbUrl = rows[0]?.value;
    if (dbUrl) {
      return { buyKeyBotUrl: normalizeBotUrl(dbUrl) };
    }
  } catch {
    // Fall back to env or default if DB isn't reachable yet
  }

  return { buyKeyBotUrl: normalizeBotUrl(envUrl ?? DEFAULT_BUY_KEY_BOT_URL) };
});

export const getAccessStatus = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("cache-control", "private, no-store");
  const {
    buildSessionCookieConfig,
    computeDeviceSignatureHash,
    extractClientMeta,
    sha256Hex,
  } = await import("@/lib/security.server");

  const sessionConfig = await buildSessionCookieConfig("user");
  const session = await useSession<AccessSession>(sessionConfig);

  if (!session.data.keyHash || !session.data.deviceId) {
    return { granted: false as const, reason: "none" as AccessDeniedReason };
  }

  const deviceHash = await sha256Hex(session.data.deviceId);
  const { ensureNeonSchema } = await import("@/db/neon.server");
  const sql = await ensureNeonSchema();

  const rows = (await sql`
    SELECT id, claimed_device_hash, session_token_hash, device_sig_hash, is_paused, expires_at
    FROM public.access_keys
    WHERE key_hash = ${session.data.keyHash}
    LIMIT 1
  `) as Pick<
    AccessKeyRow,
    "id" | "claimed_device_hash" | "session_token_hash" | "device_sig_hash" | "is_paused" | "expires_at"
  >[];

  const row = rows[0];
  if (!row || row.claimed_device_hash !== deviceHash) {
    await session.clear();
    return { granted: false as const, reason: "revoked" as AccessDeniedReason };
  }

  // Verify rotated session token if present in DB (blocks stolen/stale sessions after kick)
  if (row.session_token_hash) {
    if (!session.data.sessionToken) {
      await session.clear();
      return { granted: false as const, reason: "revoked" as AccessDeniedReason };
    }
    const tokenHash = await sha256Hex(session.data.sessionToken);
    if (tokenHash !== row.session_token_hash) {
      await session.clear();
      return { granted: false as const, reason: "revoked" as AccessDeniedReason };
    }
  }

  // Verify coarse device/OS signature (blocks cookie cloning across different devices/OS)
  if (row.device_sig_hash) {
    const currentSigHash = await computeDeviceSignatureHash();
    if (currentSigHash !== row.device_sig_hash) {
      await session.clear();
      return { granted: false as const, reason: "revoked" as AccessDeniedReason };
    }
  }

  if (row.is_paused) {
    return { granted: false as const, reason: "paused" as AccessDeniedReason };
  }

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return { granted: false as const, reason: "expired" as AccessDeniedReason };
  }

  // Update last_seen_at safely (awaited with catch so serverless runtimes don't drop it)
  const { ip, ua } = extractClientMeta();
  const nowIso = new Date().toISOString();
  try {
    await sql`
      UPDATE public.access_keys
      SET
        last_seen_at = ${nowIso}::timestamptz,
        user_ip = COALESCE(${ip === "unknown" ? null : ip}, user_ip),
        user_agent = COALESCE(${ua}, user_agent)
      WHERE id = ${row.id}
    `;
  } catch {
    // Telemetry update should never block access
  }

  return { granted: true as const, reason: "none" as AccessDeniedReason };
});

export const clearAccessSession = createServerFn({ method: "POST" }).handler(async () => {
  setResponseHeader("cache-control", "private, no-store");
  try {
    const { buildSessionCookieConfig } = await import("@/lib/security.server");
    const session = await useSession<AccessSession>(await buildSessionCookieConfig("user"));
    await session.clear();
  } catch {
    // Ignore
  }
  return { ok: true as const };
});

const deviceInfoSchema = z
  .object({
    platform: z.string().max(80).optional(),
    browser: z.string().max(80).optional(),
    os: z.string().max(80).optional(),
    screen: z.string().max(40).optional(),
    timezone: z.string().max(80).optional(),
    language: z.string().max(40).optional(),
  })
  .optional();

export const redeemAccessKey = createServerFn({ method: "POST" })
  .validator(
    z.object({
      key: z.string().trim().min(1).max(256),
      userName: z.string().trim().max(80).optional(),
      deviceInfo: deviceInfoSchema,
    }),
  )
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", "private, no-store");

    const {
      buildSessionCookieConfig,
      checkRateLimit,
      clearRateLimit,
      computeDeviceSignatureHash,
      extractClientMeta,
      generateRandomTokenHex,
      logAuditEvent,
      normalizeLicenseKey,
      recordFailedAttempt,
      sha256Hex,
    } = await import("@/lib/security.server");

    let sessionConfig;
    try {
      sessionConfig = await buildSessionCookieConfig("user");
    } catch {
      return {
        ok: false as const,
        reason: "misconfigured" as AccessDeniedReason,
        retryAfterSeconds: 0,
      };
    }

    const session = await useSession<AccessSession>(sessionConfig);
    const { ip, ua } = extractClientMeta();

    let sql;
    try {
      const { ensureNeonSchema } = await import("@/db/neon.server");
      sql = await ensureNeonSchema();
    } catch (err) {
      console.error("[redeemAccessKey] DB init failed:", err);
      return {
        ok: false as const,
        reason: "misconfigured" as AccessDeniedReason,
        retryAfterSeconds: 0,
      };
    }

    const rateBucket = `login:${ip}`;
    const rate = await checkRateLimit(sql, rateBucket, 8, 900);
    if (!rate.allowed) {
      await logAuditEvent(sql, {
        eventType: "login_rate_limited",
        actor: "user",
        severity: "danger",
        summary: `Blocked brute-force login attempts (${rate.retryAfterSeconds}s left)`,
        ip,
        userAgent: ua,
      });
      return {
        ok: false as const,
        reason: "rate_limited" as AccessDeniedReason,
        retryAfterSeconds: rate.retryAfterSeconds,
      };
    }

    const normalizedKey = normalizeLicenseKey(data.key);
    if (!normalizedKey) {
      return { ok: false as const, reason: "invalid" as AccessDeniedReason, retryAfterSeconds: 0 };
    }

    const keyHash = await sha256Hex(normalizedKey);
    const existingRows = (await sql`
      SELECT id, claimed_device_hash, claimed_at, is_paused, expires_at, login_count, user_name
      FROM public.access_keys
      WHERE key_hash = ${keyHash}
      LIMIT 1
    `) as Pick<
      AccessKeyRow,
      "id" | "claimed_device_hash" | "claimed_at" | "is_paused" | "expires_at" | "login_count" | "user_name"
    >[];

    const existing = existingRows[0];
    if (!existing) {
      const failed = await recordFailedAttempt(sql, rateBucket, 8, 900, 900);
      await logAuditEvent(sql, {
        eventType: "login_invalid_key",
        actor: "user",
        severity: "warn",
        summary: `Failed login with invalid key (${failed.remaining} attempts left)`,
        ip,
        userAgent: ua,
      });
      return {
        ok: false as const,
        reason: (failed.allowed ? "invalid" : "rate_limited") as AccessDeniedReason,
        retryAfterSeconds: failed.retryAfterSeconds,
      };
    }

    if (existing.is_paused) {
      await logAuditEvent(sql, {
        eventType: "login_blocked_paused",
        actor: "user",
        severity: "warn",
        keyId: existing.id,
        summary: "Blocked login attempt on paused key",
        ip,
        userAgent: ua,
      });
      return { ok: false as const, reason: "paused" as AccessDeniedReason, retryAfterSeconds: 0 };
    }

    if (existing.expires_at && new Date(existing.expires_at).getTime() <= Date.now()) {
      await logAuditEvent(sql, {
        eventType: "login_blocked_expired",
        actor: "user",
        severity: "warn",
        keyId: existing.id,
        summary: "Blocked login attempt on expired key",
        ip,
        userAgent: ua,
      });
      return { ok: false as const, reason: "expired" as AccessDeniedReason, retryAfterSeconds: 0 };
    }

    // Reuse existing deviceId only if it already matches this key; otherwise allocate fresh deviceId
    let deviceId = session.data.deviceId;
    if (!deviceId) {
      deviceId = crypto.randomUUID();
    }
    let deviceHash = await sha256Hex(deviceId);

    if (existing.claimed_device_hash && existing.claimed_device_hash !== deviceHash) {
      const failed = await recordFailedAttempt(sql, rateBucket, 8, 900, 900);
      await logAuditEvent(sql, {
        eventType: "login_device_mismatch",
        actor: "user",
        severity: "danger",
        keyId: existing.id,
        summary: "Blocked key reuse attempt from another device",
        ip,
        userAgent: ua,
      });
      return {
        ok: false as const,
        reason: (failed.allowed ? "used" : "rate_limited") as AccessDeniedReason,
        retryAfterSeconds: failed.retryAfterSeconds,
      };
    }

    // If this key was unclaimed, always assign a fresh deviceId so old dead sessions don't collide
    if (!existing.claimed_device_hash) {
      deviceId = crypto.randomUUID();
      deviceHash = await sha256Hex(deviceId);
    }

    const sessionToken = generateRandomTokenHex(32);
    const sessionTokenHash = await sha256Hex(sessionToken);
    const deviceSigHash = await computeDeviceSignatureHash();
    const nowIso = new Date().toISOString();
    const cleanUserName = data.userName?.trim() || existing.user_name || null;
    const deviceJson = data.deviceInfo ? JSON.stringify(data.deviceInfo) : null;

    const claimedRows = (await sql`
      UPDATE public.access_keys
      SET
        claimed_device_hash = ${deviceHash},
        session_token_hash = ${sessionTokenHash},
        device_sig_hash = ${deviceSigHash},
        claimed_at = COALESCE(claimed_at, ${nowIso}::timestamptz),
        last_seen_at = ${nowIso}::timestamptz,
        login_count = COALESCE(login_count, 0) + 1,
        user_name = ${cleanUserName},
        user_ip = ${ip === "unknown" ? null : ip},
        user_agent = ${ua},
        device_info = COALESCE(${deviceJson}::jsonb, device_info)
      WHERE id = ${existing.id}
        AND (claimed_device_hash IS NULL OR claimed_device_hash = ${deviceHash})
      RETURNING id
    `) as Pick<AccessKeyRow, "id">[];

    if (!claimedRows[0]) {
      return { ok: false as const, reason: "used" as AccessDeniedReason, retryAfterSeconds: 0 };
    }

    await clearRateLimit(sql, rateBucket);
    await session.update({ keyHash, deviceId, sessionToken });

    await logAuditEvent(sql, {
      eventType: "login_success",
      actor: "user",
      severity: "info",
      keyId: existing.id,
      summary: `${cleanUserName ?? "User"} unlocked access (${data.deviceInfo?.os ?? "Device"})`,
      ip,
      userAgent: ua,
    });

    return { ok: true as const, reason: "none" as AccessDeniedReason, retryAfterSeconds: 0 };
  });
