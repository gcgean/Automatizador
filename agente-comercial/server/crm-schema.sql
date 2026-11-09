CREATE TABLE IF NOT EXISTS crm_settings (
 connection_id text PRIMARY KEY REFERENCES whatsapp_connections(id),enabled boolean NOT NULL DEFAULT false,token_cipher text,
 canal text NOT NULL DEFAULT 'WhatsApp',segmento text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS crm_sync (
 connection_id text NOT NULL REFERENCES whatsapp_connections(id),phone text NOT NULL,codigo_externo text NOT NULL UNIQUE,
 payload jsonb NOT NULL,revision bigint NOT NULL DEFAULT 1,sent_hash text,
 status text NOT NULL CHECK(status IN ('pending','sending','synced','error','skipped')),attempts integer NOT NULL DEFAULT 0,
 remote_id text,warnings jsonb NOT NULL DEFAULT '[]',error text,next_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(connection_id,phone)
);
CREATE INDEX IF NOT EXISTS crm_pending_idx ON crm_sync(next_at) WHERE status='pending';
