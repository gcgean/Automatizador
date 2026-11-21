CREATE TABLE IF NOT EXISTS departments (
 id uuid PRIMARY KEY, company_id text NOT NULL REFERENCES companies(id), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 active boolean NOT NULL DEFAULT true, UNIQUE(company_id,name)
);
CREATE TABLE IF NOT EXISTS department_users (
 department_id uuid REFERENCES departments(id), user_id uuid REFERENCES users(id), PRIMARY KEY(department_id,user_id)
);
CREATE TABLE IF NOT EXISTS department_connections (
 department_id uuid REFERENCES departments(id), connection_id text REFERENCES whatsapp_connections(id), PRIMARY KEY(department_id,connection_id)
);
CREATE TABLE IF NOT EXISTS service_tickets (
 id bigserial PRIMARY KEY, connection_id text NOT NULL REFERENCES whatsapp_connections(id), phone text NOT NULL,
 opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
 department_id uuid REFERENCES departments(id), assigned_user_id uuid REFERENCES users(id), snapshot jsonb NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX IF NOT EXISTS ticket_one_open ON service_tickets(connection_id,phone) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS ticket_contact_history ON service_tickets(connection_id,phone,id DESC);
CREATE TABLE IF NOT EXISTS ticket_transfers (
 id bigserial PRIMARY KEY, ticket_id bigint NOT NULL REFERENCES service_tickets(id), at timestamptz NOT NULL DEFAULT now(),
 actor_id uuid REFERENCES users(id), from_user uuid REFERENCES users(id), to_user uuid REFERENCES users(id),
 from_department uuid REFERENCES departments(id), to_department uuid REFERENCES departments(id)
);
CREATE TABLE IF NOT EXISTS ticket_receipts (
 connection_id text NOT NULL REFERENCES whatsapp_connections(id), message_id text NOT NULL, ticket_id bigint REFERENCES service_tickets(id),
 PRIMARY KEY(connection_id,message_id)
);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS ticket_id bigint REFERENCES service_tickets(id);
-- A single legacy ticket preserves existing messages without inventing past ticket boundaries.
INSERT INTO service_tickets(connection_id,phone,opened_at,closed_at,assigned_user_id,snapshot)
 SELECT l.connection_id,l.phone,l.created_at,CASE WHEN l.data->>'conversationClosed'='true' THEN COALESCE(NULLIF(l.data->>'conversationClosedAt','')::timestamptz,l.updated_at) END,
 u.id,l.data FROM leads l LEFT JOIN users u ON u.id::text=l.data->>'assignedUserId'
 WHERE NOT EXISTS(SELECT 1 FROM service_tickets t WHERE t.connection_id=l.connection_id AND t.phone=l.phone);
UPDATE messages m SET ticket_id=t.id FROM service_tickets t WHERE m.ticket_id IS NULL AND t.connection_id=m.connection_id AND t.phone=m.phone
 AND t.id=(SELECT min(t2.id) FROM service_tickets t2 WHERE t2.connection_id=m.connection_id AND t2.phone=m.phone);
CREATE OR REPLACE FUNCTION sync_service_ticket() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ticket service_tickets; owner uuid; dept uuid;
BEGIN
 SELECT id INTO owner FROM users WHERE id::text=NEW.data->>'assignedUserId';
 SELECT id INTO dept FROM departments WHERE id::text=NEW.data->>'departmentId';
 SELECT * INTO ticket FROM service_tickets WHERE connection_id=NEW.connection_id AND phone=NEW.phone AND closed_at IS NULL FOR UPDATE;
 IF ticket.id IS NULL AND COALESCE(NEW.data->>'conversationClosed','false')<>'true' THEN
  INSERT INTO service_tickets(connection_id,phone,department_id,assigned_user_id,snapshot) VALUES(NEW.connection_id,NEW.phone,dept,owner,NEW.data) RETURNING * INTO ticket;
 END IF;
 IF ticket.id IS NOT NULL THEN
  IF ticket.assigned_user_id IS DISTINCT FROM owner OR ticket.department_id IS DISTINCT FROM dept THEN
   INSERT INTO ticket_transfers(ticket_id,actor_id,from_user,to_user,from_department,to_department)
    VALUES(ticket.id,NULLIF(current_setting('app.ticket_actor',true),'')::uuid,ticket.assigned_user_id,owner,ticket.department_id,dept);
  END IF;
  UPDATE service_tickets SET assigned_user_id=owner,department_id=dept,snapshot=NEW.data,
   closed_at=CASE WHEN NEW.data->>'conversationClosed'='true' THEN now() ELSE NULL END WHERE id=ticket.id;
  UPDATE leads SET data=data||jsonb_build_object('ticketId',ticket.id) WHERE connection_id=NEW.connection_id AND phone=NEW.phone AND data->>'ticketId' IS DISTINCT FROM ticket.id::text;
 ELSE
  SELECT * INTO ticket FROM service_tickets WHERE connection_id=NEW.connection_id AND phone=NEW.phone ORDER BY id DESC LIMIT 1;
  IF ticket.id IS NOT NULL THEN UPDATE leads SET data=data||jsonb_build_object('ticketId',ticket.id) WHERE connection_id=NEW.connection_id AND phone=NEW.phone AND data->>'ticketId' IS DISTINCT FROM ticket.id::text; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS service_ticket_sync ON leads;
CREATE TRIGGER service_ticket_sync AFTER INSERT OR UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION sync_service_ticket();
UPDATE leads l SET data=l.data||jsonb_build_object('ticketId',t.id) FROM service_tickets t WHERE t.connection_id=l.connection_id AND t.phone=l.phone AND t.id=(SELECT max(id) FROM service_tickets WHERE connection_id=l.connection_id AND phone=l.phone) AND NOT l.data ? 'ticketId';
CREATE OR REPLACE FUNCTION attribute_ticket_message() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.ticket_id IS NULL THEN
  SELECT ticket_id INTO NEW.ticket_id FROM ticket_receipts WHERE connection_id=NEW.connection_id AND message_id=NEW.id;
  IF NEW.ticket_id IS NULL THEN
   SELECT id INTO NEW.ticket_id FROM service_tickets WHERE connection_id=NEW.connection_id AND phone=NEW.phone
    AND opened_at<=NEW.occurred_at ORDER BY opened_at DESC,id DESC LIMIT 1;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ticket_message ON messages;
CREATE TRIGGER ticket_message BEFORE INSERT ON messages FOR EACH ROW EXECUTE FUNCTION attribute_ticket_message();

CREATE INDEX IF NOT EXISTS messages_ticket_time ON messages(ticket_id,occurred_at DESC);

-- Motivos de finalização por empresa; um chamado pode ser finalizado com vários motivos.
CREATE TABLE IF NOT EXISTS closure_reasons (
 id uuid PRIMARY KEY, company_id text NOT NULL REFERENCES companies(id), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 active boolean NOT NULL DEFAULT true, system_key text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS closure_reason_name ON closure_reasons(company_id,lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS closure_reason_system ON closure_reasons(company_id,system_key) WHERE system_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS ticket_closure_reasons (
 ticket_id bigint NOT NULL REFERENCES service_tickets(id), reason_id uuid NOT NULL REFERENCES closure_reasons(id),
 actor_id uuid REFERENCES users(id), at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(ticket_id,reason_id)
);
CREATE INDEX IF NOT EXISTS ticket_closure_reason_idx ON ticket_closure_reasons(reason_id);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS require_closure_reason boolean NOT NULL DEFAULT false;
ALTER TABLE closure_reasons ADD COLUMN IF NOT EXISTS created_by_ai boolean NOT NULL DEFAULT false;

-- Canal da conexão: whatsapp (padrão) ou instagram. Para o Instagram, phone_number_id guarda o ID da conta e display_phone o @usuário.
ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp';

-- YouTube (comentários dos vídeos do canal). Na conexão, phone_number_id guarda o ID do canal (UC...) e
-- access_token_cipher o token de atualização do Google. Cada comentário lido fica aqui uma única vez.
CREATE TABLE IF NOT EXISTS youtube_channels(connection_id text PRIMARY KEY REFERENCES whatsapp_connections(id) ON DELETE CASCADE,channel_id text,channel_title text NOT NULL DEFAULT '',whatsapp_link text NOT NULL DEFAULT '',auto_reply boolean NOT NULL DEFAULT false,connected_at timestamptz,last_poll_at timestamptz,last_error text);
CREATE TABLE IF NOT EXISTS youtube_comments(connection_id text NOT NULL REFERENCES whatsapp_connections(id) ON DELETE CASCADE,thread_id text NOT NULL,comment_id text NOT NULL,video_id text NOT NULL DEFAULT '',video_title text NOT NULL DEFAULT '',author_channel_id text NOT NULL DEFAULT '',author_key text NOT NULL DEFAULT '',author_name text NOT NULL DEFAULT '',text text NOT NULL DEFAULT '',published_at timestamptz,status text NOT NULL DEFAULT 'new',attempts int NOT NULL DEFAULT 0,suggestion text,reason text,reply_id text,replied_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(connection_id,thread_id));
CREATE INDEX IF NOT EXISTS youtube_comments_author_idx ON youtube_comments(connection_id,author_key,published_at DESC);

ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS primary_department_id uuid REFERENCES departments(id);
