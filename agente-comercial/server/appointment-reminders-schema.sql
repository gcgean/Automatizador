CREATE TABLE IF NOT EXISTS appointment_reminder_settings (
 connection_id text PRIMARY KEY REFERENCES whatsapp_connections(id),enabled boolean NOT NULL DEFAULT false,
 template_name text NOT NULL DEFAULT 'lembrete_apresentacao_30min_v1',language text NOT NULL DEFAULT 'pt_BR',updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE appointment_reminder_settings ADD COLUMN IF NOT EXISTS activation_pending boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS agenda_booking_identity_idx ON agenda_bookings(id,connection_id,phone);
CREATE TABLE IF NOT EXISTS appointment_reminders (
 id uuid PRIMARY KEY,booking_id uuid NOT NULL UNIQUE,
 connection_id text NOT NULL REFERENCES whatsapp_connections(id),phone text NOT NULL,
 appointment_at timestamptz NOT NULL,due_at timestamptz NOT NULL,next_check_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','checking','sending','accepted','uncertain','skipped')),
 reason text,message_id text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(booking_id,connection_id,phone) REFERENCES agenda_bookings(id,connection_id,phone)
);
CREATE INDEX IF NOT EXISTS appointment_reminders_due_idx ON appointment_reminders(next_check_at) WHERE status='pending';
CREATE INDEX IF NOT EXISTS appointment_reminders_connection_idx ON appointment_reminders(connection_id,created_at DESC);
