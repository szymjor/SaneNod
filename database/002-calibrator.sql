BEGIN;
CREATE TABLE IF NOT EXISTS calibrations (
 id uuid PRIMARY KEY,
 owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 desktop_session_id text REFERENCES "session"(id) ON DELETE SET NULL,
 pairing_id uuid REFERENCES pairing_sessions(id) ON DELETE SET NULL,
 settings jsonb NOT NULL,
 sensor text NOT NULL CHECK(sensor IN ('camera','external')),
 measurements jsonb NOT NULL DEFAULT '[]',
 current_index integer NOT NULL DEFAULT 0 CHECK(current_index BETWEEN 0 AND 9),
 sample_nonce uuid NOT NULL,
 status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','measuring','complete','cancelled')),
 adjustments text NOT NULL DEFAULT '' CHECK(length(adjustments)<=2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 CHECK(jsonb_typeof(measurements)='array' AND jsonb_array_length(measurements)<=10)
);
CREATE INDEX IF NOT EXISTS calibrations_owner ON calibrations(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS calibrations_pair ON calibrations(pairing_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS calibrations_active_pair ON calibrations(pairing_id) WHERE pairing_id IS NOT NULL AND status IN ('ready','measuring');
COMMIT;
