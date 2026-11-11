-- New order states. Run this file on its own, before 0003_operations.sql:
-- Postgres can't use a new enum value in the same transaction that adds it.

alter type order_status add value if not exists 'payment_failed' after 'pending_payment';
alter type order_status add value if not exists 'awaiting_documents' after 'processing';
alter type order_status add value if not exists 'approved' after 'in_review';
alter type order_status add value if not exists 'refunded' after 'cancelled';
