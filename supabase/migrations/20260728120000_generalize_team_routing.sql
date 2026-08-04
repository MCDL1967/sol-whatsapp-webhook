-- dept_target stops being a fixed 3-value enum (FNB/SEC/OPS) and becomes a
-- vestigial free-text column mirroring team_key, satisfying NOT NULL only.
-- Real per-case routing/display moves to teams.team_key/display_name and
-- cases.assigned_team_id, which already existed but nothing wrote to.
-- See docs/db_planning/DB_Construction_Decisions_v0.1.md and the plan this
-- migration was built from (arbitrary per-tenant team routing, 2026-07-28).

do $$
declare
  con record;
begin
  for con in
    select conname, conrelid::regclass as tbl
    from pg_constraint
    where conrelid in ('teams'::regclass, 'cases'::regclass)
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%dept_target%'
  loop
    execute format('alter table %s drop constraint %I', con.tbl, con.conname);
  end loop;
end $$;

-- One-time rename of the 3 existing demo teams' backend keys to generic
-- team_N form. display_name/scope/id untouched.
update teams set team_key = 'team_1' where team_key = 'fnb_team';
update teams set team_key = 'team_2' where team_key = 'sec_team';
update teams set team_key = 'team_3' where team_key = 'ops_team';
