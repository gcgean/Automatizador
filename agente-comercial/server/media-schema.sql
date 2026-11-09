CREATE TABLE IF NOT EXISTS media_attachments(id uuid PRIMARY KEY,connection_id text NOT NULL REFERENCES whatsapp_connections(id),phone text NOT NULL,message_id text,request_id text,direction text NOT NULL,kind text NOT NULL,mime text NOT NULL,name text NOT NULL,size bigint,sha256 text,source_sha256 text,source_mime text,path text,meta_id text,state text NOT NULL DEFAULT 'pending',caption text NOT NULL DEFAULT '',transcript text,error text,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(connection_id,message_id,meta_id),UNIQUE(connection_id,request_id));
CREATE INDEX IF NOT EXISTS media_phone_idx ON media_attachments(connection_id,phone,created_at);

ALTER TABLE media_attachments ADD COLUMN IF NOT EXISTS source_sha256 text;
ALTER TABLE media_attachments ADD COLUMN IF NOT EXISTS source_mime text;
