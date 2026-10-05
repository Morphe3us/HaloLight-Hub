-- Performance indexes for frequent foreign-key / ownership filters.
-- Mirrors the index() declarations added in lib/db/src/schema (ai, quotes,
-- invoices, crm, support, community, uploads, resources).
--
-- Additive and idempotent: creates indexes only, never changes data.
-- CREATE INDEX CONCURRENTLY does not lock writes but CANNOT run inside a
-- transaction block, so this file intentionally has no BEGIN/COMMIT.
-- Apply with psql (each statement autocommits), e.g.:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrations/2026-10-05-performance-indexes.sql
-- In the Supabase SQL editor, run the statements one at a time.
-- If a CONCURRENTLY build fails it leaves an INVALID index: DROP INDEX
-- CONCURRENTLY <name>; then re-run the statement.
--
-- Already covered (no new index): quotes/invoices/contracts.user_id lead the
-- existing unique (user_id, *_number) indexes.

CREATE INDEX CONCURRENTLY IF NOT EXISTS ai_conversations_user_updated_idx ON ai_conversations (user_id, updated_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS ai_messages_conversation_created_idx ON ai_messages (conversation_id, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS quote_items_quote_idx ON quote_items (quote_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS invoice_items_invoice_idx ON invoice_items (invoice_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS lead_activities_lead_idx ON lead_activities (lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS support_ticket_replies_ticket_idx ON support_ticket_replies (ticket_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_posts_channel_idx ON community_posts (channel_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS community_replies_post_idx ON community_replies (post_id);
-- Equality-only lookups on unbounded text: hash avoids the btree row-size limit.
CREATE INDEX CONCURRENTLY IF NOT EXISTS uploads_file_url_idx ON uploads USING hash (file_url);
CREATE INDEX CONCURRENTLY IF NOT EXISTS resources_file_url_idx ON resources USING hash (file_url);
