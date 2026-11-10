CREATE TABLE IF NOT EXISTS meta_conversion_settings (
 connection_id text PRIMARY KEY REFERENCES whatsapp_connections(id),
 dataset_id text NOT NULL, enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS meta_ad_attribution (
 connection_id text NOT NULL REFERENCES whatsapp_connections(id), phone text NOT NULL,
 ctwa_clid text NOT NULL, source_id text NOT NULL DEFAULT '', inbound_id text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(connection_id,phone)
);
CREATE TABLE IF NOT EXISTS meta_conversion_events (
 id uuid PRIMARY KEY, connection_id text NOT NULL REFERENCES whatsapp_connections(id),
 phone text NOT NULL, event_name text NOT NULL CHECK(event_name IN ('QualifiedLead','Purchase')),
 dedupe_key text NOT NULL, event_time bigint NOT NULL, payload jsonb,
 status text NOT NULL CHECK(status IN ('queued','sending','sent','error','uncertain','skipped','cancelled')),
 detail text, dataset_id text, user_id text, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(connection_id,dedupe_key)
);
CREATE INDEX IF NOT EXISTS meta_conversion_queue_idx ON meta_conversion_events(created_at) WHERE status='queued';
CREATE INDEX IF NOT EXISTS meta_conversion_contact_idx ON meta_conversion_events(connection_id,phone,created_at DESC);
