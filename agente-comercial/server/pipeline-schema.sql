CREATE TABLE IF NOT EXISTS pipeline_stages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id text NOT NULL REFERENCES companies(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 40),position integer NOT NULL CHECK(position BETWEEN 0 AND 3),color text NOT NULL CHECK(color ~ '^#[0-9a-fA-F]{6}$'),
 UNIQUE(company_id,position),UNIQUE(company_id,id)
);
CREATE OR REPLACE FUNCTION create_company_pipeline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO pipeline_stages(company_id,name,position,color) SELECT NEW.id,v.name,v.position,v.color FROM (VALUES('Novos contatos',0,'#087bf2'),('Em qualificação',1,'#12ad86'),('Apresentação',2,'#e0a400'),('Proposta',3,'#8054e8'))v(name,position,color) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS new_company_pipeline ON companies;
CREATE TRIGGER new_company_pipeline AFTER INSERT ON companies FOR EACH ROW EXECUTE FUNCTION create_company_pipeline();
INSERT INTO pipeline_stages(company_id,name,position,color) SELECT e.id,v.name,v.position,v.color FROM companies e CROSS JOIN (VALUES('Novos contatos',0,'#087bf2'),('Em qualificação',1,'#12ad86'),('Apresentação',2,'#e0a400'),('Proposta',3,'#8054e8'))v(name,position,color) ON CONFLICT DO NOTHING;
CREATE UNIQUE INDEX IF NOT EXISTS connections_company_identity_idx ON whatsapp_connections(company_id,id);
CREATE TABLE IF NOT EXISTS pipeline_opportunities (
 id uuid PRIMARY KEY,company_id text NOT NULL REFERENCES companies(id),connection_id text NOT NULL,phone text NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 150),stage_id uuid NOT NULL,owner_id uuid REFERENCES users(id),
 value_cents bigint NOT NULL DEFAULT 0 CHECK(value_cents BETWEEN 0 AND 100000000000000),status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','won','lost')),
 next_action text NOT NULL DEFAULT '' CHECK(length(next_action)<=300),due_at timestamptz,loss_reason text NOT NULL DEFAULT '' CHECK(length(loss_reason)<=500),
 source text NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','automatic')),stage_manual boolean NOT NULL DEFAULT false,create_hash text,
 version integer NOT NULL DEFAULT 1,closed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,id),FOREIGN KEY(company_id,connection_id) REFERENCES whatsapp_connections(company_id,id),
 FOREIGN KEY(connection_id,phone) REFERENCES leads(connection_id,phone),FOREIGN KEY(company_id,stage_id) REFERENCES pipeline_stages(company_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_auto_contact_idx ON pipeline_opportunities(connection_id,phone) WHERE source='automatic';
CREATE INDEX IF NOT EXISTS pipeline_company_status_idx ON pipeline_opportunities(company_id,status,stage_id);
CREATE INDEX IF NOT EXISTS pipeline_owner_due_idx ON pipeline_opportunities(company_id,owner_id,due_at) WHERE status='open';
CREATE TABLE IF NOT EXISTS pipeline_notes (
 id uuid PRIMARY KEY,company_id text NOT NULL,opportunity_id uuid NOT NULL,user_id uuid REFERENCES users(id),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,opportunity_id) REFERENCES pipeline_opportunities(company_id,id)
);
CREATE INDEX IF NOT EXISTS pipeline_notes_opportunity_idx ON pipeline_notes(opportunity_id,created_at DESC);
CREATE OR REPLACE FUNCTION enforce_pipeline_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.owner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.owner_id AND company_id=NEW.company_id) THEN RAISE EXCEPTION 'Responsável de outra empresa' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.company_id<>OLD.company_id OR NEW.connection_id<>OLD.connection_id OR NEW.phone<>OLD.phone) THEN RAISE EXCEPTION 'A origem da oportunidade não pode ser alterada' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pipeline_owner ON pipeline_opportunities;
CREATE TRIGGER pipeline_owner BEFORE INSERT OR UPDATE ON pipeline_opportunities FOR EACH ROW EXECUTE FUNCTION enforce_pipeline_owner();
