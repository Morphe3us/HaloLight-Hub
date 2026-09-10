BEGIN;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE consumable_stock ADD COLUMN IF NOT EXISTS average_prints_per_event integer;
ALTER TABLE consumable_stock ADD COLUMN IF NOT EXISTS quantity_unit text;
ALTER TABLE consumable_stock ADD COLUMN IF NOT EXISTS average_events_per_month numeric(8,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS advance_amount numeric(12,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS responsibility_terms text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS breakdown_terms text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS postponement_terms text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS force_majeure_terms text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS privacy_terms text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS special_conditions text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS equipment_model text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS serial_number text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE IF NOT EXISTS user_dashboard_preferences (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  widgets jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  terms_version text NOT NULL, privacy_version text NOT NULL,
  terms_url text NOT NULL, privacy_url text NOT NULL,
  marketing boolean NOT NULL DEFAULT false,
  analytics boolean NOT NULL DEFAULT false,
  ai_improvement boolean NOT NULL DEFAULT false,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_consent_events_user_date_idx ON user_consent_events(user_id, accepted_at);
CREATE TABLE IF NOT EXISTS support_ticket_mail_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL UNIQUE REFERENCES support_tickets(id) ON DELETE CASCADE,
  payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  provider_message_id text, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz, claimed_at timestamptz
);
CREATE TABLE IF NOT EXISTS support_ticket_mail_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  outbox_id uuid NOT NULL REFERENCES support_ticket_mail_outbox(id) ON DELETE CASCADE,
  status text NOT NULL, attempt integer NOT NULL, detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_ticket_mail_history_ticket_idx ON support_ticket_mail_history(ticket_id, created_at);
-- Only the trusted server database role may access these records. In particular,
-- default Supabase Data API grants must not expose consent or email snapshots.
ALTER TABLE user_dashboard_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_mail_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_mail_history ENABLE ROW LEVEL SECURITY;
COMMIT;
