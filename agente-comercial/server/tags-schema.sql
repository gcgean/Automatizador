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
ALTER TABLE lead_tags ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','ai_interest'));
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='lead_tags'::regclass AND conname='lead_tags_source_check' AND pg_get_constraintdef(oid) LIKE '%cadence_no_response%') THEN
  ALTER TABLE lead_tags DROP CONSTRAINT IF EXISTS lead_tags_source_check;
  ALTER TABLE lead_tags ADD CONSTRAINT lead_tags_source_check CHECK(source IN ('manual','ai_interest','cadence_no_response'));
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS lead_tag_suppressions (
 connection_id text NOT NULL,phone text NOT NULL,tag_id uuid NOT NULL,
 PRIMARY KEY(connection_id,phone,tag_id),
 FOREIGN KEY(connection_id,phone) REFERENCES leads(connection_id,phone) ON DELETE CASCADE,
 FOREIGN KEY(connection_id,tag_id) REFERENCES contact_tags(connection_id,id) ON DELETE CASCADE
);
