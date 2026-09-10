-- Additive only. Run on an isolated test database first, then reviewed production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE kb_categories ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS source_key text;
ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS source_revision text;
ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS source_hash text;
ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS ai_eligible boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS kb_articles_source_key_unique ON kb_articles (source_key);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'kb_articles'::regclass
      AND conname = 'kb_articles_source_key_unique'
  ) THEN
    ALTER TABLE kb_articles ADD CONSTRAINT kb_articles_source_key_unique
      UNIQUE USING INDEX kb_articles_source_key_unique;
  END IF;
END $$;
COMMIT;
