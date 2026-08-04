-- Adds real per-venue team routing, replacing the never-built handoff_team_key
-- concept from the old source JSON with a proper FK (handoff_team_id ->
-- teams.id), matching the pattern cases.assigned_team_id already established
-- rather than resurrecting a loose text key. See
-- docs/db_planning/DB_Construction_Decisions_v0.1.md.

alter table venues add column handoff_team_id uuid references teams(id);

-- Backfill matches what the old source JSON quietly did: every venue's
-- handoff_team_key pointed at team_name_1 (Guest Services), regardless of
-- reservation status. team_name_1 -> Guest Services -> was ops_team -> is
-- now team_3 (see the team-routing generalization migration).
update venues v
set handoff_team_id = t.id
from teams t
where t.property_id = v.property_id
  and t.team_key = 'team_3'
  and v.handoff_team_id is null;
