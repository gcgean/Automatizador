ALTER TABLE users ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'legacy' CHECK(access_mode IN ('legacy','custom'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS extra_permissions jsonb NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN IF NOT EXISTS signature_default boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS access_groups(id uuid PRIMARY KEY,name text NOT NULL UNIQUE,description text NOT NULL DEFAULT '',permissions jsonb NOT NULL DEFAULT '[]',active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS user_access_groups(user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,group_id uuid NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,PRIMARY KEY(user_id,group_id));
CREATE TABLE IF NOT EXISTS access_group_connections(group_id uuid NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,connection_id text NOT NULL REFERENCES whatsapp_connections(id),PRIMARY KEY(group_id,connection_id));
-- Permissões separadas para finalizar e cadastrar motivo: quem já classificava leads recebe as duas uma única vez.
DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='closure-permissions-v1') THEN
 UPDATE access_groups SET permissions=permissions||'["conversations.close","closure-reasons.create"]'::jsonb WHERE permissions ? 'leads.manage' AND NOT permissions ? 'conversations.close';
 UPDATE users SET extra_permissions=extra_permissions||'["conversations.close","closure-reasons.create"]'::jsonb WHERE extra_permissions ? 'leads.manage' AND NOT extra_permissions ? 'conversations.close';
 INSERT INTO schema_migrations(version) VALUES('closure-permissions-v1');
END IF; END$$;
