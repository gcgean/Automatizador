CREATE TABLE IF NOT EXISTS context_profiles (id text PRIMARY KEY, name text NOT NULL, body text NOT NULL, version int NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS whatsapp_connections (
 id text PRIMARY KEY, name text NOT NULL, phone_number_id text UNIQUE, display_phone text NOT NULL DEFAULT '',
 app_id text NOT NULL DEFAULT '', waba_id text NOT NULL DEFAULT '', context_id text REFERENCES context_profiles(id),
 provider text NOT NULL DEFAULT 'deepseek', enabled boolean NOT NULL DEFAULT false,
 access_token_cipher text, app_secret_cipher text, seller_numbers text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO whatsapp_connections(id,name,enabled) VALUES('default','Comercial Command',true) ON CONFLICT DO NOTHING;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS connection_id text NOT NULL DEFAULT 'default' REFERENCES whatsapp_connections(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS connection_id text NOT NULL DEFAULT 'default' REFERENCES whatsapp_connections(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS connection_id text NOT NULL DEFAULT 'default' REFERENCES whatsapp_connections(id);
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS connection_id text NOT NULL DEFAULT 'default' REFERENCES whatsapp_connections(id);
ALTER TABLE inbox_jobs ADD COLUMN IF NOT EXISTS connection_id text NOT NULL DEFAULT 'default' REFERENCES whatsapp_connections(id);
ALTER TABLE leads DROP CONSTRAINT leads_pkey;
ALTER TABLE leads ADD PRIMARY KEY(connection_id,phone);
ALTER TABLE conversations DROP CONSTRAINT conversations_pkey;
ALTER TABLE conversations ADD PRIMARY KEY(connection_id,phone);
ALTER TABLE messages DROP CONSTRAINT messages_pkey;
ALTER TABLE messages ADD PRIMARY KEY(connection_id,id);
ALTER TABLE deliveries DROP CONSTRAINT deliveries_pkey;
ALTER TABLE deliveries ADD PRIMARY KEY(connection_id,message_id);
ALTER TABLE inbox_jobs DROP CONSTRAINT inbox_jobs_pkey;
ALTER TABLE inbox_jobs ADD PRIMARY KEY(connection_id,id);
CREATE INDEX IF NOT EXISTS messages_connection_time_idx ON messages(connection_id,occurred_at);
CREATE INDEX IF NOT EXISTS leads_connection_time_idx ON leads(connection_id,created_at);
CREATE TABLE IF NOT EXISTS context_versions (context_id text NOT NULL REFERENCES context_profiles(id), version int NOT NULL, body text NOT NULL, source text NOT NULL DEFAULT 'operator', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(context_id,version));
CREATE TABLE IF NOT EXISTS learning_proposals (id text PRIMARY KEY, connection_id text NOT NULL REFERENCES whatsapp_connections(id), context_id text NOT NULL REFERENCES context_profiles(id), base_version int NOT NULL, findings jsonb NOT NULL, suggestion text NOT NULL, status text NOT NULL DEFAULT 'pending', applied_version int, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS lead_outcomes (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, connection_id text NOT NULL REFERENCES whatsapp_connections(id), phone text NOT NULL, outcome text NOT NULL, user_id uuid REFERENCES users(id), occurred_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES('multi-connections-v1');
ALTER TABLE learning_proposals ADD COLUMN IF NOT EXISTS applied_context_id text REFERENCES context_profiles(id);
ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS learning_checked_at timestamptz;
CREATE INDEX IF NOT EXISTS messages_connection_phone_time_idx ON messages(connection_id,phone,occurred_at DESC,id);
