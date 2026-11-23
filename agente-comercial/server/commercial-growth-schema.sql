CREATE TABLE IF NOT EXISTS commercial_products (
 connection_id text NOT NULL REFERENCES whatsapp_connections(id), id text NOT NULL,
 data jsonb NOT NULL, version int NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(connection_id,id)
);
CREATE TABLE IF NOT EXISTS commercial_integrations (
 connection_id text NOT NULL, product_id text NOT NULL, secret_cipher text NOT NULL,
 PRIMARY KEY(connection_id,product_id), FOREIGN KEY(connection_id,product_id) REFERENCES commercial_products(connection_id,id)
);
CREATE TABLE IF NOT EXISTS commercial_links (
 id uuid PRIMARY KEY, connection_id text NOT NULL, phone text NOT NULL, product_id text NOT NULL,
 destination text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 FOREIGN KEY(connection_id,phone) REFERENCES leads(connection_id,phone),
 FOREIGN KEY(connection_id,product_id) REFERENCES commercial_products(connection_id,id)
);
CREATE TABLE IF NOT EXISTS commercial_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, connection_id text NOT NULL, phone text NOT NULL,
 product_id text NOT NULL, event_id text NOT NULL, kind text NOT NULL,
 occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL DEFAULT '{}',
 UNIQUE(connection_id,product_id,event_id), FOREIGN KEY(connection_id,phone) REFERENCES leads(connection_id,phone),
 FOREIGN KEY(connection_id,product_id) REFERENCES commercial_products(connection_id,id)
);
CREATE INDEX IF NOT EXISTS commercial_events_contact ON commercial_events(connection_id,phone,occurred_at DESC);
CREATE TABLE IF NOT EXISTS commercial_accounts (
 connection_id text NOT NULL, product_id text NOT NULL, account_id text NOT NULL, phone text NOT NULL,
 PRIMARY KEY(connection_id,product_id,account_id), FOREIGN KEY(connection_id,phone) REFERENCES leads(connection_id,phone)
);
CREATE TABLE IF NOT EXISTS commercial_requests (
 connection_id text NOT NULL, phone text NOT NULL, requested_at timestamptz NOT NULL DEFAULT now(),
 reason text NOT NULL, status text NOT NULL DEFAULT 'waiting', assigned_at timestamptz, assumed_at timestamptz,
 responded_at timestamptz, alerted_at timestamptz, PRIMARY KEY(connection_id,phone),
 FOREIGN KEY(connection_id,phone) REFERENCES leads(connection_id,phone)
);
CREATE TABLE IF NOT EXISTS commercial_telegram (
 company_id text PRIMARY KEY REFERENCES companies(id), token_cipher text, enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS commercial_telegram_recipients (
 company_id text NOT NULL REFERENCES companies(id), user_id uuid NOT NULL REFERENCES users(id),
 chat_cipher text NOT NULL, manager boolean NOT NULL DEFAULT false, PRIMARY KEY(company_id,user_id)
);
CREATE TABLE IF NOT EXISTS commercial_telegram_deliveries (
 notification_id uuid NOT NULL REFERENCES user_notifications(id), user_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(notification_id,user_id)
);
