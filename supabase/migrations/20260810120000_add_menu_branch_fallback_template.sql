-- Per-branch fallback response: when a guest lands on a branch (arriving via
-- an option's next_branch_key, or selecting an in-branch option directly)
-- and the resolved option has no template_key of its own, the branch's own
-- fallback_template_key is used instead of silently falling through to
-- Voiceflow. Unset (the default) means unchanged behavior -- still falls
-- through to Voiceflow, same as today.
--
-- Soft reference only, same pattern as menu_options.template_key: points at
-- a response_templates.template_key, not a DB-level FK, since
-- response_templates' natural key is (template_key, language) and template
-- lookup is per-language at read time.
-- See docs/db_planning/SOL_DB_Master_Plan_v1.0.md section 3 (webhook rewrite)
-- and section 9 (per-branch intro/fallback message).

alter table menu_branches add column fallback_template_key text;
