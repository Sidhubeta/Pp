import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type DeviceInfoPayload = {
  platform?: string;
  browser?: string;
  os?: string;
  screen?: string;
  timezone?: string;
  language?: string;
};

export type AccessKeyRow = {
  id: string;
  key_hash: string;
  key_enc: string | null;
  key_plain: string | null;
  key_label: string | null;
  is_custom: boolean;
  is_paused: boolean;
  paused_at: string | null;
  claimed_device_hash: string | null;
  session_token_hash: string | null;
  device_sig_hash: string | null;
  claimed_at: string | null;
  last_seen_at: string | null;
  expires_at: string | null;
  login_count: number;
  user_name: string | null;
  user_ip: string | null;
  user_agent: string | null;
  device_info: DeviceInfoPayload | null;
  created_at: string;
};

export type AppSettingRow = {
  key: string;
  value: string;
  updated_at: string;
};

export type AuditLogRow = {
  id: string;
  event_type: string;
  actor: string;
  severity: string;
  key_id: string | null;
  summary: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

let cachedSql: NeonQueryFunction<false, false> | undefined;
let schemaReadyPromise: Promise<void> | undefined;

function getDatabaseUrl(): string {
  const url =
    process.env["DATABASE_URL"] ??
    process.env["NEON_DATABASE_URL"] ??
    process.env["POSTGRES_URL"];

  if (!url || !url.trim()) {
    throw new Error(
      "Missing DATABASE_URL environment variable. Add your Neon PostgreSQL connection string.",
    );
  }
  return url.trim().replace(/^["']|["']$/g, "");
}

export function getNeonSql(): NeonQueryFunction<false, false> {
  if (!cachedSql) {
    cachedSql = neon(getDatabaseUrl());
  }
  return cachedSql;
}

export async function ensureNeonSchema(): Promise<NeonQueryFunction<false, false>> {
  const sql = getNeonSql();
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS public.access_keys (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          key_hash text NOT NULL UNIQUE CHECK (length(key_hash) = 64),
          key_enc text,
          key_plain text,
          key_label text,
          is_custom boolean NOT NULL DEFAULT false,
          is_paused boolean NOT NULL DEFAULT false,
          paused_at timestamptz,
          claimed_device_hash text CHECK (claimed_device_hash IS NULL OR length(claimed_device_hash) = 64),
          session_token_hash text,
          device_sig_hash text,
          claimed_at timestamptz,
          last_seen_at timestamptz,
          expires_at timestamptz,
          login_count integer NOT NULL DEFAULT 0,
          user_name text,
          user_ip text,
          user_agent text,
          device_info jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;

      await sql`
        ALTER TABLE public.access_keys
          ADD COLUMN IF NOT EXISTS key_enc text,
          ADD COLUMN IF NOT EXISTS key_plain text,
          ADD COLUMN IF NOT EXISTS key_label text,
          ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS paused_at timestamptz,
          ADD COLUMN IF NOT EXISTS session_token_hash text,
          ADD COLUMN IF NOT EXISTS device_sig_hash text,
          ADD COLUMN IF NOT EXISTS expires_at timestamptz,
          ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
          ADD COLUMN IF NOT EXISTS login_count integer NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS user_name text,
          ADD COLUMN IF NOT EXISTS user_ip text,
          ADD COLUMN IF NOT EXISTS user_agent text,
          ADD COLUMN IF NOT EXISTS device_info jsonb
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS access_keys_created_at_idx
        ON public.access_keys (created_at DESC)
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS access_keys_claimed_at_idx
        ON public.access_keys (claimed_at DESC)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS public.app_settings (
          key text PRIMARY KEY,
          value text NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `;

      await sql`
        INSERT INTO public.app_settings (key, value)
        VALUES ('buy_key_bot_url', 'https://t.me/ZimbolaKeyBot')
        ON CONFLICT (key) DO NOTHING
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS public.rate_limits (
          bucket text PRIMARY KEY,
          attempts integer NOT NULL DEFAULT 0,
          window_start timestamptz NOT NULL DEFAULT now(),
          blocked_until timestamptz
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS public.audit_logs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          event_type text NOT NULL,
          actor text NOT NULL DEFAULT 'system',
          severity text NOT NULL DEFAULT 'info',
          key_id uuid,
          summary text NOT NULL,
          ip text,
          user_agent text,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
        ON public.audit_logs (created_at DESC)
      `;
    })().catch((err) => {
      schemaReadyPromise = undefined;
      throw err;
    });
  }

  await schemaReadyPromise;
  return sql;
}
