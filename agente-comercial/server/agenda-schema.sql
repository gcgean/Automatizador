CREATE TABLE IF NOT EXISTS agenda_settings (
 connection_id text PRIMARY KEY REFERENCES whatsapp_connections(id),api_key_cipher text,
 enabled boolean NOT NULL DEFAULT false,procedure_id integer,technician_ids integer[] NOT NULL DEFAULT '{}',
 horizon_days integer NOT NULL DEFAULT 7 CHECK(horizon_days BETWEEN 1 AND 31),max_options integer NOT NULL DEFAULT 3 CHECK(max_options BETWEEN 2 AND 5),
 weekdays integer[] NOT NULL DEFAULT '{1,2,3,4,5}',start_time text NOT NULL DEFAULT '08:00',end_time text NOT NULL DEFAULT '18:00',
 version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS agenda_offers (
 id uuid PRIMARY KEY,connection_id text NOT NULL REFERENCES whatsapp_connections(id),phone text NOT NULL,inbound_id text NOT NULL,
 options jsonb NOT NULL,config_version integer NOT NULL,expires_at timestamptz NOT NULL,offered_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(connection_id,inbound_id)
);
CREATE INDEX IF NOT EXISTS agenda_offers_phone_idx ON agenda_offers(connection_id,phone,created_at DESC);
CREATE TABLE IF NOT EXISTS agenda_selections (
 connection_id text NOT NULL REFERENCES whatsapp_connections(id),phone text NOT NULL,offer_id uuid NOT NULL REFERENCES agenda_offers(id),option_id text NOT NULL,
 selection_message_id text NOT NULL,confirmation_sent_at timestamptz,expires_at timestamptz NOT NULL,PRIMARY KEY(connection_id,phone)
);
CREATE TABLE IF NOT EXISTS agenda_bookings (
 id uuid PRIMARY KEY,connection_id text NOT NULL REFERENCES whatsapp_connections(id),phone text NOT NULL,inbound_id text NOT NULL,offer_id uuid NOT NULL REFERENCES agenda_offers(id),
 option_data jsonb NOT NULL,status text NOT NULL CHECK(status IN ('sending','uncertain','confirmed','conflict','rejected','not_created','cancelled')),
 remote_id bigint,response jsonb,error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(connection_id,inbound_id),UNIQUE(offer_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS agenda_one_uncertain_idx ON agenda_bookings(connection_id,phone) WHERE status IN ('sending','uncertain');
