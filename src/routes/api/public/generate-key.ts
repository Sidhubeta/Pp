import { createFileRoute } from "@tanstack/react-router";

const headers = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
};

type GenerateKeyBody = {
  label?: unknown;
  days?: unknown;
};

async function handleGenerateKey(request: Request): Promise<Response> {
  const {
    checkRateLimit,
    clearRateLimit,
    constantTimeSecretMatch,
    encryptKeyForStorage,
    extractClientMeta,
    generateRandomLicenseKey,
    logAuditEvent,
    recordFailedAttempt,
    sha256Hex,
  } = await import("@/lib/security.server");

  // Dedicated BOT_API_TOKEN (>= 32 chars), completely separate from the admin passcode.
  const expected = process.env["BOT_API_TOKEN"]?.trim();
  if (!expected || expected.length < 32) {
    return new Response("Key generation unavailable.", { status: 503, headers });
  }

  // Accept token ONLY via Authorization: Bearer <token>
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const token = bearerMatch?.[1]?.trim() ?? "";

  const { ip, ua } = extractClientMeta(request);
  const { ensureNeonSchema } = await import("@/db/neon.server");
  const sql = await ensureNeonSchema();

  // Check global bucket (max 20 failures / 1 hour) and per-IP bucket (max 5 / 15 min)
  const globalBucket = "api_gen:global";
  const globalRate = await checkRateLimit(sql, globalBucket, 20, 3600);
  if (!globalRate.allowed) {
    await logAuditEvent(sql, {
      eventType: "bot_api_global_rate_limited",
      actor: "bot",
      severity: "danger",
      summary: `Global bot API rate limit active (${globalRate.retryAfterSeconds}s left)`,
      ip,
      userAgent: ua,
    });
    return new Response(`Too many failed requests. Retry in ${globalRate.retryAfterSeconds}s.`, {
      status: 429,
      headers: { ...headers, "retry-after": String(globalRate.retryAfterSeconds) },
    });
  }

  const rateBucket = `api_gen:${ip}`;
  const rate = await checkRateLimit(sql, rateBucket, 5, 900);
  if (!rate.allowed) {
    return new Response(`Too many failed requests. Retry in ${rate.retryAfterSeconds}s.`, {
      status: 429,
      headers: { ...headers, "retry-after": String(rate.retryAfterSeconds) },
    });
  }

  if (!token || !(await constantTimeSecretMatch(token, expected))) {
    const [, globalFailed] = await Promise.all([
      recordFailedAttempt(sql, rateBucket, 5, 900, 900),
      recordFailedAttempt(sql, globalBucket, 20, 3600, 3600),
    ]);
    await logAuditEvent(sql, {
      eventType: !globalFailed.allowed ? "bot_api_global_rate_limited" : "bot_api_unauthorized",
      actor: "bot",
      severity: "danger",
      summary: !globalFailed.allowed
        ? "Global bot API rate limit triggered — locked for 1 hour"
        : "Unauthorized /api/public/generate-key attempt",
      ip,
      userAgent: ua,
    });
    return new Response("Unauthorized.", { status: 401, headers });
  }

  await clearRateLimit(sql, rateBucket);

  let body: GenerateKeyBody = {};
  try {
    const rawBody = await request.text();
    if (rawBody.trim()) {
      const parsed = JSON.parse(rawBody) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as GenerateKeyBody;
      } else {
        return new Response("Invalid JSON body.", { status: 400, headers });
      }
    }
  } catch {
    return new Response("Invalid JSON body.", { status: 400, headers });
  }

  const rawLabel = typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";
  const label = rawLabel || "Bot Generated";

  const rawDays =
    typeof body.days === "number"
      ? body.days
      : typeof body.days === "string" && body.days.trim()
        ? Number(body.days)
        : 0;
  const days =
    Number.isFinite(rawDays) && rawDays > 0 ? Math.min(3650, Math.floor(rawDays)) : 0;
  const expiresAt =
    days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;

  const key = generateRandomLicenseKey();
  const keyHash = await sha256Hex(key);
  const keyEnc = await encryptKeyForStorage(key);

  try {
    const inserted = (await sql`
      INSERT INTO public.access_keys (key_hash, key_enc, key_plain, key_label, is_custom, expires_at)
      VALUES (${keyHash}, ${keyEnc}, NULL, ${label}, false, ${expiresAt}::timestamptz)
      RETURNING id
    `) as { id: string }[];

    await logAuditEvent(sql, {
      eventType: "bot_key_generated",
      actor: "bot",
      severity: "info",
      keyId: inserted[0]?.id ?? null,
      summary: `Bot generated key (${label})`,
      ip,
      userAgent: ua,
    });
  } catch (err) {
    console.error("[generate-key] Failed to insert key:", err);
    return new Response("Couldn't create a key. Try again.", { status: 500, headers });
  }

  return new Response(key, { status: 200, headers });
}

// POST /api/public/generate-key
// Header: Authorization: Bearer <BOT_API_TOKEN>
// Body (JSON): { "label": "Buyer", "days": 30 }
export const Route = createFileRoute("/api/public/generate-key")({
  server: {
    handlers: {
      POST: ({ request }) => handleGenerateKey(request),
    },
  },
});
