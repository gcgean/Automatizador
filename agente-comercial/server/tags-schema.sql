CREATE TABLE IF NOT EXISTS contact_tags (
 id uuid PRIMARY KEY,
 connection_id text NOT NULL REFERENCES whatsapp_connections(id),
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
 color text NOT NULL CHECK (color IN ('green','blue','purple','pink','yellow','orange','red','gray')),
 UNIQUE(connection_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_tags_name ON contact_tags(connection_id,lower(name));
CREATE TABLE IF NOT EXISTS lead_tags (
 connection_id text NOT NULL,
 phone text NOT NULL,
 tag_id uuid NOT NULL,
 PRIMARY KEY(connection_id,phone,tag_id),
 FOREIGN KEY(connection_id,phone) REFERENCES leads(connection_id,phone) ON DELETE CASCADE,
 FOREIGN KEY(connection_id,tag_id) REFERENCES contact_tags(connection_id,id) ON DELETE CASCADE
);
