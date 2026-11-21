-- Hardened Neon PostgreSQL schema for Zimbola Clux
-- The server auto-initializes these tables on first request, or run manually in Neon SQL Editor.

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
);

CREATE INDEX IF NOT EXISTS access_keys_created_at_idx
  ON public.access_keys (created_at DESC);

CREATE INDEX IF NOT EXISTS access_keys_claimed_at_idx
  ON public.access_keys (claimed_at DESC);

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (key, value)
VALUES ('buy_key_bot_url', 'https://t.me/ZimbolaKeyBot')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz
);

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
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON public.audit_logs (created_at DESC);
