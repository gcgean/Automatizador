CREATE TABLE IF NOT EXISTS whatsapp_calls (
 id uuid PRIMARY KEY,
 connection_id text NOT NULL REFERENCES whatsapp_connections(id),
 call_id text,
 phone text NOT NULL,
 direction text NOT NULL,
 state text NOT NULL,
 operator_id text,
 operator_name text,
 client_id uuid,
 remote_session jsonb,
 heartbeat_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(connection_id,call_id)
);
CREATE INDEX IF NOT EXISTS whatsapp_calls_connection ON whatsapp_calls(connection_id,created_at DESC);
