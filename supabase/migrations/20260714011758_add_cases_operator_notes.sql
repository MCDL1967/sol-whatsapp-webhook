-- Adds a staff-authored notes field to cases, needed for the LOGS dashboard's
-- direct-Supabase integration. See docs/db_planning/whatsapp_db_logs_adaptation_v0.1.md.

alter table cases add column operator_notes text;
comment on column cases.operator_notes is 'Staff-authored free text. Never written by the webhook.';
