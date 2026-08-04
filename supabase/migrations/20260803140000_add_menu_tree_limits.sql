-- Adds SOL/Admin-owned, per-tenant-configurable ceilings for the Menu Tree
-- editor in tenant_tool: max branch depth below main_menu, and max options
-- per branch (WhatsApp's own interactive-list UI hard-caps at 10 rows). No
-- SOL/Admin UI to edit these yet (future work) -- columns exist ahead of
-- that control, defaulted to the values already decided in
-- docs/db_planning/SOL_DB_Master_Plan_v1.0.md section 5.

alter table property_settings
  add column menu_max_depth integer not null default 4,
  add column menu_max_children_per_branch integer not null default 10;
