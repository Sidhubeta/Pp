import { createFileRoute } from "@tanstack/react-router";

const headers = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
};

async function handleGenerateKey(request: Request): Promise<Response> {
  const {
    checkRateLimit,
    clearRateLimit,
    constantTimeSecretMatch,
    encryptKeyForStorage,
    extractClientMeta,
    logAuditEvent,
    recordFailedAttempt,
    sha256Hex,
  } = await import("@/lib/security.server");

  const expected = process.env["ZIMADMIN_PASSWORD"]?.trim();
  if (!expected) {
    return new Response("Key generation unavailable.", { status: 503, headers });
  }

  const url = new URL(request.url);
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const headerToken = request.headers.get("x-admin-token")?.trim() ?? "";
  const queryToken = url.searchParams.get("token")?.trim() ?? "";
  const token = bearerToken || headerToken || queryToken;

  const { ip, ua } = extractClientMeta(request);
  const { ensureNeonSchema } = await import("@/db/neon.server");
  const sql = await ensureNeonSchema();

  const rateBucket = `api_gen:${ip}`;
  const rate = await checkRateLimit(sql, rateBucket, 5, 900);
  if (!rate.allowed) {
    return new Response(`Too many failed requests. Retry in ${rate.retryAfterSeconds}s.`, {
      status: 429,
      headers: { ...headers, "retry-after": String(rate.retryAfterSeconds) },
    });
  }

  if (!token || !(await constantTimeSecretMatch(token, expected))) {
    await recordFailedAttempt(sql, rateBucket, 5, 900, 900);
    await logAuditEvent(sql, {
      eventType: "bot_api_unauthorized",
      actor: "bot",
      severity: "danger",
      summary: "Unauthorized /api/public/generate-key attempt",
      ip,
      userAgent: ua,
    });
    return new Response("Unauthorized.", { status: 401, headers });
  }

  await clearRateLimit(sql, rateBucket);

  const label = url.searchParams.get("label")?.trim().slice(0, 80) || "Bot Generated";
  const daysParam = Number(url.searchParams.get("days") ?? "0");
  const expiresAt =
    Number.isFinite(daysParam) && daysParam > 0
      ? new Date(Date.now() + Math.floor(daysParam) * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const key = `ZIM-${hex.match(/.{4}/g)?.join("-") ?? hex}`;
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
  } catch {
    return new Response("Couldn't create a key. Try again.", { status: 500, headers });
  }

  return new Response(key, { status: 200, headers });
}

// Recommended: POST /api/public/generate-key with header "Authorization: Bearer <ZIMADMIN_PASSWORD>"
// Also supports GET /api/public/generate-key?token=<ZIMADMIN_PASSWORD>&label=Buyer&days=30
export const Route = createFileRoute("/api/public/generate-key")({
  server: {
    handlers: {
      GET: ({ request }) => handleGenerateKey(request),
      POST: ({ request }) => handleGenerateKey(request),
    },
  },
});
