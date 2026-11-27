import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader, useSession } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  DEFAULT_BUY_KEY_BOT_URL,
  DEFAULT_TELEGRAM_CHANNEL_URL,
  DEFAULT_TELEGRAM_SUPPORT_URL,
  normalizeBotUrl,
} from "@/lib/botUrl";
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

function parsePositivePrice(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 100000 ? Math.round(n) : fallback;
}

export const getPublicLoginConfig = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("cache-control", "private, no-store");
  const envBotUrl = process.env["BUY_KEY_BOT_URL"] ?? process.env["VITE_BUY_KEY_BOT_URL"];
  const envSupportUrl =
    process.env["TELEGRAM_SUPPORT_URL"] ?? process.env["VITE_TELEGRAM_SUPPORT_URL"];
  const envChannelUrl =
    process.env["TELEGRAM_CHANNEL_URL"] ?? process.env["VITE_TELEGRAM_CHANNEL_URL"];

  let buyKeyBotUrl = normalizeBotUrl(envBotUrl, DEFAULT_BUY_KEY_BOT_URL);
  let telegramSupportUrl = normalizeBotUrl(envSupportUrl, DEFAULT_TELEGRAM_SUPPORT_URL);
  let telegramChannelUrl = normalizeBotUrl(envChannelUrl, DEFAULT_TELEGRAM_CHANNEL_URL);
  let singlePrice = parsePositivePrice(process.env["SINGLE_PRICE"], 99);
  let bulkPrice = parsePositivePrice(process.env["BULK_PRICE"], 59);

  try {
    const { ensureNeonSchema } = await import("@/db/neon.server");
    const sql = await ensureNeonSchema();
    const rows = (await sql`
      SELECT key, value FROM public.app_settings
      WHERE key IN (
        'buy_key_bot_url',
        'telegram_support_url',
        'telegram_channel_url',
        'single_price',
        'bulk_price'
      )
    `) as Pick<AppSettingRow, "key" | "value">[];

    for (const row of rows) {
      if (row.key === "buy_key_bot_url" && row.value) {
        buyKeyBotUrl = normalizeBotUrl(row.value, DEFAULT_BUY_KEY_BOT_URL);
      } else if (row.key === "telegram_support_url" && row.value) {
        telegramSupportUrl = normalizeBotUrl(row.value, DEFAULT_TELEGRAM_SUPPORT_URL);
      } else if (row.key === "telegram_channel_url" && row.value) {
        telegramChannelUrl = normalizeBotUrl(row.value, DEFAULT_TELEGRAM_CHANNEL_URL);
      } else if (row.key === "single_price" && row.value) {
        singlePrice = parsePositivePrice(row.value, singlePrice);
      } else if (row.key === "bulk_price" && row.value) {
        bulkPrice = parsePositivePrice(row.value, bulkPrice);
      }
    }
  } catch {
    // Fall back to env or defaults if DB isn't reachable yet
  }

  return { buyKeyBotUrl, telegramSupportUrl, telegramChannelUrl, singlePrice, bulkPrice };
});

export const getAccessStatus = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("cache-control", "private, no-store");

  try {
    const {
      buildSessionCookieConfig,
      extractClientMeta,
      readCookieFromRequest,
      sha256Hex,
    } = await import("@/lib/security.server");

    const sessionConfig = await buildSessionCookieConfig("user");
    const session = await useSession<AccessSession>(sessionConfig);

    if (!session.data.keyHash || !session.data.deviceId) {
      return { granted: false as const, reason: "none" as AccessDeniedReason };
    }

    const deviceHash = await sha256Hex(session.data.deviceId);
    const fallbackCookieDid = readCookieFromRequest("zimbola_did");
    const fallbackCookieHash =
      fallbackCookieDid && fallbackCookieDid !== session.data.deviceId
        ? await sha256Hex(fallbackCookieDid)
        : null;
    const { ip, ua } = extractClientMeta();
    const { ensureNeonSchema } = await import("@/db/neon.server");
    const sql = await ensureNeonSchema();

    const rows = (await sql`
      SELECT
        id,
        claimed_device_hash,
        session_token_hash,
        prev_session_token_hash,
        prev_token_expires_at,
        is_paused,
        expires_at,
        last_seen_at
      FROM public.access_keys
      WHERE key_hash = ${session.data.keyHash}
      LIMIT 1
    `) as Pick<
      AccessKeyRow,
      | "id"
      | "claimed_device_hash"
      | "session_token_hash"
      | "prev_session_token_hash"
      | "prev_token_expires_at"
      | "is_paused"
      | "expires_at"
      | "last_seen_at"
    >[];

    const row = rows[0];
    const deviceMatches =
      Boolean(row?.claimed_device_hash) &&
      (row?.claimed_device_hash === deviceHash ||
        (Boolean(fallbackCookieHash) && row?.claimed_device_hash === fallbackCookieHash));

    if (!row || !deviceMatches) {
      await session.update({
        keyHash: "",
        sessionToken: "",
        deviceId: session.data.deviceId,
      });
      return { granted: false as const, reason: "revoked" as AccessDeniedReason };
    }

    if (row.is_paused) {
      return { granted: false as const, reason: "paused" as AccessDeniedReason };
    }

    const nowMs = Date.now();
    if (row.expires_at && new Date(row.expires_at).getTime() <= nowMs) {
      return { granted: false as const, reason: "expired" as AccessDeniedReason };
    }

    // Verify session token (read-only: never mutates cookies on GET/SSR)
    if (row.session_token_hash) {
      const incomingToken = session.data.sessionToken ?? "";
      const incomingHash = incomingToken ? await sha256Hex(incomingToken) : "";

      const matchesCurrent = Boolean(incomingHash) && incomingHash === row.session_token_hash;
      const matchesGrace =
        !matchesCurrent &&
        Boolean(incomingHash) &&
        Boolean(row.prev_session_token_hash) &&
        incomingHash === row.prev_session_token_hash &&
        Boolean(row.prev_token_expires_at) &&
        new Date(row.prev_token_expires_at as string).getTime() > nowMs;

      if (!matchesCurrent && !matchesGrace) {
        await session.update({
          keyHash: "",
          sessionToken: "",
          deviceId: session.data.deviceId,
        });
        return { granted: false as const, reason: "revoked" as AccessDeniedReason };
      }
    }

    // Throttle telemetry DB writes to at most once every 60s so fast 2.5s heartbeats stay instant & lightweight
    const lastSeenMs = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
    if (!lastSeenMs || nowMs - lastSeenMs >= 60_000) {
      const nowIso = new Date(nowMs).toISOString();
      const safeIp = ip === "unknown" ? null : ip;
      try {
        await sql`
          UPDATE public.access_keys
          SET
            last_seen_at = ${nowIso}::timestamptz,
            user_ip = COALESCE(${safeIp}, user_ip),
            user_agent = COALESCE(${ua}, user_agent)
          WHERE id = ${row.id}
        `;
      } catch {
        // Telemetry update should never block access
      }
    }

    return { granted: true as const, reason: "none" as AccessDeniedReason };
  } catch (err) {
    console.error("[getAccessStatus] Failed:", err);
    return { granted: false as const, reason: "none" as AccessDeniedReason };
  }
});

const deviceInfoSchema = z
  .object({
    deviceName: z.string().max(120).optional().catch(undefined),
    osVersion: z.string().max(80).optional().catch(undefined),
    platform: z.string().max(120).optional().catch(undefined),
    browser: z.string().max(120).optional().catch(undefined),
    os: z.string().max(120).optional().catch(undefined),
    screen: z.string().max(60).optional().catch(undefined),
    timezone: z.string().max(120).optional().catch(undefined),
    language: z.string().max(60).optional().catch(undefined),
  })
  .optional()
  .catch(undefined);

/**
 * Silently restores an active session on app/browser restart if cookies were cleared
 * by the OS/WebView/PWA. STRICTLY requires the key to ALREADY be bound to this exact
 * device (never re-claims an unbound/removed device, never bypasses pause/expiry/delete).
 */
function isLegacySameDeviceMatch(
  stored: AccessKeyRow["device_info"],
  storedIp: string | null,
  incoming:
    | {
        deviceName?: string;
        os?: string;
        screen?: string;
        timezone?: string;
      }
    | undefined,
  incomingIp: string | null,
): boolean {
  if (!stored || !incoming) return false;
  if (!stored.os || !incoming.os || stored.os !== incoming.os) return false;
  if (!stored.screen || !incoming.screen || stored.screen !== incoming.screen) return false;
  if (stored.timezone && incoming.timezone && stored.timezone !== incoming.timezone) return false;
  const sameNamedModel =
    Boolean(stored.deviceName) &&
    stored.deviceName !== "Android Device" &&
    stored.deviceName === incoming.deviceName;
  const sameIp = Boolean(storedIp && incomingIp && storedIp === incomingIp);
  return sameNamedModel || sameIp;
}

export const resumeDeviceSession = createServerFn({ method: "POST" })
  .validator(
    z.object({
      key: z.string().trim().min(1).max(256),
      clientDeviceId: z
        .string()
        .trim()
        .min(16)
        .max(128)
        .regex(/^[A-Za-z0-9_-]+$/)
        .optional()
        .catch(undefined),
      deviceFp: z
        .string()
        .trim()
        .min(32)
        .max(128)
        .regex(/^[a-fA-F0-9]+$/)
        .optional()
        .catch(undefined),
      deviceInfo: deviceInfoSchema,
    }),
  )
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", "private, no-store");
    try {
      const {
        buildSessionCookieConfig,
        computeDeviceSignatureHash,
        extractClientMeta,
        extractServerDeviceHints,
        generateRandomTokenHex,
        normalizeLicenseKey,
        readCookieFromRequest,
        sha256Hex,
      } = await import("@/lib/security.server");

      const normalizedKey = normalizeLicenseKey(data.key);
      if (!normalizedKey) {
        return { ok: false as const, reason: "invalid" as AccessDeniedReason };
      }

      const keyHash = await sha256Hex(normalizedKey);
      const sessionConfig = await buildSessionCookieConfig("user");
      const session = await useSession<AccessSession>(sessionConfig);
      const cookieDid = readCookieFromRequest("zimbola_did");
      const { ip, ua } = extractClientMeta();
      const safeIp = ip === "unknown" ? null : ip;

      const { ensureNeonSchema } = await import("@/db/neon.server");
      const sql = await ensureNeonSchema();

      const rows = (await sql`
        SELECT
          id,
          claimed_device_hash,
          device_fp_hash,
          session_token_hash,
          is_paused,
          expires_at,
          user_ip,
          device_info
        FROM public.access_keys
        WHERE key_hash = ${keyHash}
        LIMIT 1
      `) as Pick<
        AccessKeyRow,
        | "id"
        | "claimed_device_hash"
        | "device_fp_hash"
        | "session_token_hash"
        | "is_paused"
        | "expires_at"
        | "user_ip"
        | "device_info"
      >[];

      const row = rows[0];
      if (!row || !row.claimed_device_hash) {
        return { ok: false as const, reason: "revoked" as AccessDeniedReason };
      }

      const candidates = [data.clientDeviceId, session.data.deviceId, cookieDid].filter(
        (v): v is string => Boolean(v && v.trim().length >= 16),
      );
      let matchedDeviceId: string | null = null;
      for (const cand of candidates) {
        if ((await sha256Hex(cand)) === row.claimed_device_hash) {
          matchedDeviceId = cand;
          break;
        }
      }

      const incomingFpHash = data.deviceFp ? await sha256Hex(`fp:${data.deviceFp.toLowerCase()}`) : null;
      const fpMatched =
        Boolean(incomingFpHash && row.device_fp_hash && incomingFpHash === row.device_fp_hash);
      const legacyMatched =
        !row.device_fp_hash &&
        isLegacySameDeviceMatch(row.device_info, row.user_ip, data.deviceInfo, safeIp);

      if (!matchedDeviceId && !fpMatched && !legacyMatched) {
        return { ok: false as const, reason: "revoked" as AccessDeniedReason };
      }

      if (row.is_paused) {
        return { ok: false as const, reason: "paused" as AccessDeniedReason };
      }

      if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
        return { ok: false as const, reason: "expired" as AccessDeniedReason };
      }

      const effectiveDeviceId =
        matchedDeviceId || data.clientDeviceId || cookieDid || session.data.deviceId || crypto.randomUUID();
      const effectiveDeviceHash = await sha256Hex(effectiveDeviceId);

      const sessionToken = generateRandomTokenHex(32);
      const sessionTokenHash = await sha256Hex(sessionToken);
      const graceUntilIso = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const deviceSigHash = await computeDeviceSignatureHash();
      const nowIso = new Date().toISOString();
      const hints = extractServerDeviceHints(ua);
      const mergedDeviceInfo =
        data.deviceInfo || hints.deviceName || hints.osVersion
          ? {
              ...(hints.os ? { os: hints.os } : {}),
              ...(hints.browser ? { browser: hints.browser } : {}),
              ...(hints.deviceName ? { deviceName: hints.deviceName } : {}),
              ...(hints.osVersion ? { osVersion: hints.osVersion } : {}),
              ...(data.deviceInfo ?? {}),
              deviceName:
                (data.deviceInfo?.deviceName && data.deviceInfo.deviceName !== "Android Device"
                  ? data.deviceInfo.deviceName
                  : hints.deviceName || data.deviceInfo?.deviceName) || undefined,
              osVersion:
                (data.deviceInfo?.osVersion && data.deviceInfo.osVersion !== "Android"
                  ? data.deviceInfo.osVersion
                  : hints.osVersion || data.deviceInfo?.osVersion) || undefined,
            }
          : null;
      const deviceJson = mergedDeviceInfo ? JSON.stringify(mergedDeviceInfo) : null;

      await sql`
        UPDATE public.access_keys
        SET
          claimed_device_hash = ${effectiveDeviceHash},
          device_fp_hash = COALESCE(${incomingFpHash}, device_fp_hash),
          prev_session_token_hash = ${row.session_token_hash},
          prev_token_expires_at = ${graceUntilIso}::timestamptz,
          session_token_hash = ${sessionTokenHash},
          device_sig_hash = ${deviceSigHash},
          last_seen_at = ${nowIso}::timestamptz,
          user_ip = COALESCE(${safeIp}, user_ip),
          user_agent = COALESCE(${ua}, user_agent),
          device_info = CASE
            WHEN ${deviceJson}::jsonb IS NOT NULL
            THEN COALESCE(device_info, '{}'::jsonb) || ${deviceJson}::jsonb
            ELSE device_info
          END
        WHERE id = ${row.id}
          AND claimed_device_hash IS NOT NULL
      `;

      await session.update({ keyHash, deviceId: effectiveDeviceId, sessionToken });
      return { ok: true as const, reason: "none" as AccessDeniedReason, deviceId: effectiveDeviceId };
    } catch (err) {
      console.error("[resumeDeviceSession] Failed:", err);
      return { ok: false as const, reason: "none" as AccessDeniedReason };
    }
  });

export const getCurrentSessionKey = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("cache-control", "private, no-store");
  try {
    const {
      buildSessionCookieConfig,
      decryptStoredKey,
      sha256Hex,
    } = await import("@/lib/security.server");

    const session = await useSession<AccessSession>(await buildSessionCookieConfig("user"));
    if (!session.data.keyHash || !session.data.deviceId) {
      return { ok: false as const, key: "", userName: "" };
    }

    const deviceHash = await sha256Hex(session.data.deviceId);
    const { ensureNeonSchema } = await import("@/db/neon.server");
    const sql = await ensureNeonSchema();

    const rows = (await sql`
      SELECT
        id,
        key_enc,
        key_plain,
        user_name,
        claimed_device_hash,
        session_token_hash,
        prev_session_token_hash,
        prev_token_expires_at,
        device_sig_hash
      FROM public.access_keys
      WHERE key_hash = ${session.data.keyHash}
      LIMIT 1
    `) as Pick<
      AccessKeyRow,
      | "id"
      | "key_enc"
      | "key_plain"
      | "user_name"
      | "claimed_device_hash"
      | "session_token_hash"
      | "prev_session_token_hash"
      | "prev_token_expires_at"
      | "device_sig_hash"
    >[];

    const row = rows[0];
    if (!row || row.claimed_device_hash !== deviceHash) {
      return { ok: false as const, key: "", userName: "" };
    }

    if (row.session_token_hash) {
      if (!session.data.sessionToken) {
        return { ok: false as const, key: "", userName: "" };
      }
      const tokenHash = await sha256Hex(session.data.sessionToken);
      const matchesCurrent = tokenHash === row.session_token_hash;
      const matchesGrace =
        !matchesCurrent &&
        Boolean(row.prev_session_token_hash) &&
        tokenHash === row.prev_session_token_hash &&
        Boolean(row.prev_token_expires_at) &&
        new Date(row.prev_token_expires_at as string).getTime() > Date.now();
      if (!matchesCurrent && !matchesGrace) {
        return { ok: false as const, key: "", userName: "" };
      }
    }



    const plainKey = (await decryptStoredKey(row.key_enc)) ?? row.key_plain ?? "";
    return {
      ok: Boolean(plainKey),
      key: plainKey,
      userName: row.user_name ?? "",
    };
  } catch {
    return { ok: false as const, key: "", userName: "" };
  }
});

export const clearAccessSession = createServerFn({ method: "POST" }).handler(async () => {
  setResponseHeader("cache-control", "private, no-store");
  let rememberedKey = "";
  let rememberedUserName = "";
  try {
    const {
      buildSessionCookieConfig,
      decryptStoredKey,
      extractClientMeta,
      generateRandomTokenHex,
      logAuditEvent,
      sha256Hex,
    } = await import("@/lib/security.server");
    const session = await useSession<AccessSession>(await buildSessionCookieConfig("user"));
    const existingDeviceId = session.data.deviceId;
    const existingKeyHash = session.data.keyHash;

    // Rotate DB session_token_hash and clear grace token so old tokens cannot be replayed,
    // while keeping claimed_device_hash locked to this device so no other user can claim the key.
    if (existingKeyHash && existingDeviceId) {
      try {
        const deviceHash = await sha256Hex(existingDeviceId);
        const invalidatedTokenHash = await sha256Hex(generateRandomTokenHex(32));
        const { ensureNeonSchema } = await import("@/db/neon.server");
        const sql = await ensureNeonSchema();
        const rows = (await sql`
          UPDATE public.access_keys
          SET
            session_token_hash = ${invalidatedTokenHash},
            prev_session_token_hash = NULL,
            prev_token_expires_at = NULL
          WHERE key_hash = ${existingKeyHash}
            AND claimed_device_hash = ${deviceHash}
          RETURNING id, key_enc, key_plain, user_name
        `) as Pick<AccessKeyRow, "id" | "key_enc" | "key_plain" | "user_name">[];
        if (rows[0]) {
          rememberedKey = (await decryptStoredKey(rows[0].key_enc)) ?? rows[0].key_plain ?? "";
          rememberedUserName = rows[0].user_name ?? "";
          const { ip, ua } = extractClientMeta();
          await logAuditEvent(sql, {
            eventType: "user_logout",
            actor: "user",
            severity: "info",
            keyId: rows[0].id,
            summary: `${rows[0].user_name ?? "User"} signed out (device binding retained)`,
            ip,
            userAgent: ua,
          });
        }
      } catch {
        // Logout should still clear local auth state even if DB telemetry fails
      }
    }

    if (existingDeviceId) {
      // Preserve encrypted deviceId so this same device can re-login with its bound key,
      // while clearing keyHash & sessionToken so access is immediately revoked.
      await session.update({
        keyHash: "",
        sessionToken: "",
        deviceId: existingDeviceId,
      });
    } else {
      await session.clear();
    }
  } catch {
    // Ignore
  }
  return { ok: true as const, key: rememberedKey, userName: rememberedUserName };
});

export const redeemAccessKey = createServerFn({ method: "POST" })
  .validator(
    z.object({
      key: z.string().trim().min(1).max(256),
      userName: z.string().trim().max(80).optional().catch(undefined),
      clientDeviceId: z
        .string()
        .trim()
        .min(16)
        .max(128)
        .regex(/^[A-Za-z0-9_-]+$/)
        .optional()
        .catch(undefined),
      deviceFp: z
        .string()
        .trim()
        .min(32)
        .max(128)
        .regex(/^[a-fA-F0-9]+$/)
        .optional()
        .catch(undefined),
      deviceInfo: deviceInfoSchema,
    }),
  )
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", "private, no-store");

    try {
      const {
        buildSessionCookieConfig,
        checkRateLimit,
        clearRateLimit,
        computeDeviceSignatureHash,
        extractClientMeta,
        extractServerDeviceHints,
        generateRandomTokenHex,
        logAuditEvent,
        normalizeLicenseKey,
        readCookieFromRequest,
        recordFailedAttempt,
        sha256Hex,
      } = await import("@/lib/security.server");

      const sessionConfig = await buildSessionCookieConfig("user");
      const session = await useSession<AccessSession>(sessionConfig);
      const { ip, ua } = extractClientMeta();

      const { ensureNeonSchema } = await import("@/db/neon.server");
      const sql = await ensureNeonSchema();

      // Check global login bucket (max 300 failures / 15 min) AND per-IP bucket (max 8 / 15 min)
      const globalBucket = "login:global";
      const globalRate = await checkRateLimit(sql, globalBucket, 300, 900);
      if (!globalRate.allowed) {
        await logAuditEvent(sql, {
          eventType: "login_global_rate_limited",
          actor: "user",
          severity: "danger",
          summary: `Global login rate limit active (${globalRate.retryAfterSeconds}s left)`,
          ip,
          userAgent: ua,
        });
        return {
          ok: false as const,
          reason: "rate_limited" as AccessDeniedReason,
          retryAfterSeconds: globalRate.retryAfterSeconds,
          detail: "",
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
          detail: "",
        };
      }

      const normalizedKey = normalizeLicenseKey(data.key);
      if (!normalizedKey) {
        return {
          ok: false as const,
          reason: "invalid" as AccessDeniedReason,
          retryAfterSeconds: 0,
          detail: "",
        };
      }

      const keyHash = await sha256Hex(normalizedKey);
      const existingRows = (await sql`
        SELECT
          id,
          claimed_device_hash,
          device_fp_hash,
          session_token_hash,
          claimed_at,
          is_paused,
          expires_at,
          login_count,
          user_name,
          user_ip,
          device_info
        FROM public.access_keys
        WHERE key_hash = ${keyHash}
        LIMIT 1
      `) as Pick<
        AccessKeyRow,
        | "id"
        | "claimed_device_hash"
        | "device_fp_hash"
        | "session_token_hash"
        | "claimed_at"
        | "is_paused"
        | "expires_at"
        | "login_count"
        | "user_name"
        | "user_ip"
        | "device_info"
      >[];

      const existing = existingRows[0];
      if (!existing) {
        const [failed, globalFailed] = await Promise.all([
          recordFailedAttempt(sql, rateBucket, 8, 900, 900),
          recordFailedAttempt(sql, globalBucket, 300, 900, 900),
        ]);
        const blocked = !failed.allowed || !globalFailed.allowed;
        const retryAfter = Math.max(failed.retryAfterSeconds, globalFailed.retryAfterSeconds);

        await logAuditEvent(sql, {
          eventType: !globalFailed.allowed ? "login_global_rate_limited" : "login_invalid_key",
          actor: "user",
          severity: !globalFailed.allowed ? "danger" : "warn",
          summary: !globalFailed.allowed
            ? "Global login rate limit triggered — key attempts temporarily blocked"
            : `Failed login with invalid key (${failed.remaining} attempts left)`,
          ip,
          userAgent: ua,
        });
        return {
          ok: false as const,
          reason: (blocked ? "rate_limited" : "invalid") as AccessDeniedReason,
          retryAfterSeconds: retryAfter,
          detail: "",
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
        return {
          ok: false as const,
          reason: "paused" as AccessDeniedReason,
          retryAfterSeconds: 0,
          detail: "",
        };
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
        return {
          ok: false as const,
          reason: "expired" as AccessDeniedReason,
          retryAfterSeconds: 0,
          detail: "",
        };
      }

      const safeIp = ip === "unknown" ? null : ip;
      const cookieDid = readCookieFromRequest("zimbola_did");
      const candidates = [data.clientDeviceId, session.data.deviceId, cookieDid].filter(
        (v): v is string => Boolean(v && v.trim().length >= 16),
      );
      const incomingFpHash = data.deviceFp ? await sha256Hex(`fp:${data.deviceFp.toLowerCase()}`) : null;

      let deviceId = data.clientDeviceId || session.data.deviceId || cookieDid || crypto.randomUUID();
      let rebindSameDevice = false;

      if (existing.claimed_device_hash) {
        let matchedCandidate: string | null = null;
        for (const cand of candidates) {
          if ((await sha256Hex(cand)) === existing.claimed_device_hash) {
            matchedCandidate = cand;
            break;
          }
        }

        if (matchedCandidate) {
          deviceId = matchedCandidate;
        } else {
          const fpMatched = Boolean(
            incomingFpHash &&
              existing.device_fp_hash &&
              incomingFpHash === existing.device_fp_hash,
          );
          const legacyMatched =
            !existing.device_fp_hash &&
            isLegacySameDeviceMatch(existing.device_info, existing.user_ip, data.deviceInfo, safeIp);

          if (fpMatched || legacyMatched) {
            rebindSameDevice = true;
          } else {
            const [failed, globalFailed] = await Promise.all([
              recordFailedAttempt(sql, rateBucket, 8, 900, 900),
              recordFailedAttempt(sql, globalBucket, 300, 900, 900),
            ]);
            const blocked = !failed.allowed || !globalFailed.allowed;
            const retryAfter = Math.max(failed.retryAfterSeconds, globalFailed.retryAfterSeconds);

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
              reason: (blocked ? "rate_limited" : "used") as AccessDeniedReason,
              retryAfterSeconds: retryAfter,
              detail: "",
            };
          }
        }
      }

      const deviceHash = await sha256Hex(deviceId);
      const sessionToken = generateRandomTokenHex(32);
      const sessionTokenHash = await sha256Hex(sessionToken);
      const graceUntilIso = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const deviceSigHash = await computeDeviceSignatureHash();
      const nowIso = new Date().toISOString();
      const cleanUserName = data.userName?.trim() || existing.user_name || null;
      const hints = extractServerDeviceHints(ua);
      const mergedDeviceInfo = {
        ...(hints.os ? { os: hints.os } : {}),
        ...(hints.browser ? { browser: hints.browser } : {}),
        ...(hints.deviceName ? { deviceName: hints.deviceName } : {}),
        ...(hints.osVersion ? { osVersion: hints.osVersion } : {}),
        ...(data.deviceInfo ?? {}),
        deviceName:
          (data.deviceInfo?.deviceName && data.deviceInfo.deviceName !== "Android Device"
            ? data.deviceInfo.deviceName
            : hints.deviceName || data.deviceInfo?.deviceName) || undefined,
        osVersion:
          (data.deviceInfo?.osVersion && data.deviceInfo.osVersion !== "Android"
            ? data.deviceInfo.osVersion
            : hints.osVersion || data.deviceInfo?.osVersion) || undefined,
      };
      const deviceJson = JSON.stringify(mergedDeviceInfo);
      const expectedPrevClaim = existing.claimed_device_hash;

      const claimedRows = (await sql`
        UPDATE public.access_keys
        SET
          claimed_device_hash = ${deviceHash},
          device_fp_hash = COALESCE(${incomingFpHash}, device_fp_hash),
          prev_session_token_hash = ${existing.session_token_hash},
          prev_token_expires_at = ${graceUntilIso}::timestamptz,
          session_token_hash = ${sessionTokenHash},
          device_sig_hash = ${deviceSigHash},
          claimed_at = COALESCE(claimed_at, ${nowIso}::timestamptz),
          last_seen_at = ${nowIso}::timestamptz,
          login_count = COALESCE(login_count, 0) + 1,
          user_name = ${cleanUserName},
          user_ip = ${safeIp},
          user_agent = ${ua},
          device_info = ${deviceJson}::jsonb
        WHERE id = ${existing.id}
          AND (
            claimed_device_hash IS NULL
            OR claimed_device_hash = ${deviceHash}
            OR (${rebindSameDevice} = true AND claimed_device_hash = ${expectedPrevClaim})
          )
        RETURNING id
      `) as Pick<AccessKeyRow, "id">[];

      if (!claimedRows[0]) {
        return {
          ok: false as const,
          reason: "used" as AccessDeniedReason,
          retryAfterSeconds: 0,
          detail: "",
        };
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

      return {
        ok: true as const,
        reason: "none" as AccessDeniedReason,
        retryAfterSeconds: 0,
        detail: "",
        deviceId,
      };
    } catch (err) {
      console.error("[redeemAccessKey] Failed:", err);
      return {
        ok: false as const,
        reason: "misconfigured" as AccessDeniedReason,
        retryAfterSeconds: 0,
        detail: "",
      };
    }
  });
