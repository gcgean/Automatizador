CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS leads (
 phone text PRIMARY KEY CHECK (phone ~ '^[0-9]+$'),
 data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 status text GENERATED ALWAYS AS (data->>'status') STORED,
 temperature text GENERATED ALWAYS AS (data->>'temperatura') STORED
);
CREATE INDEX IF NOT EXISTS leads_created_idx ON leads(created_at);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);
CREATE TABLE IF NOT EXISTS conversations (phone text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS messages (
 id text PRIMARY KEY, phone text NOT NULL, direction text NOT NULL CHECK (direction IN ('in','out')),
 occurred_at timestamptz NOT NULL DEFAULT now(), message_id text, data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_phone_time_idx ON messages(phone,occurred_at,id);
CREATE INDEX IF NOT EXISTS messages_time_idx ON messages(occurred_at);
CREATE INDEX IF NOT EXISTS messages_meta_idx ON messages(message_id);
CREATE TABLE IF NOT EXISTS deliveries (message_id text PRIMARY KEY, status text NOT NULL, rank smallint NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS inbox_jobs (id text PRIMARY KEY, phone text NOT NULL, status text NOT NULL CHECK (status IN ('queued','processing','done','attention')), received_at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS inbox_phone_status_idx ON inbox_jobs(phone,status);
CREATE TABLE IF NOT EXISTS settings (id smallint PRIMARY KEY CHECK (id=1), data jsonb NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text, setup_hash text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS audit_log (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id uuid REFERENCES users(id), action text NOT NULL, details jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE users ADD COLUMN IF NOT EXISTS setup_expires_at timestamptz;
CREATE TABLE IF NOT EXISTS auth_throttle (key text PRIMARY KEY, attempts int NOT NULL DEFAULT 1, window_start timestamptz NOT NULL DEFAULT now());


