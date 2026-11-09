ALTER TABLE users ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','operator','viewer'));
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'operator';
ALTER TABLE users ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS user_connections (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,connection_id text NOT NULL REFERENCES whatsapp_connections(id),PRIMARY KEY(user_id,connection_id));
