CREATE TABLE IF NOT EXISTS browser_push_keys(id int PRIMARY KEY CHECK(id=1),public_key text NOT NULL,private_key_cipher text NOT NULL);
CREATE TABLE IF NOT EXISTS browser_push_subscriptions(endpoint_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),company_id text NOT NULL REFERENCES companies(id),session_hash text NOT NULL,subscription_cipher text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS browser_push_subscriptions_user ON browser_push_subscriptions(user_id,company_id);
CREATE TABLE IF NOT EXISTS browser_push_deliveries(notification_id uuid NOT NULL REFERENCES user_notifications(id),endpoint_hash text NOT NULL,status text NOT NULL,detail text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(notification_id,endpoint_hash));

ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'assignment';
