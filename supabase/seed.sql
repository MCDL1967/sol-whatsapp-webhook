-- Minimal seed data: demo tenant + property anchors.
-- Matches placeholders resolved in docs/db_planning/Physical_Schema_v0.1.md.
-- Idempotent: safe to re-run.

insert into tenants (tenant_key, display_name, status)
values ('sol_demo', 'SOL Demo', 'active')
on conflict (tenant_key) do nothing;

insert into properties (tenant_id, property_key, display_name, timezone, status)
select t.id, 'demo', 'Your Casino', 'America/Panama', 'active'
from tenants t
where t.tenant_key = 'sol_demo'
on conflict (tenant_id, property_key) do nothing;

-- Venues, sourced from property_packages/demo/property_master_data.json's
-- `dining.venues` list (excluding Room Service, which is a service, not a
-- venue — see DB_Construction_Decisions_v0.1.md). `display_name` values
-- match webhook.js's KNOWN_RESERVATION_VENUES canonical strings exactly,
-- so supabase_bridge/supabase_client.js can resolve venue_id by exact match.
-- See docs/db_planning/whatsapp_db_logs_adaptation_v0.1.md for the venue_id fix.
insert into venues (property_id, venue_key, display_name, venue_type, reservation_enabled)
select p.id, v.venue_key, v.display_name, v.venue_type, v.reservation_enabled
from properties p
cross join (values
  ('la_brasserie',              'La Brasserie',                    'restaurant', true),
  ('fenicia',                   'Fenicia',                         'restaurant', true),
  ('larrys_sports_bar_terrace', 'Larry''s Sports Bar & Terrace',   'bar',        false),
  ('acua_pool_lounge_bar',      'Acua Pool Lounge & Bar',          'bar',        false),
  ('larrys_market',             'Larry''s Market',                 'amenity',    false),
  ('garden_lobby_bar',          'The Garden Lobby Bar',            'bar',        false)
) as v(venue_key, display_name, venue_type, reservation_enabled)
where p.tenant_id = (select id from tenants where tenant_key = 'sol_demo')
  and p.property_key = 'demo'
on conflict (property_id, venue_key) do nothing;
