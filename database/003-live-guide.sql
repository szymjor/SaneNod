BEGIN;
CREATE TABLE IF NOT EXISTS calibration_guides (
 pairing_id uuid PRIMARY KEY REFERENCES pairing_sessions(id) ON DELETE CASCADE,
 test text CHECK(test IN ('shadows','highlights','white','uniform','black','gradient')),
 revision uuid NOT NULL,
 reading jsonb,
 reading_at timestamptz,
 observations jsonb NOT NULL DEFAULT '{}'::jsonb,
 CHECK(reading IS NULL OR octet_length(reading::text) <= 4096),
 CHECK(octet_length(observations::text) <= 16384)
);
COMMIT;
