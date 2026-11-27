import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader, useSession } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  DEFAULT_BUY_KEY_BOT_URL,
  DEFAULT_TELEGRAM_CHANNEL_URL,
  DEFAULT_TELEGRAM_SUPPORT_URL,
  normalizeBotUrl,
} from "@/lib/botUrl";
import type {
  AccessKeyRow,
  AppSettingRow,
  DeviceInfoPayload,
} from "@/db/neon.server";

const ADMIN_SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000;

type AdminSession = {
  authorized?: boolean;
  sigHash?: string;
  issuedAt?: number;
};

export type KeyStatus = "unused" | "active" | "paused" | "expired";

export type AdminKeyRecord = {
  id: string;
  keyPlain: string | null;
  keyHashShort: string;
  keyLabel: string | null;
  isCustom: boolean;
  isPaused: boolean;
  pausedAt: string | null;
  createdAt: string;
  claimedAt: string | null;
  lastSeenAt: string | null;
  expiresAt: string | null;
  loginCount: number;
  deviceHashShort: string | null;
  userName: string | null;
  userIp: string | null;
  userAgent: string | null;
  deviceInfo: DeviceInfoPayload | null;
  status: KeyStatus;
};

function isAdminSessionValid(
  data: AdminSession,
  currentSig: string | null,
): boolean {
  if (data.authorized !== true) return false;
  if (typeof data.issuedAt !== "number" || !Number.isFinite(data.issuedAt)) return false;
  const ageMs = Date.now() - data.issuedAt;
  if (ageMs < -60_000 || ageMs >= ADMIN_SESSION_MAX_AGE_MS) return false;
  if (data.sigHash && currentSig && data.sigHash !== currentSig) return false;
  return true;
}

async function requireAdminSession() {
  const { buildSessionCookieConfig, computeDeviceSignatureHash, extractClientMeta } = await import(
    "@/lib/security.server"
  );
  const session = await useSession<AdminSession>(await buildSessionCookieConfig("admin"));
  const { ua } = extractClientMeta();
  const currentSig = ua ? await computeDeviceSignatureHash() : null;
  if (!isAdminSessionValid(session.data, currentSig)) {
    await session.clear();
    throw new Error("Admin access is required.");
  }
  return session;
}

function computeStatus(row: {
  claimed_device_hash: string | null;
  is_paused: boolean;
  expires_at: string | null;
}): KeyStatus {
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return "expired";
  }
  if (row.is_paused) return "paused";
  if (row.claimed_device_hash) return "active";
  return "unused";
}

function computeExpiryIso(expiresInDays: number | null | undefined): string | null {
  if (!expiresInDays || expiresInDays <= 0) return null;
  return new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
}

function getPgErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function validateStrongCustomKey(normalized: string): string | null {
  if (normalized.length < 12 || normalized.length > 64) {
    return "Custom key must be 12–64 characters long.";
  }
  if (!/^[A-Z0-9-]+$/.test(normalized)) {
    return "Custom key may only contain A–Z, 0–9, and hyphens (-).";
  }
  if (!/[A-Z]/.test(normalized) || !/[0-9]/.test(normalized)) {
    return "Custom key must include at least one letter (A–Z) and one digit (0–9).";
  }
  if (normalized.replace(/-/g, "").length < 8) {
    return "Custom key must contain at least 8 non-dash characters.";
  }
  return null;
}

export const getAdminStatus = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("cache-control", "private, no-store");
  const { buildSessionCookieConfig, computeDeviceSignatureHash, extractClientMeta } = await import(
    "@/lib/security.server"
  );
  const session = await useSession<AdminSession>(await buildSessionCookieConfig("admin"));
  const { ua } = extractClientMeta();
  const currentSig = ua ? await computeDeviceSignatureHash() : null;
  const unlocked = isAdminSessionValid(session.data, currentSig);
  if (!unlocked && session.data.authorized) {
    await session.clear();
  }
  return { unlocked };
});

export const unlockAdmin = createServerFn({ method: "POST" })
  .validator(z.object({ key: z.string().trim().min(1).max(256) }))
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", "private, no-store");
    try {
      const {
        buildSessionCookieConfig,
        checkRateLimit,
        clearRateLimit,
        computeDeviceSignatureHash,
        constantTimeSecretMatch,
        extractClientMeta,
        logAuditEvent,
        recordFailedAttempt,
      } = await import("@/lib/security.server");

      const expectedKey = process.env["ZIMADMIN_PASSWORD"]?.trim();
      if (!expectedKey) {
        return {
          ok: false as const,
          error: "ZIMADMIN_PASSWORD is not set in environment.",
          retryAfterSeconds: 0,
        };
      }

      const { ip, ua } = extractClientMeta();
      const { ensureNeonSchema } = await import("@/db/neon.server");
      const sql = await ensureNeonSchema();

      // Check global admin lockout first (max 20 failures / 1 hour -> 1 hour global lock)
      const globalBucket = "admin:global";
      const globalRate = await checkRateLimit(sql, globalBucket, 20, 3600);
      if (!globalRate.allowed) {
        await logAuditEvent(sql, {
          eventType: "admin_global_rate_limited",
          actor: "admin",
          severity: "danger",
          summary: `Global admin unlock lockout active (${globalRate.retryAfterSeconds}s left)`,
          ip,
          userAgent: ua,
        });
        return {
          ok: false as const,
          error: `Admin unlock temporarily locked. Try again in ${Math.ceil(globalRate.retryAfterSeconds / 60)} min.`,
          retryAfterSeconds: globalRate.retryAfterSeconds,
        };
      }

      const rateBucket = `admin:${ip}`;
      const rate = await checkRateLimit(sql, rateBucket, 5, 900);
      if (!rate.allowed) {
        await logAuditEvent(sql, {
          eventType: "admin_rate_limited",
          actor: "admin",
          severity: "danger",
          summary: `Blocked brute-force admin unlock (${rate.retryAfterSeconds}s left)`,
          ip,
          userAgent: ua,
        });
        return {
          ok: false as const,
          error: `Too many failed attempts. Try again in ${Math.ceil(rate.retryAfterSeconds / 60)} min.`,
          retryAfterSeconds: rate.retryAfterSeconds,
        };
      }

      const valid = await constantTimeSecretMatch(data.key.trim(), expectedKey);
      if (!valid) {
        const [failed, globalFailed] = await Promise.all([
          recordFailedAttempt(sql, rateBucket, 5, 900, 900),
          recordFailedAttempt(sql, globalBucket, 20, 3600, 3600),
        ]);

        if (!globalFailed.allowed) {
          await logAuditEvent(sql, {
            eventType: "admin_global_rate_limited",
            actor: "admin",
            severity: "danger",
            summary: "Global admin unlock rate limit triggered — locked for 1 hour",
            ip,
            userAgent: ua,
          });
          return {
            ok: false as const,
            error: "Too many failed attempts. Admin unlock locked for 1 hour.",
            retryAfterSeconds: globalFailed.retryAfterSeconds,
          };
        }

        await logAuditEvent(sql, {
          eventType: "admin_unlock_failed",
          actor: "admin",
          severity: "danger",
          summary: `Invalid admin passcode (${failed.remaining} attempts left)`,
          ip,
          userAgent: ua,
        });
        return {
          ok: false as const,
          error: failed.allowed
            ? `Incorrect passcode. ${failed.remaining} attempt${failed.remaining === 1 ? "" : "s"} remaining.`
            : "Too many failed attempts. Locked for 15 minutes.",
          retryAfterSeconds: failed.retryAfterSeconds,
        };
      }

      await clearRateLimit(sql, rateBucket);
      const sigHash = await computeDeviceSignatureHash();
      const session = await useSession<AdminSession>(await buildSessionCookieConfig("admin"));
      await session.update({ authorized: true, sigHash, issuedAt: Date.now() });

      await logAuditEvent(sql, {
        eventType: "admin_unlocked",
        actor: "admin",
        severity: "info",
        summary: "Admin console unlocked",
        ip,
        userAgent: ua,
      });

      return { ok: true as const, error: "", retryAfterSeconds: 0 };
    } catch (err) {
      console.error("[unlockAdmin] Failed:", err);
      return {
        ok: false as const,
        error: "Could not verify passcode.",
        retryAfterSeconds: 0,
      };
    }
  });

export const lockAdmin = createServerFn({ method: "POST" }).handler(async () => {
  setResponseHeader("cache-control", "private, no-store");
  const { buildSessionCookieConfig } = await import("@/lib/security.server");
  const session = await useSession<AdminSession>(await buildSessionCookieConfig("admin"));
  await session.clear();
  return { ok: true as const };
});

export const listAdminDashboard = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("cache-control", "private, no-store");
  await requireAdminSession();

  const { ensureNeonSchema } = await import("@/db/neon.server");
  const { decryptStoredKey, extractServerDeviceHints } = await import("@/lib/security.server");
  const sql = await ensureNeonSchema();

  const rows = (await sql`
    SELECT
      id,
      key_hash,
      key_enc,
      key_plain,
      key_label,
      is_custom,
      is_paused,
      paused_at,
      created_at,
      claimed_at,
      last_seen_at,
      expires_at,
      login_count,
      claimed_device_hash,
      user_name,
      user_ip,
      user_agent,
      device_info
    FROM public.access_keys
    ORDER BY created_at DESC
  `) as AccessKeyRow[];

  const parsePrice = (raw: string | undefined, fallback: number) => {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1 && n <= 100000 ? Math.round(n) : fallback;
  };

  let buyKeyBotUrl = normalizeBotUrl(
    process.env["BUY_KEY_BOT_URL"] ?? process.env["VITE_BUY_KEY_BOT_URL"],
    DEFAULT_BUY_KEY_BOT_URL,
  );
  let telegramSupportUrl = normalizeBotUrl(
    process.env["TELEGRAM_SUPPORT_URL"] ?? process.env["VITE_TELEGRAM_SUPPORT_URL"],
    DEFAULT_TELEGRAM_SUPPORT_URL,
  );
  let telegramChannelUrl = normalizeBotUrl(
    process.env["TELEGRAM_CHANNEL_URL"] ?? process.env["VITE_TELEGRAM_CHANNEL_URL"],
    DEFAULT_TELEGRAM_CHANNEL_URL,
  );
  let singlePrice = parsePrice(process.env["SINGLE_PRICE"], 99);
  let bulkPrice = parsePrice(process.env["BULK_PRICE"], 59);

  try {
    const settingRows = (await sql`
      SELECT key, value FROM public.app_settings
      WHERE key IN (
        'buy_key_bot_url',
        'telegram_support_url',
        'telegram_channel_url',
        'single_price',
        'bulk_price'
      )
    `) as Pick<AppSettingRow, "key" | "value">[];

    for (const row of settingRows) {
      if (row.key === "buy_key_bot_url" && row.value) {
        buyKeyBotUrl = normalizeBotUrl(row.value, DEFAULT_BUY_KEY_BOT_URL);
      } else if (row.key === "telegram_support_url" && row.value) {
        telegramSupportUrl = normalizeBotUrl(row.value, DEFAULT_TELEGRAM_SUPPORT_URL);
      } else if (row.key === "telegram_channel_url" && row.value) {
        telegramChannelUrl = normalizeBotUrl(row.value, DEFAULT_TELEGRAM_CHANNEL_URL);
      } else if (row.key === "single_price" && row.value) {
        singlePrice = parsePrice(row.value, singlePrice);
      } else if (row.key === "bulk_price" && row.value) {
        bulkPrice = parsePrice(row.value, bulkPrice);
      }
    }
  } catch {
    // Keep env fallback
  }

  let blockedIpsCount = 0;
  try {
    const blockedRows = (await sql`
      SELECT COUNT(*)::int AS cnt
      FROM public.rate_limits
      WHERE blocked_until IS NOT NULL AND blocked_until > now()
    `) as { cnt: number }[];
    blockedIpsCount = Number(blockedRows[0]?.cnt ?? 0);
  } catch {
    blockedIpsCount = 0;
  }

  const keys: AdminKeyRecord[] = await Promise.all(
    rows.map(async (row) => {
      const decrypted = (await decryptStoredKey(row.key_enc)) ?? row.key_plain ?? null;
      return {
        id: row.id,
        keyPlain: decrypted,
        keyHashShort: `${row.key_hash.slice(0, 8).toUpperCase()}…${row.key_hash.slice(-4).toUpperCase()}`,
        keyLabel: row.key_label,
        isCustom: Boolean(row.is_custom),
        isPaused: Boolean(row.is_paused),
        pausedAt: row.paused_at,
        createdAt: row.created_at,
        claimedAt: row.claimed_at,
        lastSeenAt: row.last_seen_at,
        expiresAt: row.expires_at,
        loginCount: Number(row.login_count ?? 0),
        deviceHashShort: row.claimed_device_hash
          ? `DEV-${row.claimed_device_hash.slice(0, 8).toUpperCase()}`
          : null,
        userName: row.user_name,
        userIp: row.user_ip,
        userAgent: row.user_agent,
        deviceInfo: (() => {
          const stored =
            row.device_info && typeof row.device_info === "object" && !Array.isArray(row.device_info)
              ? row.device_info
              : null;
          const uaHints = row.user_agent ? extractServerDeviceHints(row.user_agent, null) : {};
          if (!stored && !uaHints.deviceName && !uaHints.osVersion && !uaHints.os) return null;
          return {
            ...(uaHints.os ? { os: uaHints.os } : {}),
            ...(uaHints.browser ? { browser: uaHints.browser } : {}),
            ...(uaHints.deviceName ? { deviceName: uaHints.deviceName } : {}),
            ...(uaHints.osVersion ? { osVersion: uaHints.osVersion } : {}),
            ...(stored ?? {}),
            deviceName:
              (stored?.deviceName && stored.deviceName !== "Android Device"
                ? stored.deviceName
                : uaHints.deviceName || stored?.deviceName) || undefined,
            osVersion:
              (stored?.osVersion && stored.osVersion !== "Android"
                ? stored.osVersion
                : uaHints.osVersion || stored?.osVersion) || undefined,
          };
        })(),
        status: computeStatus(row),
      };
    }),
  );

  const stats = {
    total: keys.length,
    active: keys.filter((k) => k.status === "active").length,
    unused: keys.filter((k) => k.status === "unused").length,
    paused: keys.filter((k) => k.status === "paused").length,
    expired: keys.filter((k) => k.status === "expired").length,
    blockedIps: blockedIpsCount,
  };

  return { keys, stats, buyKeyBotUrl, telegramSupportUrl, telegramChannelUrl, singlePrice, bulkPrice };
});

export const generateAccessKey = createServerFn({ method: "POST" })
  .validator(
    z
      .object({
        customKey: z.string().trim().max(64).optional(),
        label: z.string().trim().max(80).optional(),
        expiresInDays: z.number().int().min(0).max(3650).nullable().optional(),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", "private, no-store");
    await requireAdminSession();

    const {
      encryptKeyForStorage,
      extractClientMeta,
      generateRandomLicenseKey,
      logAuditEvent,
      normalizeLicenseKey,
      sha256Hex,
    } = await import("@/lib/security.server");

    const rawCustom = data?.customKey?.trim() ?? "";
    const isCustom = rawCustom.length > 0;
    let key: string;

    if (isCustom) {
      const normalized = normalizeLicenseKey(rawCustom);
      const validationError = validateStrongCustomKey(normalized);
      if (validationError) {
        return {
          ok: false as const,
          error: validationError,
        };
      }
      key = normalized;
    } else {
      key = generateRandomLicenseKey();
    }

    const keyHash = await sha256Hex(key);
    const keyEnc = await encryptKeyForStorage(key);
    const expiresAt = computeExpiryIso(data?.expiresInDays);
    const cleanLabel = data?.label?.trim() || null;

    try {
      const { ensureNeonSchema } = await import("@/db/neon.server");
      const sql = await ensureNeonSchema();

      const inserted = (await sql`
        INSERT INTO public.access_keys (key_hash, key_enc, key_plain, key_label, is_custom, expires_at)
        VALUES (${keyHash}, ${keyEnc}, NULL, ${cleanLabel}, ${isCustom}, ${expiresAt}::timestamptz)
        RETURNING id
      `) as { id: string }[];

      const { ip, ua } = extractClientMeta();
      await logAuditEvent(sql, {
        eventType: isCustom ? "key_created_custom" : "key_created",
        actor: "admin",
        severity: "info",
        keyId: inserted[0]?.id ?? null,
        summary: `Created ${isCustom ? "custom" : "random"} key${cleanLabel ? ` for ${cleanLabel}` : ""}`,
        ip,
        userAgent: ua,
      });
    } catch (err) {
      if (getPgErrorCode(err) === "23505") {
        return { ok: false as const, error: "That key already exists. Choose a different key." };
      }
      return { ok: false as const, error: "Could not create key. Verify Neon DATABASE_URL." };
    }

    return { ok: true as const, key };
  });

export const setKeyPaused = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), paused: z.boolean() }))
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", "private, no-store");
    await requireAdminSession();

    const { ensureNeonSchema } = await import("@/db/neon.server");
    const { extractClientMeta, logAuditEvent } = await import("@/lib/security.server");
    const sql = await ensureNeonSchema();
    const pausedAt = data.paused ? new Date().toISOString() : null;

    await sql`
      UPDATE public.access_keys
      SET is_paused = ${data.paused}, paused_at = ${pausedAt}::timestamptz
      WHERE id = ${data.id}
    `;

    const { ip, ua } = extractClientMeta();
    await logAuditEvent(sql, {
      eventType: data.paused ? "user_paused" : "user_resumed",
      actor: "admin",
      severity: data.paused ? "warn" : "info",
      keyId: data.id,
      summary: data.paused ? "Paused user access" : "Resumed user access",
      ip,
      userAgent: ua,
    });

    return { ok: true as const };
  });

export const removeKeyUser = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", "private, no-store");
    await requireAdminSession();

    const { ensureNeonSchema } = await import("@/db/neon.server");
    const { extractClientMeta, logAuditEvent } = await import("@/lib/security.server");
    const sql = await ensureNeonSchema();

    await sql`
      UPDATE public.access_keys
      SET
        claimed_device_hash = NULL,
        session_token_hash = NULL,
        prev_session_token_hash = NULL,
        prev_token_expires_at = NULL,
        device_sig_hash = NULL,
        device_fp_hash = NULL,
        claimed_at = NULL,
        last_seen_at = NULL,
        login_count = 0,
        user_name = NULL,
        user_ip = NULL,
        user_agent = NULL,
        device_info = NULL,
        is_paused = false,
        paused_at = NULL
      WHERE id = ${data.id}
    `;

    const { ip, ua } = extractClientMeta();
    await logAuditEvent(sql, {
      eventType: "user_removed",
      actor: "admin",
      severity: "warn",
      keyId: data.id,
      summary: "Removed user & revoked device session",
      ip,
      userAgent: ua,
    });

    return { ok: true as const };
  });

export const deleteAccessKey = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", "private, no-store");
    await requireAdminSession();

    const { ensureNeonSchema } = await import("@/db/neon.server");
    const { extractClientMeta, logAuditEvent } = await import("@/lib/security.server");
    const sql = await ensureNeonSchema();

    await sql`DELETE FROM public.access_keys WHERE id = ${data.id}`;

    const { ip, ua } = extractClientMeta();
    await logAuditEvent(sql, {
      eventType: "key_deleted",
      actor: "admin",
      severity: "danger",
      keyId: data.id,
      summary: "Permanently deleted license key",
      ip,
      userAgent: ua,
    });

    return { ok: true as const };
  });

export const updateKeyMeta = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().uuid(),
      label: z.string().trim().max(80).nullable(),
      userName: z.string().trim().max(80).nullable(),
      expiresInDays: z.number().int().min(-1).max(3650).optional(),
    }),
  )
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", "private, no-store");
    await requireAdminSession();

    const { ensureNeonSchema } = await import("@/db/neon.server");
    const sql = await ensureNeonSchema();

    if (data.expiresInDays === -1) {
      await sql`
        UPDATE public.access_keys
        SET
          key_label = ${data.label?.trim() || null},
          user_name = ${data.userName?.trim() || null},
          expires_at = NULL
        WHERE id = ${data.id}
      `;
    } else if (typeof data.expiresInDays === "number" && data.expiresInDays > 0) {
      const nextExpiry = computeExpiryIso(data.expiresInDays);
      await sql`
        UPDATE public.access_keys
        SET
          key_label = ${data.label?.trim() || null},
          user_name = ${data.userName?.trim() || null},
          expires_at = ${nextExpiry}::timestamptz
        WHERE id = ${data.id}
      `;
    } else {
      await sql`
        UPDATE public.access_keys
        SET
          key_label = ${data.label?.trim() || null},
          user_name = ${data.userName?.trim() || null}
        WHERE id = ${data.id}
      `;
    }

    return { ok: true as const };
  });

export const updateBuyKeyBotUrl = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().trim().min(2).max(200) }))
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", "private, no-store");
    await requireAdminSession();

    const normalized = normalizeBotUrl(data.url);
    const { ensureNeonSchema } = await import("@/db/neon.server");
    const { extractClientMeta, logAuditEvent } = await import("@/lib/security.server");
    const sql = await ensureNeonSchema();
    const nowIso = new Date().toISOString();

    await sql`
      INSERT INTO public.app_settings (key, value, updated_at)
      VALUES ('buy_key_bot_url', ${normalized}, ${nowIso}::timestamptz)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `;

    const { ip, ua } = extractClientMeta();
    await logAuditEvent(sql, {
      eventType: "bot_url_updated",
      actor: "admin",
      severity: "info",
      summary: `Updated Buy Key bot link to ${normalized}`,
      ip,
      userAgent: ua,
    });

    return { ok: true as const, url: normalized };
  });

export const updateTelegramLinks = createServerFn({ method: "POST" })
  .validator(
    z.object({
      supportUrl: z.string().trim().min(2).max(200),
      channelUrl: z.string().trim().min(2).max(200),
    }),
  )
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", "private, no-store");
    await requireAdminSession();

    const supportUrl = normalizeBotUrl(data.supportUrl, DEFAULT_TELEGRAM_SUPPORT_URL);
    const channelUrl = normalizeBotUrl(data.channelUrl, DEFAULT_TELEGRAM_CHANNEL_URL);
    const { ensureNeonSchema } = await import("@/db/neon.server");
    const { extractClientMeta, logAuditEvent } = await import("@/lib/security.server");
    const sql = await ensureNeonSchema();
    const nowIso = new Date().toISOString();

    await sql`
      INSERT INTO public.app_settings (key, value, updated_at)
      VALUES
        ('telegram_support_url', ${supportUrl}, ${nowIso}::timestamptz),
        ('telegram_channel_url', ${channelUrl}, ${nowIso}::timestamptz)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `;

    const { ip, ua } = extractClientMeta();
    await logAuditEvent(sql, {
      eventType: "telegram_links_updated",
      actor: "admin",
      severity: "info",
      summary: `Updated Telegram Support (${supportUrl}) & Channel (${channelUrl})`,
      ip,
      userAgent: ua,
    });

    return { ok: true as const, supportUrl, channelUrl };
  });

export const clearAllRateLimits = createServerFn({ method: "POST" }).handler(async () => {
  setResponseHeader("cache-control", "private, no-store");
  await requireAdminSession();

  const { ensureNeonSchema } = await import("@/db/neon.server");
  const { extractClientMeta, logAuditEvent } = await import("@/lib/security.server");
  const sql = await ensureNeonSchema();

  await sql`DELETE FROM public.rate_limits`;

  const { ip, ua } = extractClientMeta();
  await logAuditEvent(sql, {
    eventType: "rate_limits_cleared",
    actor: "admin",
    severity: "info",
    summary: "Cleared all rate-limit lockouts",
    ip,
    userAgent: ua,
  });

  return { ok: true as const };
});

export const updatePricing = createServerFn({ method: "POST" })
  .validator(
    z.object({
      singlePrice: z.number().min(1).max(100000),
      bulkPrice: z.number().min(1).max(100000),
    }),
  )
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", "private, no-store");
    await requireAdminSession();

    const singlePrice = Math.round(data.singlePrice);
    const bulkPrice = Math.round(data.bulkPrice);
    const { ensureNeonSchema } = await import("@/db/neon.server");
    const { extractClientMeta, logAuditEvent } = await import("@/lib/security.server");
    const sql = await ensureNeonSchema();
    const nowIso = new Date().toISOString();

    await sql`
      INSERT INTO public.app_settings (key, value, updated_at)
      VALUES
        ('single_price', ${String(singlePrice)}, ${nowIso}::timestamptz),
        ('bulk_price', ${String(bulkPrice)}, ${nowIso}::timestamptz)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `;

    const { ip, ua } = extractClientMeta();
    await logAuditEvent(sql, {
      eventType: "pricing_updated",
      actor: "admin",
      severity: "info",
      summary: `Updated pricing: Single ₹${singlePrice}, Bulk ₹${bulkPrice}`,
      ip,
      userAgent: ua,
    });

    return { ok: true as const, singlePrice, bulkPrice };
  });
