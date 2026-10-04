BEGIN;
CREATE TABLE IF NOT EXISTS pairing_sessions (
 id uuid PRIMARY KEY,
 owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 desktop_session_id text NOT NULL REFERENCES "session"(id) ON DELETE CASCADE,
 phone_session_id text REFERENCES "session"(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 token_expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
 expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
 paired_at timestamptz,
 revoked_at timestamptz,
 CHECK(phone_session_id IS NULL OR phone_session_id <> desktop_session_id)
);
CREATE INDEX IF NOT EXISTS pairing_owner ON pairing_sessions(owner_id, desktop_session_id);
CREATE TABLE IF NOT EXISTS device_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 pairing_id uuid NOT NULL REFERENCES pairing_sessions(id) ON DELETE CASCADE,
 sender_session_id text NOT NULL REFERENCES "session"(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('ping','pong','signal')),
 payload jsonb NOT NULL CHECK(octet_length(payload::text) <= 16384),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS device_events_pair ON device_events(pairing_id,id);
CREATE TABLE IF NOT EXISTS api_rate_limits (
 bucket text NOT NULL, window_start timestamptz NOT NULL, count integer NOT NULL,
 PRIMARY KEY(bucket,window_start)
);
-- Only the trusted Next.js backend has database credentials. There is no public database API.
COMMIT;
