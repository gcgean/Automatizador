CREATE TABLE IF NOT EXISTS companies (
 id text PRIMARY KEY, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 150),
 document text NOT NULL DEFAULT '', contact_email text NOT NULL DEFAULT '',
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO companies(id,name) VALUES('default','Operação atual') ON CONFLICT DO NOTHING;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id text NOT NULL DEFAULT 'default' REFERENCES companies(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_admin boolean NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS company_id text REFERENCES companies(id);
ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS company_id text NOT NULL DEFAULT 'default' REFERENCES companies(id);
ALTER TABLE context_profiles ADD COLUMN IF NOT EXISTS company_id text NOT NULL DEFAULT 'default' REFERENCES companies(id);
ALTER TABLE access_groups ADD COLUMN IF NOT EXISTS company_id text NOT NULL DEFAULT 'default' REFERENCES companies(id);
ALTER TABLE access_groups DROP CONSTRAINT IF EXISTS access_groups_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS access_groups_company_name_idx ON access_groups(company_id,name);
CREATE INDEX IF NOT EXISTS users_company_idx ON users(company_id,id);
CREATE INDEX IF NOT EXISTS connections_company_idx ON whatsapp_connections(company_id,id);
CREATE INDEX IF NOT EXISTS contexts_company_idx ON context_profiles(company_id,id);

-- Ownership is immutable: moving a resource could otherwise expose its existing history.
CREATE OR REPLACE FUNCTION enforce_company_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'A empresa de um registro existente não pode ser alterada' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS company_owner ON users;
CREATE TRIGGER company_owner BEFORE UPDATE OF company_id ON users FOR EACH ROW EXECUTE FUNCTION enforce_company_owner();
DROP TRIGGER IF EXISTS company_owner ON whatsapp_connections;
CREATE TRIGGER company_owner BEFORE UPDATE OF company_id ON whatsapp_connections FOR EACH ROW EXECUTE FUNCTION enforce_company_owner();
DROP TRIGGER IF EXISTS company_owner ON context_profiles;
CREATE TRIGGER company_owner BEFORE UPDATE OF company_id ON context_profiles FOR EACH ROW EXECUTE FUNCTION enforce_company_owner();
DROP TRIGGER IF EXISTS company_owner ON access_groups;
CREATE TRIGGER company_owner BEFORE UPDATE OF company_id ON access_groups FOR EACH ROW EXECUTE FUNCTION enforce_company_owner();
CREATE OR REPLACE FUNCTION enforce_company_relationship() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE left_company text; right_company text;
BEGIN
 IF TG_TABLE_NAME='whatsapp_connections' THEN
  IF NEW.context_id IS NULL THEN RETURN NEW; END IF;
  left_company:=NEW.company_id; SELECT company_id INTO right_company FROM context_profiles WHERE id=NEW.context_id;
 ELSIF TG_TABLE_NAME='user_connections' THEN
  SELECT company_id INTO left_company FROM users WHERE id=NEW.user_id;
  SELECT company_id INTO right_company FROM whatsapp_connections WHERE id=NEW.connection_id;
 ELSIF TG_TABLE_NAME='access_group_connections' THEN
  SELECT company_id INTO left_company FROM access_groups WHERE id=NEW.group_id;
  SELECT company_id INTO right_company FROM whatsapp_connections WHERE id=NEW.connection_id;
 ELSIF TG_TABLE_NAME='user_access_groups' THEN
  SELECT company_id INTO left_company FROM users WHERE id=NEW.user_id;
  SELECT company_id INTO right_company FROM access_groups WHERE id=NEW.group_id;
 END IF;
 IF left_company IS NULL OR right_company IS NULL OR left_company<>right_company THEN RAISE EXCEPTION 'Registros de empresas diferentes não podem ser vinculados' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS company_relationship ON whatsapp_connections;
CREATE TRIGGER company_relationship BEFORE INSERT OR UPDATE OF context_id ON whatsapp_connections FOR EACH ROW EXECUTE FUNCTION enforce_company_relationship();
DROP TRIGGER IF EXISTS company_relationship ON user_connections;
CREATE TRIGGER company_relationship BEFORE INSERT OR UPDATE ON user_connections FOR EACH ROW EXECUTE FUNCTION enforce_company_relationship();
DROP TRIGGER IF EXISTS company_relationship ON access_group_connections;
CREATE TRIGGER company_relationship BEFORE INSERT OR UPDATE ON access_group_connections FOR EACH ROW EXECUTE FUNCTION enforce_company_relationship();
DROP TRIGGER IF EXISTS company_relationship ON user_access_groups;
CREATE TRIGGER company_relationship BEFORE INSERT OR UPDATE ON user_access_groups FOR EACH ROW EXECUTE FUNCTION enforce_company_relationship();
INSERT INTO schema_migrations(version) VALUES('companies-v1') ON CONFLICT DO NOTHING;
