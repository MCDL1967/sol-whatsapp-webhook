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
