ALTER TABLE users ADD COLUMN IF NOT EXISTS accepts_ai_handoff boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS handoff_available boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS handoff_last_seen timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS handoff_presence_company text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_auto_assignment_at timestamptz;
CREATE TABLE IF NOT EXISTS company_handoff_settings(company_id text PRIMARY KEY REFERENCES companies(id),data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS user_notifications(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),company_id text NOT NULL REFERENCES companies(id),connection_id text NOT NULL REFERENCES whatsapp_connections(id),phone text NOT NULL,read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS user_notifications_unread ON user_notifications(user_id,company_id,created_at DESC) WHERE read_at IS NULL;
