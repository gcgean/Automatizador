CREATE TABLE IF NOT EXISTS demonstration_videos (
 id uuid PRIMARY KEY, connection_id text NOT NULL REFERENCES whatsapp_connections(id),
 product_id text, data jsonb NOT NULL, transcript text NOT NULL DEFAULT '', segments jsonb NOT NULL DEFAULT '[]',
 file_id uuid, published boolean NOT NULL DEFAULT false, version int NOT NULL DEFAULT 1,
 job_kind text, job_status text NOT NULL DEFAULT 'idle', job_attempts int NOT NULL DEFAULT 0,
 job_error text NOT NULL DEFAULT '', analysis_error text NOT NULL DEFAULT '', next_attempt_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(connection_id,product_id) REFERENCES commercial_products(connection_id,id)
);
CREATE INDEX IF NOT EXISTS demonstration_videos_jobs ON demonstration_videos(job_status,next_attempt_at);
CREATE TABLE IF NOT EXISTS demonstration_files (
 id uuid PRIMARY KEY, connection_id text NOT NULL REFERENCES whatsapp_connections(id),
 video_id uuid NOT NULL REFERENCES demonstration_videos(id), mime text NOT NULL, size bigint NOT NULL,
 sha256 text NOT NULL, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS demonstration_links (
 id uuid PRIMARY KEY, connection_id text NOT NULL, phone text NOT NULL, video_id uuid NOT NULL REFERENCES demonstration_videos(id),
 version int NOT NULL, start_seconds int NOT NULL DEFAULT 0, sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 FOREIGN KEY(connection_id,phone) REFERENCES leads(connection_id,phone)
);
CREATE INDEX IF NOT EXISTS demonstration_links_lead ON demonstration_links(connection_id,phone,video_id);
CREATE TABLE IF NOT EXISTS demonstration_events (
 link_id uuid NOT NULL REFERENCES demonstration_links(id), kind text NOT NULL CHECK(kind IN ('page_open','play','progress','complete')),
 progress int NOT NULL DEFAULT 0 CHECK(progress IN (0,25,50,75,100)), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(link_id,kind,progress)
);
