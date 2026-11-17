CREATE TABLE IF NOT EXISTS meta_ads_accounts (
 company_id text PRIMARY KEY REFERENCES companies(id),connection_id text NOT NULL,
 account_id text NOT NULL UNIQUE CHECK(account_id ~ '^act_[0-9]{5,30}$'),
 account_name text NOT NULL,currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),timezone_name text NOT NULL,
 access_token_cipher text,enabled boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,connection_id) REFERENCES whatsapp_connections(company_id,id)
);
CREATE INDEX IF NOT EXISTS meta_ad_attribution_connection_time_idx ON meta_ad_attribution(connection_id,occurred_at);

ALTER TABLE meta_ads_accounts ADD COLUMN IF NOT EXISTS campaign_scopes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(campaign_scopes)='array');
